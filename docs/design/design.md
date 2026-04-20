---
type: design-reference
description: Design system reference for the Warehouse Hub Dashboard. Use this when building or modifying UI in the dashboard/ project.
project_dir: dashboard
---

# Dashboard Design Reference

**Aesthetic:** Swiss operational, paper-on-paper warm neutrals + single amber signal. Dense (table row 32px), optimised for daily accounting and CRM work.

The design system source lives in `docs/design/design-system/` — `assets/tokens.css` (vars), `assets/components.css` (classes), `assets/shell.jsx` (React shell reference). The HTML mockups in that folder are the canonical visual reference per page.


## CSS Architecture

The app uses **Tailwind v4 for layout utilities** (flex, grid, gap, padding, responsive breakpoints) and **custom design-system CSS classes** (`.wh-*`) for all component-level styling. Tailwind's color/typography tokens are bridged to the design system vars in `src/index.css` — so Tailwind classes like `bg-background` resolve to `--paper-0`, `text-muted-foreground` to `--ink-3`, etc.

**Rule:** reach for `.wh-*` classes for anything component-specific. Use Tailwind only for spacing, layout, and responsive overrides.


## Design Tokens

Defined in `:root` / `html.dark` in `src/index.css`. Reference by CSS var, not hardcoded values.

### Surfaces
| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper-0` | bone white | warm charcoal 17% | Canvas / page background |
| `--paper-1` | 96.8% | 20% | Cards, sidebar, topbar |
| `--paper-2` | 94.6% | 23.5% | Hover, sunken, filter bars |
| `--paper-3` | 91.5% | 27% | Active row, pressed state |
| `--paper-inv` | 22% dark | 95% light | Inverted marks (workspace badge) |

### Ink (text)
| Token | Use |
|---|---|
| `--ink-1` | Primary text |
| `--ink-2` | Secondary text, table body |
| `--ink-3` | Labels, placeholders, kickers, muted |
| `--ink-4` | Disabled |

### Borders
- `--rule-1` — hairline (most dividers, card borders)
- `--rule-2` — stronger (inputs, button borders)
- `--rule-strong` — emphasis

### Signal / Semantic
- `--ember` / `--ember-soft` / `--ember-ink` / `--ember-contrast` — primary amber accent; used for active nav indicator, primary buttons, focus rings
- `--ok` / `--ok-soft` — green (paid, done)
- `--warn` / `--warn-soft` — yellow (review, warning)
- `--danger` / `--danger-soft` — red (cancelled, void, overdue, error)
- `--info` / `--info-soft` — blue (finalized, sent, info)

### Typography
```
--font-sans:  "Inter Tight", ui-sans-serif   → body, headings
--font-mono:  "IBM Plex Mono", ui-monospace  → labels, kickers, IDs, amounts, badges
```
Loaded from Google Fonts in `index.html`. Base body: 14px / 1.45 / -0.005em letter-spacing.

### Spacing (4px base)
`--s-0`=2 `--s-1`=4 `--s-2`=6 `--s-3`=8 `--s-4`=12 `--s-5`=16 `--s-6`=20 `--s-7`=24 `--s-8`=32 `--s-9`=48 `--s-10`=64

### Radius
`--r-1`=2px `--r-2`=4px (buttons, badges) `--r-3`=6px (cards, inputs) `--r-4`=10px `--r-full`=999px

### Elevation
- `--shadow-pop` — floating panels
- `--shadow-flat` — subtle card lift


## App Shell

**CSS grid** applied via `.wh-app` on the root element:

```
44px  topbar  topbar
1fr   side    main
      232px   1fr
```

On `< 1024px`, collapses to single-column stack (topbar → sidebar → main).

```css
.wh-topbar  /* grid-area: topbar — sticky 44px bar */
.wh-side    /* grid-area: side  — sticky sidebar, height calc(100vh - 44px) */
.wh-main    /* grid-area: main  — padding 24px, overflow auto */
```

The agent dock (right rail, 320px) is not yet implemented — omit the third grid column for now.


## Component Classes

### Topbar (`.wh-topbar`)
Contains: `.wh-brand` (WR chip mark + wordmark), `.wh-brand-sep` (1px divider), `.wh-crumbs` (breadcrumb path in mono), `.spacer` (flex: 1), `.wh-top-actions` (icon buttons).

### Sidebar (`.wh-side`)
Structure:
1. `.wh-workspace` — workspace selector (`.ws-mark` monogram + `.ws-name` + `.ws-tag`)
2. `.wh-nav` → `.wh-nav-group` per section → `.group-title` (mono 10px uppercase) + `.wh-nav-item` buttons
3. `.wh-side-footer` — version string (mono, ink-4)

Nav item states:
- Default: `color: --ink-2`
- `.active`: `background: --paper-3`, left 2px `--ember` bar, `font-weight: 500`
- `.stub`: `opacity: 0.48`, `cursor: default` — use for nav items without implemented pages

### Page head (`.wh-page-head`)
```html
<div class="wh-page-head">
  <div>
    <div class="label-kicker">Accounting</div>
    <h1>Expense registry</h1>
  </div>
  <div class="wh-page-actions"><!-- buttons --></div>
