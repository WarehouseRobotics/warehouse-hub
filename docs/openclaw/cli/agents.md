# How Openclaw Agents Work with the Warehouse Hub

# `wrobohub-openclaw-cli`

Run an agent turn via the Gateway (use `--local` for embedded).
Use `--agent <id>` to target a configured agent directly.

## Sending an Internal Message to an Agent in Openclaw

The business-api process can send messages to agents via openclaw CLI tool. 

Example with the `wrobohub-openclaw-cli` command:

```bash
wrobohub-openclaw-cli agent --agent $HUB_ACCOUNTING_AGENT --message "Let the user know most recent EUR/USD exchange rate and how it changed in the past week (just a summary) and reply in DM via Slack" --deliver --reply-channel slack
```

```bash
wrobohub-openclaw-cli agent --agent $HUB_ACCOUNTING_AGENT --message "Let the user know most recent EUR/USD exchange rate and how it changed in the past week (just a summary) and reply in DM via Slack" --session-id 1234 --thinking medium
```

Messages can be sent to different sessions (one agent can have many sessions). 
