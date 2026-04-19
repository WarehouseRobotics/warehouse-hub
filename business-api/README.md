# Warehouse Hub Business API

This is the main underlying API that provides data persistent and business logic the CRM/ERP/Accounting features that can be used by Hub AI agents and users individually or in collaboration. 

See the [Business Foundation API.md](../docs/apps/Business Foundation API.md) doc file for more.

## Current Scaffold

The initial iteration now includes:

* Node.js + TypeScript project bootstrap
* Express API server scaffold under `src/`
* CLI entrypoint in `src/cli.ts`
* SQLite initialization and first SQL migration
* Drizzle ORM schema definitions for the MVP business objects
* Working `company-card` and `contacts` services/routes as the first vertical slices
* Winston-based structured JSON logging for server/runtime diagnostics

## Shared Types 

Shared Zod schemas for business object contracts are stored in the repo-level package at `packages/business-schemas`.

# Docker container

For security, we run the app stack in a Docker container during development.

The development container bind-mounts the local `business-api` folder into `/app`, so source code changes on the host are visible immediately inside the container. The container keeps `node_modules` in its own Docker volume so host and container dependencies do not conflict.

To build the image and run the app in the foreground use (in the business-api folder):

`docker compose up --build` or simply `./container.sh build` (which will do the same)

The container script allows executing arbitary shell code inside of the container via `./container.sh exec`

After the first build, `./container.sh start` starts the same live-mounted development container without rebuilding, and `./container.sh restart` recreates it using the current image.

The helper script also ensures the shared Docker network `warehouse-hub` exists so the dashboard container can reach the API container by Docker DNS while both services remain publicly available on their host ports.


## Useful Commands

During development, these commands must be run inside of the Docker container, via our wrapper script, e.g.: `./container.sh exec npm run test`

```bash
./container.sh exec npm install
./container.sh exec npm run db:init
./container.sh exec npm run dev
./container.sh exec npm run cli -- company-card get
./container.sh exec npm run dev:setup-default-company-card
```

To seed a default test company card for local development, run `./container.sh exec npm run dev:setup-default-company-card`. The command initializes the database if needed and then idempotently creates or updates the default company card with Spanish `S.L.` style demo data.

Rebuild the image with `./container.sh build` when Docker-level dependencies change, such as updates to the `Dockerfile` or native packages required by npm modules.

The API listens on `http://localhost:3100` by default and uses `/api/v1` as the REST base path.

## Logging

The Business API uses `winston` for structured JSON logging. This applies to server startup, operational warnings, and development script failures.

Set `LOG_LEVEL` to one of `debug`, `info`, `warn`, or `error` to control verbosity.
