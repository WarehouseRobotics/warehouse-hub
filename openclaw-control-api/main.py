# Control API wrapper for the openclaw gateway
# Allows invoking CLI gateway commands via a simple HTTP POST request

import json
import os
import pathlib
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

_THIS_DIR = pathlib.Path(__file__).parent.resolve()
_CLI_SCRIPT = (_THIS_DIR / ".." / "bin" / "wrobohub-openclaw-cli").resolve()

_ENV_FILE = pathlib.Path.home() / ".openclaw" / ".env"
_HOST = os.environ.get("CONTROL_API_HOST", "127.0.0.1")
_PORT = int(os.environ.get("CONTROL_API_PORT", "8181"))


def _load_gateway_token() -> str:
    """Parse OPENCLAW_GATEWAY_TOKEN from $HOME/.openclaw/.env."""
    if not _ENV_FILE.exists():
        raise RuntimeError(f"env file not found: {_ENV_FILE}")
    with _ENV_FILE.open() as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() == "OPENCLAW_GATEWAY_TOKEN":
                return value.strip().strip('"').strip("'")
    raise RuntimeError("OPENCLAW_GATEWAY_TOKEN not found in " + str(_ENV_FILE))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # suppress default access log noise
        pass

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _authenticate(self) -> bool:
        auth = self.headers.get("Authorization", "")
        prefix = "Bearer "
        token = auth[len(prefix):].strip() if auth.startswith(prefix) else auth.strip()
        try:
            expected = _load_gateway_token()
        except RuntimeError as exc:
            print(f"[control-api] token load error: {exc}")
            return False
        return token == expected

    def do_POST(self) -> None:
        if self.path != "/openclaw/cli":
            self._send_json(404, {"error": "not found"})
            return

        if not self._authenticate():
            self._send_json(401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, ValueError):
            self._send_json(400, {"error": "invalid JSON"})
            return

        if not isinstance(body, list) or not all(isinstance(a, str) for a in body):
            self._send_json(400, {"error": "body must be a JSON array of strings"})
            return

        try:
            result = subprocess.run(
                [str(_CLI_SCRIPT)] + body,
                capture_output=True,
                text=True,
            )
        except OSError as exc:
            self._send_json(500, {"error": f"cli exec failed: {exc}"})
            return

        self._send_json(
            200,
            {
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            },
        )


if __name__ == "__main__":
    server = HTTPServer((_HOST, _PORT), Handler)
    print(f"[control-api] listening on {_HOST}:{_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
