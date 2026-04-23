# How Openclaw Agents Work with the Warehouse Hub


## Sending an Internal Message to an Agent in Openclaw

The business-api process can send messages to agents via openclaw CLI tool. 

Example with the `wrobohub-openclaw-cli` command:

```bash
wrobohub-openclaw-cli agent --agent $HUB_ACCOUNTING_AGENT --message "Let the user know most recent EUR/USD exchange rate and how it changed in the past week (just a summary) and reply in DM via Slack" --deliver --reply-channel slack
```

# --reply-to "#finance"

Messages can be sent to different sessions (one agent can have many sessions). 
