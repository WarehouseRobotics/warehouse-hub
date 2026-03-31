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

## Useful Commands

```bash
npm install
npm run db:init
npm run dev
npm run cli -- company-card get
```

The API listens on `http://localhost:3100` by default and uses `/api/v1` as the REST base path.
