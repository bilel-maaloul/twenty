# Start Twenty on Windows without Docker

Install Node.js 24, PostgreSQL 16, and Redis 7 (or a Redis-compatible service).
PostgreSQL 18 may work too if you use its credentials and port in the connection
URL. Both services must be reachable locally: PostgreSQL on port `5432` and
Redis on port `6379`.

For a native Windows Redis-compatible service, you can install Memurai Developer
with an administrator PowerShell:

```powershell
winget install --id Memurai.MemuraiDeveloper --exact
```

The free developer service needs a restart after 10 days of continuous uptime.
Redis in WSL is another option.

From the repository root, install dependencies and create the local server
configuration:

```powershell
npm ci
if (-not (Test-Path packages/twenty-server/.env)) {
  Copy-Item packages/twenty-server/.env.example packages/twenty-server/.env
}
```

Edit `packages/twenty-server/.env` and set `PG_DATABASE_URL` to your PostgreSQL
username, password, and port. The database user must be allowed to create a
database; the first run creates `default`. URL-encode reserved password
characters (for example, `@` becomes `%40`). For the defaults above, use:

```dotenv
PG_DATABASE_URL=postgres://postgres:YOUR_PASSWORD@127.0.0.1:5432/default
REDIS_URL=redis://127.0.0.1:6379
```

Start PostgreSQL and Redis/Memurai, then run:

```powershell
npm run dev
```

This command runs the app directly on your computer and does not start Docker.
The first run initializes the development database. Open
[http://localhost:3001](http://localhost:3001); the API uses port `3002`. Keep
the terminal open while developing and press `Ctrl+C` to stop the app.
