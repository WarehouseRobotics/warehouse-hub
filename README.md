# Warehouse Platform Hub 

Management repository of the Warehouse Robotics Hub Solution - an agentic CRM platform for businesses for SMEs.

The platform is composed of: 

* foundational Business API that provides model abstraction for objects like users, companies, etc and deterministic (non-LLM) business logic operations, typical for any small business management software
* an internal team of agents running on OpenClaw
    * Agent team
        * Hub-developer agent that can extend the frontend bot system and make changes to the internal OpenClaw setup
        * Marketing agent that can can help with marketing tasks, perform research via API and browser-based tools, generate media assets, etc
        * Accounting agent, to help businesses run their accounts and manage incoming and outgoing invoices, with skills for different countries
        * Business management and advisor agent
    * The agents use the foundational Business API as MCP and CLI tool calls to help manage the business, CRM, accounting and so on
* externally available frontend bot, that can be managed and extended by the internal team of agents
* dashboard and configuration GUI webapp
* file assets exchange GUI webapp     
