const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..');
const serverEnvPath = path.join(
  workspaceRoot,
  'packages/twenty-server/.env',
);

const parseEnvFile = (contents) => {
  const variables = {};

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
    if (!match) continue;

    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    variables[match[1]] = value;
  }

  return variables;
};

const readServerEnv = () => {
  if (!fs.existsSync(serverEnvPath)) return {};
  return parseEnvFile(fs.readFileSync(serverEnvPath, 'utf8'));
};

const getDevEnvironment = () => ({
  NODE_ENV: 'development',
  NODE_PORT: '3002',
  PG_DATABASE_URL:
    'postgres://postgres:postgres@127.0.0.1:5432/default',
  REDIS_URL: 'redis://127.0.0.1:6379',
  APP_SECRET: 'twenty-local-dev-secret',
  SIGN_IN_PREFILLED: 'true',
  IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS: 'false',
  FRONTEND_URL: 'http://localhost:3001',
  ...process.env,
  // The server itself loads this file with dotenv's override option.
  ...readServerEnv(),
  // Prevent an inherited Compose setting from redirecting the local setup.
  TWENTY_DOCKER_DEV: 'false',
});

const parsePostgresUrl = (connectionString) => {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('PG_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('PG_DATABASE_URL must use the postgres:// protocol.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      `The local development command only connects to PostgreSQL on this PC; PG_DATABASE_URL points to "${host}". Set a localhost URL in packages/twenty-server/.env.`,
    );
  }

  return {
    host,
    port: url.port || '5432',
    username: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'default'),
    sslmode: url.searchParams.get('sslmode'),
  };
};

module.exports = {
  getDevEnvironment,
  parsePostgresUrl,
  serverEnvPath,
  workspaceRoot,
};
