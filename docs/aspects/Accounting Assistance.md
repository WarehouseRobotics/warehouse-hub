---
type: core-aspect-spec
description: 
apps: business-api, dashboard
frozen: false
---

# Accounting Assistance

Accounting assistance is provided via an AI agent, empowered with an ERP toolset (accounting + CRM, kind of like Hubspot, but designed to be used primarily by AI agents in collaboration with humans). The API and CLI tool wrappers are the foundation and the UI is just a thin client. Most human operations will come through chat messages.

The accounting assistant agent is available via chat (Slack) in direct messages or #finance channel (or any other channel to which it is invited).


## Core Objects

* entities
    * person
    * company
    * entity tags: owned, contact, supplier, customer, etc.
* contract / agreement
* invoice
* expense/bill
* payment
* transaction import row
* reconciliation suggestion
* tax period
* document
* audit event

## Dependencies

Accounting assistance features make use of our underlying Business API to store core objects, documents and such.


## Incoming Expenses Handling

Users can send invoices and expense documents to the agent via Slack / email. 


## Document Vault

The Business API document storage feature is used to by the Accounting agent to store documents received from users. Each document is run through **local OCR**, LLM-based **analysis and summarization** and the resulting information is also encoded as embeddings and indexed in by the Business API