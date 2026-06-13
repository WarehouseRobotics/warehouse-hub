---
type: architecture
description: Technical architecture and design rules for the Dashboard webapp — the GUI client for the Business API.
project_dir: dashboard
---

# Dashboard Architecture

## Stack

- **React 19** + **TypeScript** — UI and type safety
- **Vite 6** — build tool and dev server (SPA mode, proxies `/api` to Business API)
- **Tailwind CSS 4** (`@tailwindcss/vite`) — utility classes for layout and spacing; component-level styling uses the `wh-*` design system classes from `src/index.css`
- **Radix UI** (`@radix-ui/react-slot`) + **class-variance-authority** + **tailwind-merge**/**clsx** — primitives behind the `components/ui` layer (`cn()` in `src/lib/utils.ts`)
- **Lucide React** — icon set
- **`@warehouse-hub/business-schemas`** — shared Zod business-object contracts, linked from the repo root (`file:../packages/business-schemas`)
- No client-side router package — routing is handled by a custom `useAppRouter` hook (`src/lib/router.ts`) using the browser History API directly

Dev server runs on port `3300` and proxies `/api` to `BUSINESS_API_URL` (default `http://localhost:3100`), stripping the `/api` prefix. Build is `tsc -b && vite build`. Run inside the container via `./container.sh` (see the repo-level Docker conventions).

## Directory Layout

A representative slice — one page/view per pattern; sibling sections follow the same shape:

```
src/
├── App.tsx                          # Root: all state, loaders, URL routing for every section
├── main.tsx
├── index.css                        # Global styles — wh-* design system classes
├── components/ui/
│   └── button.tsx                   # Radix + CVA primitives (cn() from lib/utils)
├── features/dashboard/
│   ├── config.ts                    # navGroups, ActiveSection type, ACTIVE_SECTIONS, resourceConfigs
│   ├── types.ts                     # All domain record types + ResourceState<T> + per-section *State types
│   ├── utils.ts                     # formatMoney, formatDate, getStatusBadgeClass, document helpers
│   ├── components/
│   │   ├── layout.tsx               # AppTopbar, AppSidebar, WRMark (desktop shell)
│   │   ├── mobile-layout.tsx        # MobileAppShell (stacked layout < 768px)
│   │   ├── common.tsx               # ResourceListPage, ResourceDetailScreen, StatusBadge, CopyIdButton, skeletons
│   │   └── comments-section.tsx     # CommentSection (generic, multi-entity)
│   ├── views/                       # *-detail-view.tsx per section + company-card-view, contact-detail-panel, payroll-list-view
│   │   ├── expense-detail-view.tsx
│   │   ├── company-card-view.tsx    # singleton
│   │   ├── contact-detail-panel.tsx # card-grid inline panel
│   │   └── …                        # sales-invoice, payroll, bank-transaction, document, task detail views
│   └── pages/                       # one page per section + auth pages
│       ├── resource-pages.tsx       # ExpensesPage, SalesInvoicesPage, PayrollsPage (table-based)
│       ├── contacts-page.tsx        # ContactsPage (card-grid + inline panel)
│       ├── banking-page.tsx · tax-reports-page.tsx · documents-page.tsx · tasks-page.tsx
│       ├── bookings-page.tsx · data-caches-page.tsx · team-page.tsx · api-tokens-page.tsx
│       └── login-page.tsx · auth-consume-page.tsx · accept-invite-page.tsx   # public auth routes
└── lib/
    ├── api.ts                       # Business API client
    ├── router.ts                    # useAppRouter — URL parsing + navigation
    ├── session.ts                   # DashboardSession / DashboardSessionUser types
    ├── theme.ts                     # Dark/light cookie persistence
    ├── cookies.ts                   # readCookieBool / writeCookieBool (privacy mode, etc.)
    ├── use-mobile.ts                # useIsMobile hook
    └── utils.ts                     # cn() class-name helper
```

`settings-page.tsx` exists but is not wired into the main `<main>` routing.

## Routing

URL is the source of truth. `useAppRouter` parses `window.location.pathname` into `{ section, id? }` and re-syncs on `popstate` for back/forward support.

```
/                        → redirects to /expenses
/{section}               → list/overview for that section
/{section}/{id}          → detail view for that record
```

`App.tsx` derives all navigation state from the URL path. The active section is
resolved against `ACTIVE_ROUTE_SECTIONS` (which mirrors `ACTIVE_SECTIONS` in
`config.ts`), falling back to `expenses` for unknown sections:

```ts
const activeSection = resolveSection(path.section)  // one of the 13 active sections, else "expenses"
const expenseScreen = activeSection === "expenses" && !!path.id ? "detail" : "list"
// …each detail-capable section derives its own list/detail screen the same way
```

The active sections (source of truth: `ACTIVE_SECTIONS` in `config.ts`) are:
`expenses`, `sales-invoices`, `payrolls`, `banking`, `tax-reports`, `documents`,
`contacts`, `company`, `tasks`, `bookings`, `data-caches`, `team`, `api-tokens`.
`DETAIL_SECTIONS` in `App.tsx` lists the subset that supports a `/{section}/{id}`
detail view (`company`, `team`, `api-tokens` are list/singleton-only).

Detail loaders key off a derived `*DetailId` variable (e.g. `expenseDetailId = activeSection === "expenses" ? urlId : null`), so navigating away from a section automatically cancels its pending fetch and clears the selected item.

Beyond the active sections, `VALID_SECTIONS` also recognizes the public/auxiliary
routes `login`, `auth` (`/auth/consume`), `accept-invite`, and `settings`.

All navigation goes through `navigate({ section, id? })`. Never call `history.pushState` directly.

**Adding a new section to the URL:** add it to `ACTIVE_SECTIONS`/`ActiveSection` in `config.ts` and to `ACTIVE_ROUTE_SECTIONS` (and `DETAIL_SECTIONS` if it has a detail view) in `App.tsx`.

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

`src/lib/api.ts` is the single Business API client (see the file itself for the full,
current export list). Every call goes through `businessApiFetch` against
`(VITE_BUSINESS_API_URL_PUBLIC || "/api") + "/api/v1"`, sending **both** a build-injected
`X-Api-Key` header (`__BUSINESS_API_KEY__`) and `credentials: "include"` for the cookie
session (see Authentication below). Errors surface as a typed `BusinessApiError`.

The client is organized by section. Representative entry points per group:

| Group | Functions (representative) |
|---|---|
| Core | `businessApiFetch<T>(path, init?)`, `isBusinessApiError(err)` |
| Auth | `getAuthConfig`, `loginWithPassword`, `requestMagicLink`, `consumeMagicLink`, `getCurrentSession`, `logout`, `acceptInvitation` |
| Generic resources | `listBusinessResources<T>(key, searchTerm)`, `getBusinessResource`, `updateBusinessResource`, `deleteBusinessResource` — for `expenses` / `sales-invoices` / `payrolls`, uses `?similar=` |
| Contacts | `listContacts` (uses `?query=`), `getContactDetail` (includes `persons[]`), `deleteContact` |
| Documents | `listDocuments` (`?similar=`, `?after/before/limit`), `getDocument`, `downloadDocument`, `deleteDocument` |
| Tax reports | `listTaxReports` (rich query filters), `getTaxReport`, `deleteTaxReport` |
| Company | `getCompanyCard` (null on 404), `upsertCompanyCard` (PUT) |
| Tasks/Projects | `listTasks`, `getTask`, `createTask`, `updateTask`, `deleteTask`, `listProjects`, `createProject`, `deleteProject` |
| Bookings | `listBookings`, `getBooking`, `updateBooking`, `completeBooking`, `cancelBooking`, `checkBookingAssignmentConflicts`, `listBookingAssignmentProfiles`, `listBookingAvailabilityExceptions` |
| Banking | `listBankAccounts`, `listBankTransactions`, `getBankTransaction`, `runBankTransactionMatch`, `listBankTransactionMatches`, `updateBankTransactionMatch`, `listBankBalanceSnapshots`, `createBankBalanceSnapshot` |
| Data caches | `listDataCaches`, `getDataCache`, `createDataCache`, `listDataCacheEntries`, `upsertDataCacheEntry`, `importDataCacheEntries`, `lookupDataCache` |
| Team / Tokens | `listUsers`, `inviteUser`, `revokeInvitation`, `listPendingInvitations`, `updateUser`, `listPersonalAccessTokens`, `createPersonalAccessToken`, `revokePersonalAccessToken` |
| Comments | `listComments`, `createComment`, `updateComment`, `deleteComment` |

Note on search params: contacts use `?query=` (server-side search) while the
semantic-search resources (expenses/invoices/payrolls, documents) use `?similar=`
(vector search). Keep these separate rather than collapsing into one generic list call.


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

### Specialized sections

Several sections need richer layouts than the three generic shapes and define their
own page + state type (e.g. `BankingState`, `BookingsState`, `TasksState`,
`TaxReportsState`, `DataCachesState`, `TeamState`, `ApiTokensState`):

- **Bookings** — calendar/week view with assignment-conflict checking.
- **Banking** — account/transaction lists with match runs and balance snapshots.
- **Documents** — week-filtered list with OCR fields and download.
- **Tasks** — project-scoped lists with a task detail view.
- **Tax reports**, **Data caches** — filtered lists with their own detail/import flows.
- **Contacts** — the card-grid above, with `all / customer / supplier / leads` tabs.
- **Team / API tokens** — list-and-form management screens (no `/{id}` detail route).

These still reuse the shared building blocks (`StatusBadge`, `CommentSection`,
skeletons, `wh-*` classes) but own their loaders and render branch in `App.tsx`.

## CSS Design System

Component-level CSS classes (`.wh-card`, `.wh-badge`, `.wh-table`, `.wh-tabs`, etc.) are defined in `src/index.css`. **Do not replicate these with Tailwind utilities** — use the `wh-*` classes for structural components. Tailwind is for layout, spacing, and one-off utilities only.

Responsive reflow is controlled in `src/index.css`. The dashboard keeps its desktop/tablet app shell through widths `>= 768px` and switches to the stacked mobile layout only below `768px` (`max-width: 767px`).

When adding a class that appears in the HTML design templates (`docs/design/design-system/`) but is missing from `index.css`, port it from `docs/design/design-system/assets/components.css` — the token variable names (`--paper-1`, `--ember`, `--ink-3`, etc.) are the same in both.

## Extending the Dashboard

### Adding a new active section

1. Add the `NavItemId` to `config.ts` `navGroups` (it likely already exists as a stub, e.g. `overview`, `pipeline`, `catalog`)
2. Add it to `ACTIVE_SECTIONS` and the `ActiveSection` type in `config.ts`
3. Add it to `ACTIVE_ROUTE_SECTIONS` in `App.tsx` (and `DETAIL_SECTIONS` if it has a `/{id}` detail view), and add its breadcrumb pair to `SECTION_CRUMBS` in `layout.tsx`
4. Add state + loaders + handlers in `App.tsx` (follow the expense/contact pattern)
5. Add the page component under `features/dashboard/pages/`
6. Add the routing branch in the `<main>` render in `App.tsx`

### Adding a table-based section

Define a `ResourceConfig<TRecord>` in `config.ts`, add a `TRecord` type in `types.ts`, and use `ResourceListPage` + `ResourceDetailScreen` from `common.tsx`. See `ExpensesPage` in `resource-pages.tsx` as the reference implementation.

### Adding a card-grid section

Follow `ContactsPage` + `contact-detail-panel.tsx`. The layout pattern is: `display: grid; grid-template-columns: 1fr 360px` with `position: sticky; top: 64px` on the panel.
