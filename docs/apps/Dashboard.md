---
type: core-spec
description: Describes the Dashboard - main graphical interface for working with the Business API, combining ERP, CRM and Task Management features for enterprise tasks.
project_dir: dashboard
frozen: false
see_also:
  - docs/architecture/Frontend Apps General Architecture.md
---

# Warehouse Hub Dashboard

Dashboard is part of the Warehouse Hub – an AI agent platform for small business management.

Dashboard is the graphical user interface webapp that works with the Business API. It acts as a user-friendly client to the Business API, providing user interfaces for when a chat with an AI agent is not enough.

It surfaces the business across four areas — **Workspace** (overview, tasks), **Accounting** (sales invoices, expenses, payrolls, banking, tax reports, documents), **CRM** (contacts, and planned pipeline/catalog), and **Configure** (company card, data caches, team, API tokens) — plus **Operations** (bookings). The technical contract for these screens lives in [docs/apps/dashboard/dashboard.md](dashboard/dashboard.md).

## Dashboard Workflows

### Onboarding

A person signs in through the Business API auth flow — password or magic link — landing on `/login` (or `/auth/consume` for a magic-link token) and then into the app. New teammates arrive via an invitation and complete `/accept-invite`. The session is a Business API cookie session; the dashboard loads protected data once authenticated and returns to `/login` when the session expires.

### Business Configuration

The owner sets up the workspace under **Configure**: the **Company card** (the singleton legal/contact profile used to generate documents), **Data caches** (reference lookups the agents and forms draw on), the **Team** (users and pending invitations), and **API tokens** (personal access tokens for programmatic/agent access).

### Accounting

The day-to-day finance surface. Users review **Expenses** (incoming supplier bills), **Sales invoices** (outgoing invoices), **Payrolls** (imported payroll slips), **Banking** (accounts, transactions, balance snapshots, and transaction matching), **Tax reports** (filed declarations and payment state), and **Documents** (uploaded/OCR'd files linked to records). Records are typically created via the API/agents; the dashboard is for review, search (semantic `?similar=` search), status, and detail inspection.

### Contact Management

The **Contacts** CRM section presents people and companies in a card grid with `all / customer / supplier / leads` tabs and a sticky detail panel. Search is server-side (`?query=`). Contacts link out to the records (expenses, invoices, bookings) that reference them.

### Operations

**Bookings** manages scheduled work in a calendar/week view, including assignment-conflict checks and complete/cancel actions. **Tasks** (under Workspace) tracks project-scoped work items with a detail view.

### Collaboration

Most record types support inline **comments** (a shared `CommentSection`), so the team and agents can annotate contacts, expenses, payrolls, sales invoices, tasks, and bookings in context.

