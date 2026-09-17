const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..');
const isDockerDev = process.env.TWENTY_DOCKER_DEV === 'true';
const composeFile = path.join(
  workspaceRoot,
  'packages/twenty-docker/docker-compose.dev.yml',
);

const isDatabaseInitialized = () => {
  const output = isDockerDev
    ? execFileSync(
        'psql',
        [
          '-h',
          'db',
          '-U',
          'postgres',
          '-d',
          'default',
          '-tAc',
          `SELECT to_regclass('core."appToken"') IS NOT NULL;`,
        ],
        {
          cwd: workspaceRoot,
          encoding: 'utf8',
          env: { ...process.env, PGPASSWORD: 'postgres' },
        },
      )
    : execFileSync(
        'docker',
        [
          'compose',
          '-f',
          composeFile,
          'exec',
          '-T',
          'db',
          'psql',
          '-U',
          'postgres',
          '-d',
          'default',
          '-tAc',
          `SELECT to_regclass('core."appToken"') IS NOT NULL;`,
        ],
        { cwd: workspaceRoot, encoding: 'utf8' },
      );

  return output.trim() === 't';
};

if (isDatabaseInitialized()) {
  console.log('Docker database is already initialized.');
  process.exit(0);
}

console.log('Initializing the Docker database...');

const nxCli = path.join(workspaceRoot, 'node_modules/nx/dist/bin/nx.js');
const migrationEnvironment = {
  ...process.env,
  NODE_ENV: 'development',
  NODE_PORT: '3002',
  PG_DATABASE_URL: isDockerDev
    ? 'postgres://postgres:postgres@db:5432/default'
    : 'postgres://postgres:postgres@localhost:5433/default',
  REDIS_URL: isDockerDev ? 'redis://redis:6379' : 'redis://localhost:6380',
  APP_SECRET: 'twenty-local-dev-secret',
  SIGN_IN_PREFILLED: 'true',
  IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS: 'false',
  FRONTEND_URL: 'http://localhost:3001',
};

const migration = spawnSync(
  process.execPath,
  [nxCli, 'run', 'twenty-server:database:init'],
  {
    cwd: workspaceRoot,
    env: migrationEnvironment,
    stdio: 'inherit',
  },
);

process.exit(migration.status ?? 1);
