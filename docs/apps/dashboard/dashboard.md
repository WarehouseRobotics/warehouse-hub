---
type: architecture
description: Technical architecture and design rules for the Dashboard webapp — the GUI client for the Business API.
project_dir: dashboard
---

# Dashboard Architecture

## Stack

- **React 19** + **TypeScript** — UI and type safety
- **Vite 6** — build tool and dev server (SPA mode, proxies `/api` to Business API)
- **Tailwind CSS 4** — utility classes for layout and spacing; component-level styling uses the `wh-*` design system classes from `src/index.css`
- **Lucide React** — icon set
- No client-side router package — routing is handled by a custom `useAppRouter` hook (`src/lib/router.ts`) using the browser History API directly

## Directory Layout

```
src/
├── App.tsx                          # Root: all state, loaders, URL routing
├── main.tsx
├── index.css                        # Global styles — wh-* design system classes
├── features/dashboard/
│   ├── config.ts                    # Nav structure, ActiveSection type, ACTIVE_SECTIONS, ResourceConfig instances
│   ├── types.ts                     # All domain record types (ExpenseRecord, SalesInvoiceRecord, ContactRecord, …) + ResourceState<T>
│   ├── utils.ts                     # formatMoney, formatDate, getStatusBadgeClass
│   ├── components/
│   │   ├── layout.tsx               # AppTopbar, AppSidebar
│   │   └── common.tsx               # ResourceListPage, ResourceDetailScreen, StatusBadge, skeletons
│   ├── views/
│   │   ├── expense-detail-view.tsx
│   │   ├── sales-invoice-detail-view.tsx
│   │   ├── company-card-view.tsx
│   │   └── contact-detail-panel.tsx
│   └── pages/
│       ├── resource-pages.tsx       # ExpensesPage, SalesInvoicesPage (table-based sections)
│       └── contacts-page.tsx        # ContactsPage (card-grid + inline panel)
└── lib/
    ├── api.ts                       # Business API client
    ├── router.ts                    # useAppRouter — URL parsing + navigation
    └── theme.ts                     # Dark/light cookie persistence
```

## Routing

URL is the source of truth. `useAppRouter` parses `window.location.pathname` into `{ section, id? }` and re-syncs on `popstate` for back/forward support.

```
/                        → redirects to /expenses
/{section}               → list/overview for that section
/{section}/{id}          → detail view for that record
```

`App.tsx` derives all navigation state from the URL path:

```ts
const activeSection = resolveSection(path.section)  // → "expenses" | "sales-invoices" | "contacts" | "company"
const expenseScreen  = activeSection === "expenses"       && !!path.id ? "detail" : "list"
const invoiceScreen  = activeSection === "sales-invoices" && !!path.id ? "detail" : "list"
```

Detail loaders key off a derived `*DetailId` variable (e.g. `expenseDetailId = activeSection === "expenses" ? urlId : null`), so navigating away from a section automatically cancels its pending fetch and clears the selected item.

All navigation goes through `navigate({ section, id? })`. Never call `history.pushState` directly.

**Adding a new section to the URL:** add it to `VALID_SECTIONS` in `App.tsx` and to `ACTIVE_SECTIONS` in `config.ts`.

## State Management

All state lives in `App.tsx`. There is no global store (no Redux, no Zustand). Each resource section uses `ResourceState<TRecord>`:

```ts
type ResourceState<TRecord> = {
  items: TRecord[]          // loaded list
  selectedId: string | null // synced from URL by the detail loader
  selectedItem: TRecord | null
  searchTerm: string
  listLoading: boolean
  detailLoading: boolean
  refreshing: boolean       // true when re-fetching a non-empty list
  deletingId: string | null
  error: string | null
}
```

State is passed down as props — no context consumers. Callbacks for mutation (search, select, delete) are defined in `App.tsx` and passed to pages.

Each section also has a `*ReloadKey` integer; incrementing it triggers a list re-fetch via `useEffect`.

## API Client

`src/lib/api.ts` wraps `fetch` with auth headers (`X-Api-Key`) and base URL resolution.

| Function | Purpose |
|---|---|
| `businessApiFetch<T>(path, init?)` | Generic authenticated fetch |
| `getAuthConfig()` | Read public auth method flags from `/auth/config` |
| `loginWithPassword(data)` | POST email/password login and receive a browser session cookie |
| `requestMagicLink(data)` | POST a non-enumerating magic-link request |
| `consumeMagicLink(token)` | POST a magic-link token and receive a browser session cookie |
| `getCurrentSession()` | GET `/auth/me` for the current browser session |
| `listBusinessResources<T>(key, searchTerm)` | List expenses/invoices — uses `?similar=` param |
| `getBusinessResource<T>(key, id)` | Fetch single expense/invoice |
| `deleteBusinessResource(key, id)` | DELETE expense/invoice |
| `listContacts<T>(searchTerm)` | List contacts — uses `?query=` param |
| `getContactDetail<T>(id)` | Fetch single contact (includes `persons[]`) |
| `deleteContact(id)` | DELETE contact |
| `getCompanyCard<T>()` | GET company card (returns null on 404) |
| `upsertCompanyCard<T>(data)` | PUT company card |

