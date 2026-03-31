Send an message to the "accounting" agent with reply sent also to a Slack channel (from the "accounting" account):

```bash
OPENCLAW_FORCE_NO_BUILD=1 pnpm run openclaw agent --agent accounting -m "What is your current status?" --deliver --reply-account accounting --reply-channel slack --reply-to "#finance"
```

Note: the original documentation was missing the --reply-account parameter in the examples.