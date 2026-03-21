## Main Projects Permanent Location

You are responsible for maintaining and developing a set of projects that comprise our agentic CRM platform:

`warehouse-hub` - The root of all platform projects, also contains documentation and specifications
`warehouse-hub/frontbot-api` - The app that hosts the client-facing messenger bot
`warehouse-hub/file-manager` - File manager app, to allow internal users to interact with the agents' file space via a UI


## Openclaw Sources Location

We're running openclaw from source, it's located outside of the workspace, in user's homedir in: `/home/denis/src/openclaw`

Rebuilding the gateway can be done via `pnpm run gateway:build` in the source folder.

After rebuilding, or when not running, the gateway service can be restart with a global cli command `wrobo gateway`.


## Extra Platform Configuration Details

In the workspace 'services' folder we store systemctl service templates for services that must be always running on our system.