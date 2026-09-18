# Twenty CRM — core workspace

This checkout contains the Twenty CRM frontend, API, database migrations, and
supporting workspace packages.

## Run locally on Windows without Docker

Install these local services first:

- Node.js 24 and npm.
- PostgreSQL 16, listening on port `5432`. PostgreSQL 18 may also work; use its
  actual username, password, and port in the connection URL below.
- Redis 7 or a Redis-compatible service, listening on port `6379`. On Windows,
  Memurai Developer is one option. Its installer needs administrator access,
  and the free developer service must be restarted after 10 days of continuous
  uptime. Redis can also run inside WSL.

Then, from the repository root:

```powershell
npm ci
if (-not (Test-Path packages/twenty-server/.env)) {
  Copy-Item packages/twenty-server/.env.example packages/twenty-server/.env
}
```

Edit `packages/twenty-server/.env` and set `PG_DATABASE_URL` to match your local
PostgreSQL credentials. The account must be allowed to create databases; the
first run creates the `default` database. URL-encode reserved characters in
the password (for example, `@` becomes `%40`). For example:

```dotenv
PG_DATABASE_URL=postgres://postgres:YOUR_PASSWORD@127.0.0.1:5432/default
REDIS_URL=redis://127.0.0.1:6379
```

Start PostgreSQL and Redis/Memurai, then run:

```powershell
npm run dev
```

The local dev command does not start Docker. The frontend is available at
[http://localhost:3001](http://localhost:3001), and the API at
`http://localhost:3002`. Keep the terminal open while developing; press
`Ctrl+C` to stop the app. The first run initializes the development database.

The frontend is in `packages/twenty-front`; the API and database migrations are
in `packages/twenty-server`.
