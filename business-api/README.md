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


# Docker container

For security, we build and run the app stack in a Docker container during development.

To build and run the app in the foreground use (in the business-api folder):

`docker compose up --build` or simply `./container.sh build` (which will do the same)

The container script allows executing arbitary shell code inside of the container via `./container.sh exec`


## Useful Commands

During development, this commands must be run inside of the Docker container, via our wrapper script, e.g.: `./container.sh exec npm run test`

```bash
./container.sh exec npm install
./container.sh exec npm run db:init
./container.sh exec npm run dev
./container.sh exec npm run cli -- company-card get
```

The API listens on `http://localhost:3100` by default and uses `/api/v1` as the REST base path.
