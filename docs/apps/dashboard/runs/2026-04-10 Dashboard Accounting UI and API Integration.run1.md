# Dashboard Accounting UI and API Integration Run

Date: 2026-04-10

## Summary

This run focused on turning the dashboard scaffold into a usable accounting UI for expenses and sales invoices, then hardening the dashboard-to-Business API integration, improving the sales invoice detail UX, and refactoring the dashboard UI code into a more maintainable structure.

## Completed Work

### 1. Added accounting sections to the dashboard

Implemented dashboard UI sections for:

- Expenses
- Sales invoices

Each resource now supports:

- listing existing records
- searching records
- opening a dedicated detail view
- deleting records

The UI was updated from the initial generic placeholder dashboard into an accounting-focused interface.

### 2. Introduced a dedicated Business API client in the dashboard

Added a shared API service in the dashboard frontend so Business API calls are centralized instead of being made inline in React components.

This service now:

- reads the public Business API base URL from Vite env
- targets the correct external Business API endpoint
- attaches the API key automatically to requests
- is used by the dashboard resource pages instead of direct `fetch("/api/...")` calls

Related environment handling was also updated so the dashboard container exposes a client-safe public API URL.

### 3. Relaxed Business API CORS for development/testing

Updated the Business API app middleware to allow requests from any origin for now, primarily to avoid browser CORS issues during development and testing.

Current temporary behavior:

- `Access-Control-Allow-Origin: *`
- allows `Content-Type` and `X-Api-Key`
- allows common CRUD methods and `OPTIONS`
- responds to preflight requests before API key auth runs

This was intentionally treated as a temporary development-friendly setup, with the expectation that CORS policy can be tightened later.

### 4. Improved Sales Invoice detail UX

Redesigned the sales invoice detail screen into a more mobile-friendly, console-style accounting view.

Changes included:

- a compact summary header with invoice number, customer, status, and gross total
- stronger status styling for invoice states
- a clearer financial summary block
- denser customer and metadata sections
- a line-item presentation that feels closer to an invoice and scans better on phones
- reduced repetition from the previous generic card stack

### 5. Separated list/search from detail pages

Changed the resource flow so:

- expenses listing/search is on its own page
- expense detail is on its own page
- sales invoice listing/search is on its own page
- sales invoice detail is on its own page

This replaced the earlier split-pane list/detail layout and made the mobile experience much cleaner.

### 6. Refactored the dashboard submodule UI into page/view structure

Split the giant `App.tsx` implementation into a feature-oriented structure under `src/features/dashboard`.

The refactor introduced:

- shared dashboard types
- shared dashboard config
- shared formatting/status utilities
- reusable layout components
- reusable list/detail page primitives
- separate resource page components
- separate expense and sales invoice detail views

After the refactor, `App.tsx` is primarily responsible for:

- resource state
- data loading
- navigation between list/detail screens
- wiring actions into page components

## Verification Performed

The dashboard production build was run multiple times throughout the work to verify the UI and refactor changes.

Successful verification command:

```bash
./container.sh exec npm run build
```

This was run in:

- `dashboard`

The Business API build was also run after the CORS change:

```bash
./container.sh exec npm run build
```

This was run in:

- `business-api`

## Result

At the end of this run:

- the dashboard has working expenses and sales invoice resource flows
- dashboard API access is centralized and env-driven
- direct dashboard requests include the API key
- temporary permissive CORS is in place in the Business API
- sales invoice detail UX is substantially improved
- list/detail navigation is mobile-friendlier
- the dashboard UI code is significantly better structured for further work
