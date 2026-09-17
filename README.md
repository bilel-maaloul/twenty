# Twenty CRM — core workspace

This is a lean CRM-only checkout. It keeps the React application, NestJS API,
database migrations, supporting workspace libraries, integration assets, and
Docker deployment files required to run the CRM.

## Run with Docker

Start Docker Desktop, then run:

```powershell
npm run dev
```

The application is available at [http://localhost:3001](http://localhost:3001).
PostgreSQL and Redis run in Docker. Stop the watcher with `Ctrl+C`, and stop
containers with:

```powershell
docker compose down
```

## Run on the host

Install the locked dependencies, start the local database services, and run the
frontend and API together:

```powershell
npm ci
npm run dev:host
```

The CRM frontend is in `packages/twenty-front` and the API, CRUD logic, and
migrations are in `packages/twenty-server`.