Note: contacts use `?query=` for server-side search; the other resources use `?similar=` (semantic/vector search). Keep these separate rather than using a generic list function.


## Authentication

The dashboard uses Business API cookie sessions. `src/lib/api.ts` always sends
`credentials: "include"` and dispatches `wh:auth:expired` when protected API
calls return `401`, except for explicit session/auth probes that suppress the
event.

`App.tsx` owns session state. On startup it calls `getCurrentSession()`;
authenticated sessions load protected dashboard data, while unauthenticated
sessions reset protected state and route to `/login`. The public auth routes are
handled outside the app shell:

- `/login` renders `features/dashboard/pages/login-page.tsx`.
- `/auth/consume?token=...` renders `features/dashboard/pages/auth-consume-page.tsx`.

The login page first calls `GET /api/v1/auth/config` through `getAuthConfig()`
and only renders enabled methods:

- password login posts `{ email, password }` to `/auth/login`;
- magic-link login posts `{ email, purpose: "login" }` to
  `/auth/magic-link/request` and always shows neutral success copy;
- both successful password login and magic-link consume refresh `/auth/me` and
  navigate back to the protected route that triggered login, or to `/expenses`.

The consume page reads the `token` query parameter, posts it to
`/auth/magic-link/consume`, and replaces the URL with `/expenses` after the
session is established. Missing, expired, reused, disabled, validation, and
rate-limit failures are mapped to friendly recovery messages with a return to
the login page.


## Section Patterns

### Table-based sections (Expenses, Sales Invoices)

Use the generic `ResourceConfig<TRecord>` + `ResourceListPage` + `ResourceDetailScreen` components from `common.tsx`.

`ResourceConfig<TRecord>` defines how a record is rendered in the list: `getId`, `getPrimaryLabel`, `getSecondaryLabel`, `getStatus`, `getAmount`. Config instances live in `config.ts`.

Pages (`ExpensesPage`, `SalesInvoicesPage`) switch between list and detail view based on the `screen` prop, which is URL-derived in `App.tsx`.

### Card-grid sections (Contacts)

Custom page layout: 2-column card grid on the left, sticky 360px detail panel on the right. Selecting a card navigates to `/{section}/{id}`, loads the detail into the panel, and keeps the list visible. No separate full-page detail screen.

### Singleton sections (Company)

Single-record views like `CompanyCardView` take their own state type (`CompanyCardState`) and don't use `ResourceState`.

## CSS Design System

Component-level CSS classes (`.wh-card`, `.wh-badge`, `.wh-table`, `.wh-tabs`, etc.) are defined in `src/index.css`. **Do not replicate these with Tailwind utilities** — use the `wh-*` classes for structural components. Tailwind is for layout, spacing, and one-off utilities only.

Responsive reflow is controlled in `src/index.css`. The dashboard keeps its desktop/tablet app shell through widths `>= 768px` and switches to the stacked mobile layout only below `768px` (`max-width: 767px`).

When adding a class that appears in the HTML design templates (`docs/design/design-system/`) but is missing from `index.css`, port it from `docs/design/design-system/assets/components.css` — the token variable names (`--paper-1`, `--ember`, `--ink-3`, etc.) are the same in both.

## Extending the Dashboard

### Adding a new active section

1. Add the `NavItemId` to `config.ts` nav groups (it likely already exists as a stub)
2. Add it to `ACTIVE_SECTIONS` and the `ActiveSection` type in `config.ts`
3. Add it to `VALID_SECTIONS` and `SECTION_CRUMBS` in `App.tsx` / `layout.tsx`
4. Add state + loaders + handlers in `App.tsx` (follow the expense/contact pattern)
5. Add the page component under `features/dashboard/pages/`
6. Add the routing branch in the `<main>` render in `App.tsx`

### Adding a table-based section

Define a `ResourceConfig<TRecord>` in `config.ts`, add a `TRecord` type in `types.ts`, and use `ResourceListPage` + `ResourceDetailScreen` from `common.tsx`. See `ExpensesPage` in `resource-pages.tsx` as the reference implementation.

### Adding a card-grid section

Follow `ContactsPage` + `contact-detail-panel.tsx`. The layout pattern is: `display: grid; grid-template-columns: 1fr 360px` with `position: sticky; top: 64px` on the panel.
