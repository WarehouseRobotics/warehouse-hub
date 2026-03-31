# Warehouse Hub Business API Stack

The Business API stack is designed to be used as an underlying infrastructure tool for business management and CRM AI agents of the Warehouse Hub platform. Humans can interact with it via a webapp GUI too, but the API, MCP and CLI parts are designed with agent tool usage in mind.

The Business API stacks allows our AI agents to query and manage various business data objects to provide assistance for CRM, marketing, accounting and other tasks to business owners.

## Core Objects

* Base Infrastructure
    * entities
        * person (users, employees, contacts, etc)
        * company (admin company or companies, clients, suppliers, etc)
        * entity tags: owned, contact, supplier, customer, etc.
    * ticket (a task)
    * document
* Accounting
    * documents
        * contract / agreement
        * invoice
        * expense/bill
        * payment
    * sub-document objects
        * taxes
        * fees
        * discounts
    * tax period
    * audit event
* CRM
    * products and services (basic inventory nomenclature/pricelist)
    * contact (from base infra)
    * prospective lead (company + persons + lead info)
    * customer (like a project group for tracking sales per customer)
        * notes/comments
        * invoice
        * sale (like a project per one particular sale)
        * subscription (for recurring sales)
        * task (from base infra)
        * contracts/deals
    * interactions with leads and customers
        * email/call
        * meeting (as meeting notes)


Some objects are used across domains (invoices, legal entities etc.), some objects can be related inside and between domains, e.g. invoices are related to companies and persons and sales, contacts and documents are related to prospective leads and so on.


## Core Stack

The accounting stack is this:

* API (Express.js) and MCP server
* CLI tool (API and MCP wrapper) to be used by internal agents
* UI client for the API (for basic accounting tasks)

TODO...

### Accounting Features (MVP)

* sales invoicing + expense capture
* VAT-ready bookkeeping
* country-specific compliance rails
* human accountant handoff
* empowers our AI accounting agent

## Base Infrastructure Stack

## Tasks

TODO


## Documents

The most common example of a special document type is an invoice (expense or sale).


## CRM Stack

TODO

### Accounting API

TODO


### Accounting MCP

TODO


### Accounting CLI

