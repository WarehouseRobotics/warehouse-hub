# LLM Tool Calls Safety and Restriction.md

Since many internal users can chat with local Openclaw agents, we need to ensure that only priviledged agents, 
guided by priviledged users can perform certain configuration changes, file system changes and so on.


## Separate File-system tool calls

Underpriveledged Openclaw agents use alternative tool calls for file system access and cannot run arbitrary commands.
Custom file tools are more strict than default file tools.