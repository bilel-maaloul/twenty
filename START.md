# Develop Twenty with Docker

Start Docker Desktop with [Docker Compose v2.22.0 or newer](https://docs.docker.com/compose/how-tos/file-watch/). Node.js/npm are needed only to run the `npm` command; dependencies, PostgreSQL, and Redis run inside Docker. Do not run `npm install` locally.

From the project folder, run:

```powershell
npm run dev
```

On first run this builds the Docker image and installs dependencies in it. It opens the app at [http://localhost:3001](http://localhost:3001), then watches your source files. Keep the terminal open while developing. Changes sync into the container, where the frontend and server dev processes reload as needed; ordinary source edits do not rebuild the image. Dependency manifest changes trigger an image rebuild.

To stop the watcher, press `Ctrl+C`. To stop the Docker containers:

```powershell
docker compose down
```

## Logs

```powershell
docker compose logs -f app
```
