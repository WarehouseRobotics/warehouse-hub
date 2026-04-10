# Warehouse Platform Hub 

Multi-project repository of the Warehouse Robotics Hub Solution - an agentic CRM platform for businesses for SMEs.

## Platform Components

The platform is composed of: 

* Business API: foundational Business API that provides model abstraction for objects like users, companies, etc and deterministic (non-LLM) business logic operations, typical for any small business management software (in the `business-api` folder)
* Dashboard: and configuration GUI webapp (in the `dashboard` folder, has a separate submodule repo)
* an internal team of agents running on OpenClaw (in the `openclaw` folder)
    * Agent team
        * Hub-developer agent that can extend the frontend bot system and make changes to the internal OpenClaw setup
        * Marketing agent that can can help with marketing tasks, perform research via API and browser-based tools, generate media assets, etc
        * Accounting agent, to help businesses run their accounts and manage incoming and outgoing invoices, with skills for different countries
        * Business management and advisor agent
    * The agents use the foundational Business API as MCP and CLI tool calls to help manage the business, CRM, accounting and so on
* externally available frontend bot, that can be managed and extended by the internal team of agents
* file assets exchange GUI webapp     


## Source Code Documentation 

The `docs` folder contains Markdown documentation for each platform component – use it to search for relevant code design rules, feature architecture and other useful information about Warehouse Hub.

## Shared Business Schemas

Shared Zod schemas for business object contracts (like invoices, expenses, contacts, tasks, etc.) are stored in the repo-level package at `packages/business-schemas`.

Use this package when a business type schema must be shared between subprojects such as `business-api` and `dashboard`. Keep ORM-specific or backend-specific types inside the owning subproject.


## Development Environment Conventions

### Run in Docker

For security, we build and run the app stack in a Docker container during development.

All code projects have a "./container.sh" file that provides a common interface to the Docker container with the app.

To build and run the app in the foreground use (for example, in the business-api folder):

`docker compose up --build` or simply `./container.sh build` (which will do the same)

The container script allows executing arbitary shell code inside of the container via `./container.sh exec`


### Useful Container Script Commands

During development, this commands must be run inside of the Docker container, via our wrapper script, e.g.: `./container.sh exec npm run test`

```bash
./container.sh exec npm install
./container.sh exec npm run dev # start a dev server
./container.sh exec npm run cli -- company-card get # run a business-api cli tool and output the result
```

### Logging

The `business-api` uses `winston` for structured JSON logging. Operational logs from the API server, background processing, database fallback paths, and development scripts are emitted as JSON records and controlled with `LOG_LEVEL`.

CLI command results still print their business payloads as JSON on stdout so they remain easy to pipe into other tools. Diagnostic logs are emitted separately via Winston.