# OpenClaw Control API

A minimal HTTP server that exposes the `wrobohub-openclaw-cli` script over a local REST endpoint. It is used by the internal agent team to invoke OpenClaw CLI commands programmatically without requiring direct shell access.

## How it works

`main.py` is a zero-dependency Python 3 HTTP server (stdlib only). On each authenticated `POST /openclaw/cli` request it runs `../bin/wrobohub-openclaw-cli` as a subprocess, forwarding the provided arguments, and returns the process output as JSON.

The CLI script path is always resolved relative to `main.py` itself, so the server works correctly regardless of the working directory it is launched from.

## Endpoint

### `POST /openclaw/cli`

**Request body** — a JSON array of strings passed verbatim as arguments to the CLI:

```json
["agent", "--agent", "chatbot", "--message", "Hello", "--deliver"]
```

**Response** — JSON object with the subprocess result:

```json
{
  "exit_code": 0,
  "stdout": "...",
  "stderr": "..."
}
```

**Error responses:**

| Status | Meaning |
|--------|---------|
| 400 | Body is not a JSON array of strings |
| 401 | Missing or invalid `Authorization` header |
| 404 | Unknown path |
| 500 | CLI process could not be launched |

## Authentication

Every request must include a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

The token is validated against `OPENCLAW_GATEWAY_TOKEN` read from `$HOME/.openclaw/.env` on each request (so token rotations take effect immediately without a restart).

## Configuration

| Environment variable | Default | Description |
|----------------------|---------|-------------|
| `OPENCLAW_CONTROL_API_HOST` | `127.0.0.1` | Interface to bind to |
| `OPENCLAW_CONTROL_API_PORT` | `8181` | Port to listen on |

## Running manually

```bash
python3 openclaw-control-api/main.py
```

## systemd service

The server is managed by a user-level systemd service defined at:

```
openclaw/system-image/userhome/.config/systemd/user/openclaw-control-api.service
```

The service file is part of the OpenClaw system image and is installed into the user's systemd directory on the target machine. Key properties:

- **Type:** `simple` — the process is the server itself
- **WorkingDirectory:** `~/.openclaw/workspace-hub-dev/warehouse-hub/openclaw-control-api`
- **Restart:** `on-failure` with a 5-second back-off
- **Logs:** written to the systemd journal under the identifier `openclaw-control-api`; view with `journalctl --user -u openclaw-control-api`
- Sets `OPENCLAW_FORCE_NO_BUILD=1` so the CLI skips any build step on every invocation

### Useful service commands

```bash
# Start / stop / restart
systemctl --user start openclaw-control-api
systemctl --user stop openclaw-control-api
systemctl --user restart openclaw-control-api

# Enable on login
systemctl --user enable openclaw-control-api

# Follow live logs
journalctl --user -u openclaw-control-api -f
```