</div>
```
`h1`: 22px / 500 weight / -0.022em tracking. On detail screens, reduce to ~18px.

### Buttons (`.wh-btn`)
Height 30px, border-radius `--r-2` (4px), font-size 12.5px, border `--rule-2`.

| Modifier | Use |
|---|---|
| `.ghost` | Icon/action buttons (transparent border) |
| `.danger` | Destructive actions (red text, danger-soft hover) |
| `.sm` | 24px height, 11.5px font — use in page-head actions |
| `.icon` | Square (30×30), no padding — use for topbar actions |
| `.icon.sm` | 24×24 |

### Badges (`.wh-badge`)
Mono 10.5px uppercase, height 20px, `--r-2`. Contains a `.dot` span.

Status → modifier mapping (defined in `utils.ts → getStatusBadgeClass`):
| Status | Modifier |
|---|---|
| `paid` | `.ok` |
| `finalized`, `sent` | `.info` |
| `review` | `.warn` |
| `cancelled`, `void`, `overdue` | `.danger` |
| `draft`, `recorded` | _(none — neutral)_ |

### Filter bar (`.wh-filterbar`)
36px tall, `--paper-1` background, `--r-3` radius, flex row. Contains a search icon, `.wh-search-input` (flex: 1, transparent), optional `.spacer` and count label.

### Table (`.wh-table-wrap` + `.wh-table`)
Dense: 10px vertical cell padding, 32px effective row height. `--paper-1` background, `--r-3` border-radius.

Column class modifiers:
- `.num` — right-align, mono, tabular-nums
- `.mono` — mono font, `--ink-2`, 12px
- `.dim` — `--ink-3`, 12.5px (dates, secondary info)

Thead: mono 10.5px uppercase, `--ink-3`, sticky top, `--paper-1` background.

For tables embedded inside cards (tax lines, line items), override: `style="border-radius:0; border:none"` on `.wh-table`.

### Cards (`.wh-card`)
```html
<div class="wh-card">
  <div class="wh-card-head">
    <h3>Section title</h3>
    <StatusBadge />  <!-- or action button -->
  </div>
  <div class="wh-card-body">…</div>
</div>
```
`wh-card-head`: 12px / 16px padding, border-bottom `--rule-1`. `h3`: 13px / 500.
Adjacent cards: `.wh-card + .wh-card { margin-top: --s-4 }`.

### Amount strip (`.wh-amount-strip`)
3-column grid attached to the bottom of a summary card. Each `.wh-amount-cell` has `.a-label` (mono 10.5px kicker) and `.a-value` (mono 16px / 500, tabular-nums). Add `.accent` for the gross/total cell — renders in `--ember-ink`.

### Key-value list (`.wh-dl`)
CSS grid `140px 1fr`, row-gap 11px. `dt` = mono 10.5px uppercase `--ink-3`. `dd` = 13px `--ink-1`. Add `.mono` to `dd` for IDs/slugs/codes.

### Label kicker (`.label-kicker`)
Mono 10.5px uppercase `--ink-3`, letter-spacing 0.12em. Use above `h1` in page heads and above section groups.


## Typography Patterns

```
Body text:       14px / --ink-1 / -0.005em
Secondary text:  13px / --ink-2
Muted/labels:    12-13px / --ink-3
Mono data:       font-family: --font-mono; font-variant-numeric: tabular-nums
Kicker label:    .label-kicker  (mono 10.5px uppercase ink-3)
```


## Dark Mode

Toggle by adding/removing `class="dark"` on `<html>`. All design tokens auto-switch. The Tailwind `@custom-variant dark (&:is(.dark *))` handles Tailwind dark: variants.

Theme preference stored in a cookie via `src/lib/theme.ts`.


## Navigation Structure

Sidebar groups and items are defined in `src/features/dashboard/config.ts → navGroups`. Only items in `ACTIVE_SECTIONS` (`"expenses"`, `"sales-invoices"`) are wired to navigation — all others render as `.stub`. Add new sections to `ACTIVE_SECTIONS` and wire a handler in `App.tsx` when implementing them.

| Group | Items |
|---|---|
| Workspace | Overview, Tasks |
| Accounting | Sales invoices ✓, Expenses ✓, Documents |
| CRM | Contacts, Pipeline, Catalog |
| Configure | Company card, Settings |

Breadcrumbs in the topbar are derived from `SECTION_CRUMBS` in `layout.tsx`.


## File Map

```
dashboard/src/
  index.css                          ← tokens, component classes, Tailwind bridge
  App.tsx                            ← shell state, loaders, layout root (.wh-app)
  features/dashboard/
    config.ts                        ← navGroups, ACTIVE_SECTIONS, resourceConfigs
    types.ts                         ← ExpenseRecord, SalesInvoiceRecord, ResourceConfig
    utils.ts                         ← formatMoney, formatDate, getStatusBadgeClass
    components/
      layout.tsx                     ← AppTopbar, AppSidebar (WRMark, nav groups)
      common.tsx                     ← StatusBadge, ResourceListPage, ResourceDetailScreen
    pages/
      resource-pages.tsx             ← ExpensesPage, SalesInvoicesPage
    views/
      expense-detail-view.tsx        ← wh-card / wh-dl / amount-strip layout
      sales-invoice-detail-view.tsx  ← same pattern
docs/design/design-system/
  assets/tokens.css                  ← canonical token source
  assets/components.css              ← canonical component CSS source
  assets/shell.jsx                   ← React shell + icon set reference
  Expenses.html / Invoices.html …    ← per-page visual reference
```
