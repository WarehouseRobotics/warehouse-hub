---
type: core-spec
description: Describes the architecture and design principles of the Dashboard - the React SPA GUI client for the Business API
project_dir: dashboard
frozen: false
see_also:
  - docs/apps/Dashboard.md
  - docs/apps/dashboard/dashboard.md
---

# Dashboard Architecture

The Dashboard is a single-page web app that acts as the human GUI client for the
Business API. The full, code-aligned technical reference lives in
[docs/apps/dashboard/dashboard.md](../apps/dashboard/dashboard.md) — this file
captures the high-level principles only.

## Stack

* React 19 + TypeScript (SPA, no SSR)
* Vite 6 — build tool and dev server, proxies `/api` to the Business API
* Tailwind CSS 4 for layout utilities; `wh-*` design-system classes in `src/index.css` for structural components
* Radix UI + class-variance-authority for the `components/ui` primitives
* Lucide React for icons
* `@warehouse-hub/business-schemas` for shared Zod business-object contracts
* No client-side router package — a custom `useAppRouter` hook over the History API

## Principles

* **The Business API is the only backend.** The dashboard owns no database and no
  business logic; it reads and writes exclusively through the `/api/v1` REST surface
  via `src/lib/api.ts`. Deterministic business rules stay server-side.
* **URL is the source of truth.** Navigation state is derived from
  `window.location.pathname` (`/{section}/{id?}`); all navigation goes through
  `navigate()`, never `history.pushState` directly.
* **State is centralized, not global.** All state lives in `App.tsx` and flows down as
  props — no Redux, Zustand, or context store. Resource sections share a generic
  `ResourceState<TRecord>` shape.
* **Thin client, stable contracts.** API shapes mirror the Business API; the dashboard
  keeps its own view types in `src/features/dashboard/types.ts`, kept close to the
  shared `business-schemas` contracts.
* **Design system over ad-hoc styling.** Structural UI uses the `wh-*` classes;
  Tailwind is reserved for layout, spacing, and one-off utilities.

## Sections

Active sections are listed in `ACTIVE_SECTIONS` (`src/features/dashboard/config.ts`):
accounting (expenses, sales invoices, payrolls, banking, tax reports, documents), CRM
(contacts), operations (bookings), workspace (tasks), and configuration (company card,
data caches, team, API tokens). See the canonical architecture doc for the per-section
patterns (table / card-grid / singleton / specialized).

## Development environment

Built and run inside Docker via the repo-level `./container.sh` wrapper, consistent with
the other platform components. The same image targets both the local laptop and the
Raspberry Pi deployment environment. The dev server listens on port `3300` and proxies
`/api` to the Business API (default `http://localhost:3100`).
