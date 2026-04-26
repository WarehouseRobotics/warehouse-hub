# OpenClaw HTTP Control API

The OpenClaw control API lets services invoke `wrobohub-openclaw-cli` over HTTP instead of spawning the CLI wrapper script from a shell.

In Warehouse Hub, the main use-case is that `business-api` runs inside a Docker container, while the OpenClaw gateway runs on the host system. The control API is the bridge between them: `business-api` can call this local HTTP wrapper on the host, and the wrapper then executes `wrobohub-openclaw-cli` against the running host-side OpenClaw setup.

Inside the `business-api` container, `OPENCLAW_CONTROL_API_HOST` will usually be set to `host.docker.internal`

That lets containerized code reach the host machine directly. The main exception is when the OpenClaw gateway and its control API are themselves running in another container, in which case `OPENCLAW_CONTROL_API_HOST` should point at that container or service instead.

## Typical use-case

A common pattern is:

1. `business-api` decides it needs help from an OpenClaw agent.
2. `business-api` sends an authenticated HTTP request to the control API.
3. The control API runs `wrobohub-openclaw-cli ...` on the host.
4. OpenClaw processes the command and can reply back through a configured channel such as Slack.

Example: ask an internal agent to prepare a response and deliver it back to the user as a Slack DM.

HTTP form:

`POST $OPENCLAW_CONTROL_API_HOST/openclaw/cli` with payload:

```json
[
  "agent",
  "--agent",
  "accounting",
  "--message",
  "Let the user know most recent EUR/USD exchange rate and how it changed in the past week (just a summary) and reply in DM via Slack",
  "--deliver",
  "--reply-channel",
  "slack",
  "--reply-to",
  "user:UXXXXXXXX",
]
```

CLI form:

```bash
wrobohub-openclaw-cli agent --agent $HUB_ACCOUNTING_AGENT --message "Let the user know most recent EUR/USD exchange rate and how it changed in the past week (just a summary) and reply in DM via Slack" --deliver --reply-channel slack --reply-to "user:UXXXXXXXX"
```

## What it does

The server in [openclaw-control-api/main.py](/Users/denis/src/warehouse-hub/openclaw-control-api/main.py) exposes one endpoint:

- `POST /openclaw/cli`

Each request body is forwarded as raw CLI arguments to `wrobohub-openclaw-cli`, and the HTTP response returns the subprocess exit code plus captured stdout and stderr.

Important behavior:

- The request body is a JSON array of strings.
- Each array item becomes one CLI argument.
- There is no shell parsing, quoting, piping, or environment expansion.
- The API does not define a separate OpenClaw RPC schema; it is a transport wrapper around the CLI contract.


## Default address

Unless configured otherwise, the server listens on:

```text
http://127.0.0.1:8181
```

Runtime configuration:

- `OPENCLAW_CONTROL_API_HOST`: bind host, default `127.0.0.1`
- `OPENCLAW_CONTROL_API_PORT`: bind port, default `8181`

For callers inside Docker, the target base URL is often:

```text
http://host.docker.internal:8181
```

if the control API is running directly on the host machine.

## Authentication

Every request must include:

```text
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
```

The token is read from:

```text
$HOME/.openclaw/.env
```

Specifically, the server validates against `OPENCLAW_GATEWAY_TOKEN`.

## Request format

### Endpoint

```http
POST /openclaw/cli
Content-Type: application/json
Authorization: Bearer <token>
```

### Body

JSON array of strings:

```json
["sessions", "--all-agents", "--json"]
```

This is equivalent to running:

```bash
wrobohub-openclaw-cli sessions --all-agents --json
```

## Response format

Successful requests always return HTTP `200` if the wrapper process itself was launched, even when the CLI command failed.

Response body:

```json
{
  "exit_code": 0,
  "stdout": "...",
  "stderr": ""
}
```


## Calling the API

Example with `curl`:

```bash
TOKEN="$(grep '^OPENCLAW_GATEWAY_TOKEN=' ~/.openclaw/.env | cut -d= -f2- | tr -d '\"')"

curl -sS \
  -X POST http://host.docker.internal:8181/openclaw/cli \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["sessions","--all-agents","--json"]'
```

Example response:

```json
{
  "exit_code": 0,
  "stdout": "{\n  \"path\": null,\n  \"stores\": []\n}\n",
  "stderr": ""
}
```

## More HTTP API examples

### List sessions

```bash
curl -sS \
  -X POST http://host.docker.internal:8181/openclaw/cli \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["sessions","--all-agents","--json"]'
```

### Send an agent turn

```bash
curl -sS \
  -X POST http://host.docker.internal:8181/openclaw/cli \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["agent","--agent","chatbot","--message","Hello","--deliver"]'
```

### Ask an agent to reply to the user in Slack DM

```bash
curl -sS \
  -X POST http://host.docker.internal:8181/openclaw/cli \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["agent","--agent","accounting","--message","Let the user know most recent EUR/USD exchange rate and how it changed in the past week (just a summary) and reply in DM via Slack","--deliver","--reply-channel","slack"]'
```

### Enqueue a system event

```bash
curl -sS \
  -X POST http://host.docker.internal:8181/openclaw/cli \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["system","event","--text","Check for urgent follow-ups","--mode","now"]'
```

### Send a channel message

```bash
curl -sS \
  -X POST http://host.docker.internal:8181/openclaw/cli \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '["message","send","--channel","slack","--target","channel:C123","--message","Hello from the control API"]'
```

## Notes for developers

- This API is intended as a bridge between local Warehouse Hub components, especially containerized `business-api` code and a host-side OpenClaw runtime, not as a public internet-facing API.
- Because `stdout` and `stderr` are returned as strings, callers should parse `stdout` themselves when using CLI commands with `--json`.
- The HTTP wrapper preserves the CLI command surface, so new CLI flags and subcommands usually do not require HTTP API changes.
- Unknown or invalid CLI arguments are handled by the underlying CLI process, not by the HTTP wrapper.

## Related docs

- [OpenClaw CLI wrapper](/Users/denis/src/warehouse-hub/docs/openclaw/cli.md)