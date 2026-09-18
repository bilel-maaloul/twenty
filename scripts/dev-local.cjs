const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getDevEnvironment, parsePostgresUrl, workspaceRoot } = require('./dev-environment.cjs');

const nxCli = path.join(workspaceRoot, 'node_modules/nx/dist/bin/nx.js');
const hasFlag = (flag) => process.argv.includes(flag);

const checkService = (label, host, port, installHint) =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: Number(port) });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${label} at ${host}:${port} did not respond.`));
    }, 1800);

    socket.once('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve();
    });

    socket.once('error', () => {
      clearTimeout(timeout);
      reject(new Error(`${label} is not listening at ${host}:${port}. ${installHint}`));
    });
  });

const run = async () => {
  const environment = getDevEnvironment();
  const postgres = parsePostgresUrl(environment.PG_DATABASE_URL);
  const redis = new URL(environment.REDIS_URL);

  if (!['redis:', 'rediss:'].includes(redis.protocol)) {
    throw new Error('REDIS_URL must use the redis:// or rediss:// protocol.');
  }

  if (!['localhost', '127.0.0.1', '::1'].includes(redis.hostname.replace(/^\[|\]$/g, ''))) {
    throw new Error(
      'The local development command only connects to Redis on this PC. Set REDIS_URL to localhost in packages/twenty-server/.env.',
    );
  }

  if (!fs.existsSync(nxCli)) {
    throw new Error('Dependencies are not installed. Run `npm ci` from the repository root first.');
  }

  await checkService(
    'PostgreSQL',
    postgres.host,
    postgres.port,
    'Install/start PostgreSQL and set PG_DATABASE_URL in packages/twenty-server/.env.',
  );

  if (!hasFlag('--setup-only')) {
    await checkService(
      'Redis',
      redis.hostname.replace(/^\[|\]$/g, ''),
      redis.port || '6379',
      'Install/start a Redis-compatible server (for example Memurai on Windows) on port 6379.',
    );
  }

  if (!hasFlag('--skip-db-setup')) {
    const setup = spawnSync(
      process.execPath,
      [path.join(__dirname, 'ensure-dev-database.cjs')],
      { cwd: workspaceRoot, env: environment, stdio: 'inherit' },
    );
    if (setup.error) throw setup.error;
    if (setup.status !== 0) process.exit(setup.status ?? 1);
  }

  if (hasFlag('--setup-only')) return;

  const projects = hasFlag('--server-only')
    ? 'twenty-server'
    : 'twenty-server,twenty-front';
  console.log(`Starting ${projects} against local PostgreSQL and Redis (no Docker)...`);

  const start = spawnSync(
    process.execPath,
    [nxCli, 'run-many', '--target=start', `--projects=${projects}`, '--parallel=2'],
    {
      cwd: workspaceRoot,
      env: {
        ...environment,
        REACT_APP_SERVER_BASE_URL: 'http://localhost:3002',
      },
      stdio: 'inherit',
    },
  );

  if (start.error) throw start.error;
  process.exit(start.status ?? 1);
};

run().catch((error) => {
  console.error(`\nLocal development could not start: ${error.message}`);
  process.exit(1);
});
