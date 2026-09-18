const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  getDevEnvironment,
  parsePostgresUrl,
  workspaceRoot,
} = require('./dev-environment.cjs');

const isDockerDev = process.env.TWENTY_DOCKER_DEV === 'true';
const nxCli = path.join(workspaceRoot, 'node_modules/nx/dist/bin/nx.js');

const findPsql = () => {
  if (process.env.PSQL_PATH && fs.existsSync(process.env.PSQL_PATH)) {
    return process.env.PSQL_PATH;
  }

  const lookup = spawnSync(
    process.platform === 'win32' ? 'where.exe' : 'which',
    ['psql'],
    { encoding: 'utf8', windowsHide: true },
  );
  if (lookup.status === 0) {
    const found = lookup.stdout.split(/\r?\n/).find((entry) => entry.trim());
    if (found) return found.trim();
  }

  if (process.platform === 'win32') {
    for (const programFiles of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (!programFiles) continue;
      const postgresRoot = path.join(programFiles, 'PostgreSQL');
      if (!fs.existsSync(postgresRoot)) continue;

      const versions = fs
        .readdirSync(postgresRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

      for (const version of versions) {
        const candidate = path.join(postgresRoot, version, 'bin', 'psql.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  throw new Error(
    'Could not find psql. Add PostgreSQL\'s bin folder to PATH, or set PSQL_PATH to the full path of psql.exe.',
  );
};

const escapeSqlLiteral = (value) => `'${value.replace(/'/g, "''")}'`;
const escapeSqlIdentifier = (value) => `"${value.replace(/"/g, '""')}"`;

const runPsql = ({ executable, environment, connection, database, sql }) => {
  const result = spawnSync(
    executable,
    [
      '--no-psqlrc',
      '--no-password',
      '--host',
      connection.host,
      '--port',
      connection.port,
      '--username',
      connection.username,
      '--dbname',
      database,
      '--tuples-only',
      '--no-align',
      '--command',
      sql,
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: {
        ...environment,
        ...(connection.password ? { PGPASSWORD: connection.password } : {}),
        ...(connection.sslmode ? { PGSSLMODE: connection.sslmode } : {}),
      },
      windowsHide: true,
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || '').trim();
    throw new Error(`psql failed${details ? `: ${details}` : '.'}`);
  }

  return result.stdout.trim();
};

const ensureNativeDatabase = (environment) => {
  const executable = findPsql();
  const connection = parsePostgresUrl(environment.PG_DATABASE_URL);
  const exists = runPsql({
    executable,
    environment,
    connection,
    database: 'postgres',
    sql: `SELECT 1 FROM pg_database WHERE datname = ${escapeSqlLiteral(connection.database)};`,
  });

  if (exists !== '1') {
    console.log(`Creating local PostgreSQL database "${connection.database}"...`);
    runPsql({
      executable,
      environment,
      connection,
      database: 'postgres',
      sql: `CREATE DATABASE ${escapeSqlIdentifier(connection.database)};`,
    });
  }

  const initialized = runPsql({
    executable,
    environment,
    connection,
    database: connection.database,
    sql: `SELECT to_regclass('core."appToken"') IS NOT NULL;`,
  });

  return initialized === 't';
};

const ensureDockerDatabase = () => {
  const result = spawnSync(
    'psql',
    [
      '--no-psqlrc',
      '--no-password',
      '--host',
      'db',
      '--username',
      'postgres',
      '--dbname',
      'default',
      '--tuples-only',
      '--no-align',
      '--command',
      `SELECT to_regclass('core."appToken"') IS NOT NULL;`,
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: 'postgres' },
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not check the Docker database: ${(result.stderr || '').trim()}`);
  }
  return result.stdout.trim() === 't';
};

const runMigrations = (environment) => {
  if (!fs.existsSync(nxCli)) {
    throw new Error('Dependencies are not installed. Run `npm ci` from the repository root first.');
  }

  const migrationEnvironment = isDockerDev
    ? {
        ...environment,
        PG_DATABASE_URL: 'postgres://postgres:postgres@db:5432/default',
        REDIS_URL: 'redis://redis:6379',
      }
    : environment;

  console.log(isDockerDev ? 'Initializing the Docker database...' : 'Initializing the local database...');
  const migration = spawnSync(
    process.execPath,
    [nxCli, 'run', 'twenty-server:database:init'],
    {
      cwd: workspaceRoot,
      env: migrationEnvironment,
      stdio: 'inherit',
    },
  );

  if (migration.error) throw migration.error;
  process.exit(migration.status ?? 1);
};

try {
  const environment = isDockerDev ? process.env : getDevEnvironment();

  if (!fs.existsSync(nxCli)) {
    throw new Error('Dependencies are not installed. Run `npm ci` from the repository root first.');
  }

  const initialized = isDockerDev
    ? ensureDockerDatabase()
    : ensureNativeDatabase(environment);

  if (initialized) {
    console.log(isDockerDev ? 'Docker database is already initialized.' : 'Local database is already initialized.');
    process.exit(0);
  }

  runMigrations(environment);
} catch (error) {
  console.error(`\nDatabase setup failed: ${error.message}`);
  process.exit(1);
}
