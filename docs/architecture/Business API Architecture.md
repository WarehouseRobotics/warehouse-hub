# Business API Architecture

* Node.js (Typescript)
* Express.js
* SQLite for database with asg017/sqlite-vec for vector storage
* zod
* MCP SDK

Dev tools:

* Vitest
* ESLint + prettier


## Development environment

Two ways to run locally: directly and Docker.

We're developing this in two distinct environments - local laptop and a Raspberry Pi, which simulates the target deployment. 

For running and testing on the local laptop we'll need to have a Docker setup, so a docker-compose setup must be prepared.