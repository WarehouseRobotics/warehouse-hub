# `wrobohub-openclaw-cli health`

Fetch health from the running Gateway.

```bash
wrobohub-openclaw-cli health
wrobohub-openclaw-cli health --json
wrobohub-openclaw-cli health --verbose
```

Notes:

- `--verbose` runs live probes and prints per-account timings when multiple accounts are configured.
- Output includes per-agent session stores when multiple agents are configured.
