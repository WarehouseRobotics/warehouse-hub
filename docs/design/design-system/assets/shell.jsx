/* global React */
const { useState, useEffect } = React;

/* =============================================================
   BRAND MARK — 8-bit microchip glyph + WR wordmark
   ============================================================= */
function WRMark({ size = 20 }) {
  // Pixel-grid chip icon drawn with squares. Deliberately crunchy 8-bit feel.
  // 8x8 pixel matrix — 1 = solid pixel, 0 = empty, 2 = contact/pin.
  const g = [
    [0,2,0,2,0,2,0,0],
    [2,1,1,1,1,1,2,0],
    [0,1,0,1,0,1,0,0],
    [2,1,1,1,1,1,2,0],
    [0,1,0,1,0,1,0,0],
    [2,1,1,1,1,1,2,0],
    [0,2,0,2,0,2,0,0],
    [0,0,0,0,0,0,0,0],
  ];
  const px = size / 8;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {g.map((row, y) => row.map((v, x) => {
        if (!v) return null;
        return (
          <rect
            key={`${x}-${y}`}
            x={x * px} y={y * px}
            width={px} height={px}
            fill={v === 2 ? "var(--ember)" : "var(--ink-1)"}
          />
        );
      }))}
    </svg>
  );
}

function WRWordmark({ size = 20 }) {
  return (
    <span className="wh-brand">
      <span className="chip"><WRMark size={size} /></span>
      <span className="wr">WR</span>
      <span style={{ color: 'var(--ink-3)', paddingLeft: 4 }}>/ Hub</span>
    </span>
  );
}

/* =============================================================
   ICONS — thin subset of lucide-style, 16px default
   ============================================================= */
const Icn = ({ d, size = 16, stroke = 1.5, className = "icn", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    {d}
  </svg>
);
const I = {
  home:      (p) => <Icn {...p} d={<><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></>} />,
  inbox:     (p) => <Icn {...p} d={<><path d="M3 13h4l2 3h6l2-3h4"/><path d="M5 5h14l2 8v6H3v-6z"/></>} />,
  receipt:   (p) => <Icn {...p} d={<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/></>} />,
  invoice:   (p) => <Icn {...p} d={<><path d="M7 3h10l3 3v15H7z"/><path d="M17 3v3h3"/><path d="M10 10h7M10 14h7M10 18h5"/></>} />,
  users:     (p) => <Icn {...p} d={<><circle cx="9" cy="8" r="3.5"/><path d="M3 20c1-3.5 3.5-5.5 6-5.5s5 2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20c.5-2.5 2-4 4-4s3 1 4 3"/></>} />,
  deal:      (p) => <Icn {...p} d={<><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/></>} />,
  kanban:    (p) => <Icn {...p} d={<><rect x="3" y="4" width="5" height="14" rx="1"/><rect x="10" y="4" width="5" height="9" rx="1"/><rect x="17" y="4" width="4" height="12" rx="1"/></>} />,
  check:     (p) => <Icn {...p} d={<path d="M4 12l5 5L20 6"/>} />,
  checklist: (p) => <Icn {...p} d={<><path d="M3 6l2 2 3-3"/><path d="M3 13l2 2 3-3"/><path d="M3 20l2 2 3-3"/><path d="M11 7h10M11 14h10M11 21h7"/></>} />,
  file:      (p) => <Icn {...p} d={<><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/></>} />,
  settings:  (p) => <Icn {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></>} />,
  building:  (p) => <Icn {...p} d={<><path d="M3 21V5l9-2 9 2v16"/><path d="M8 8v2M8 13v2M8 18v3M16 8v2M16 13v2M16 18v3M12 8v2M12 13v2M12 18v3"/></>} />,
  search:    (p) => <Icn {...p} d={<><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></>} />,
  plus:      (p) => <Icn {...p} d={<><path d="M12 5v14M5 12h14"/></>} />,
  filter:    (p) => <Icn {...p} d={<path d="M3 5h18l-7 9v5l-4 2v-7z"/>} />,
  sort:      (p) => <Icn {...p} d={<><path d="M7 4v16M7 20l-3-3M7 20l3-3"/><path d="M17 20V4M17 4l-3 3M17 4l3 3"/></>} />,
  sun:       (p) => <Icn {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></>} />,
  moon:      (p) => <Icn {...p} d={<path d="M20 14A8 8 0 019 3a8 8 0 1011 11z"/>} />,
  bell:      (p) => <Icn {...p} d={<><path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16z"/><path d="M10 20a2 2 0 004 0"/></>} />,
  more:      (p) => <Icn {...p} d={<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>} />,
  chev:      (p) => <Icn {...p} d={<path d="M9 6l6 6-6 6"/>} />,
  chevD:     (p) => <Icn {...p} d={<path d="M6 9l6 6 6-6"/>} />,
  chevU:     (p) => <Icn {...p} d={<path d="M6 15l6-6 6 6"/>} />,
  upload:    (p) => <Icn {...p} d={<><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 20h16"/></>} />,
  send:      (p) => <Icn {...p} d={<><path d="M4 20l17-8L4 4l3 8-3 8z"/><path d="M7 12h14"/></>} />,
  close:     (p) => <Icn {...p} d={<><path d="M6 6l12 12M18 6L6 18"/></>} />,
  sparkle:   (p) => <Icn {...p} d={<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>} />,
  dollar:    (p) => <Icn {...p} d={<><path d="M12 3v18"/><path d="M17 7c0-2-2-3-5-3s-5 1-5 3 2 3 5 3 5 1 5 3-2 3-5 3-5-1-5-3"/></>} />,
  clock:     (p) => <Icn {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  link:      (p) => <Icn {...p} d={<><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></>} />,
  menu:      (p) => <Icn {...p} d={<><path d="M4 6h16M4 12h16M4 18h16"/></>} />,
  download:  (p) => <Icn {...p} d={<><path d="M12 4v12M12 16l-4-4M12 16l4-4"/><path d="M4 20h16"/></>} />,
  at:        (p) => <Icn {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M16 12v2a3 3 0 006 0v-2a9 9 0 10-4 7.5"/></>} />,
  phone:     (p) => <Icn {...p} d={<path d="M4 5c0 9 6 15 15 15l2-3-5-2-2 2c-3-1.5-5-3.5-6-6l2-2-2-5z"/>} />,
  mapPin:    (p) => <Icn {...p} d={<><path d="M12 22s8-7 8-13a8 8 0 10-16 0c0 6 8 13 8 13z"/><circle cx="12" cy="9" r="3"/></>} />,
  tag:       (p) => <Icn {...p} d={<><path d="M20 12l-8 8L3 11V3h8z"/><circle cx="7.5" cy="7.5" r="1"/></>} />,
  flame:     (p) => <Icn {...p} d={<path d="M12 3s4 4 4 8a4 4 0 01-8 0c0-1 .5-2 1-3-1 0-3 1-3 4a6 6 0 0012 0c0-5-6-9-6-9z"/>} />,
  pkg:       (p) => <Icn {...p} d={<><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></>} />,
  play:      (p) => <Icn {...p} d={<path d="M6 4l14 8-14 8z"/>} />,
  refresh:   (p) => <Icn {...p} d={<><path d="M20 12a8 8 0 10-3 6.2"/><path d="M20 5v5h-5"/></>} />,
  arrowR:    (p) => <Icn {...p} d={<><path d="M5 12h14M13 6l6 6-6 6"/></>} />,
  arrowUR:   (p) => <Icn {...p} d={<><path d="M7 17L17 7M9 7h8v8"/></>} />,
  globe:     (p) => <Icn {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>} />,
  dot:       (p) => <Icn {...p} d={<circle cx="12" cy="12" r="4"/>} />,
};

/* =============================================================
   TOPBAR
   ============================================================= */
function Topbar({ crumbs = [], onToggleTheme, isDark }) {
  return (
    <header className="wh-topbar">
      <WRWordmark size={18} />
      <div style={{ width: 1, height: 20, background: 'var(--rule-1)', marginLeft: 8 }} />
      <nav className="wh-crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? 'here' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </nav>
      <div className="spacer" />
      <div className="wh-search">
        <I.search />
        <input placeholder="Search records, agents, docs…" />
        <span className="wh-kbd"><span>⌘</span><span>K</span></span>
      </div>
      <div className="wh-top-actions">
        <button className="wh-btn ghost icon sm" title="Notifications"><I.bell /></button>
        <button className="wh-btn ghost icon sm" title="Toggle theme" onClick={onToggleTheme}>
          {isDark ? <I.sun /> : <I.moon />}
        </button>
        <div className="wh-avatar" title="Patricia Ruiz">PR</div>
      </div>
    </header>
  );
}

/* =============================================================
   SIDEBAR
   ============================================================= */
const SIDEBAR_GROUPS = [
  {
    title: "Workspace",
    items: [
      { id: "overview",  label: "Overview",   icon: I.home,     href: "Overview.html" },
      { id: "inbox",     label: "Inbox",      icon: I.inbox,    href: "#", count: 3 },
      { id: "tasks",     label: "Tasks",      icon: I.checklist,href: "Tasks.html",     count: 14 },
    ],
  },
  {
    title: "Accounting",
    items: [
      { id: "invoices",  label: "Sales invoices", icon: I.invoice, href: "Invoices.html",   count: 41 },
      { id: "expenses",  label: "Expenses",       icon: I.receipt, href: "Expenses.html",   count: 118 },
      { id: "documents", label: "Documents",      icon: I.file,    href: "#" },
    ],
  },
  {
    title: "CRM",
    items: [
      { id: "contacts",  label: "Contacts",   icon: I.users, href: "Contacts.html" },
      { id: "deals",     label: "Pipeline",   icon: I.kanban, href: "Pipeline.html" },
      { id: "products",  label: "Catalog",    icon: I.pkg,   href: "#" },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "bookings",  label: "Bookings",   icon: I.clock,  href: "Bookings.html", count: 12 },
    ],
  },
  {
    title: "Configure",
    items: [
      { id: "company",   label: "Company card", icon: I.building, href: "Onboarding.html" },
      { id: "settings",  label: "Settings",     icon: I.settings, href: "#" },
    ],
  },
];

function Sidebar({ active }) {
  return (
    <aside className="wh-side">
      <div className="wh-workspace">
        <div className="ws-meta">
          <div className="ws-mark">N</div>
          <div style={{ minWidth: 0 }}>
            <div className="ws-name">Northwind Robotics</div>
            <div className="ws-tag">ES · EUR · Owner</div>
          </div>
        </div>
        <I.chevD />
      </div>

      <nav className="wh-nav">
        {SIDEBAR_GROUPS.map(group => (
          <div className="wh-nav-group" key={group.title}>
            <div className="title">{group.title}</div>
            {group.items.map(it => {
              const Icon = it.icon;
              const isActive = it.id === active;
              return (
                <a key={it.id} href={it.href} className={`wh-nav-item ${isActive ? 'active' : ''}`}>
                  <Icon className="icn" />
                  <span>{it.label}</span>
                  {it.count != null && <span className="count">{it.count}</span>}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>
        v0.1.0 · API /v1 · OpenClaw
      </div>
    </aside>
  );
}

/* =============================================================
   AGENT DOCK — right rail
   ============================================================= */
const AGENT_PRESETS = {
  accounting: {
    name: "Accounting Agent",
    desc: "Books invoices & expenses. Knows ES/DE VAT.",
    icon: "€",
    stream: [
      { time: "09:42", actor: "You", body: "Record invoice FC-2026-0042 for Papelería Centro." },
      { time: "09:42", actor: "Agent", body: "Resolving supplier…", tool: { name: "business.resolve_contact", arg: "matchBy=[taxId,email]", result: "ct_000301 · created" } },
      { time: "09:42", actor: "Agent", body: "Document stored, OCR pending.", tool: { name: "business.create_expense", arg: "net=120.00 iva=25.20", result: "exp_000118 · recorded" } },
      { time: "09:43", actor: "Agent", body: "Expense recorded against office_supplies. Ready to approve?" },
    ],
  },
  advisor: {
    name: "Business Advisor",
    desc: "Reads your book, suggests next moves.",
    icon: "◆",
    stream: [
      { time: "08:15", actor: "Agent", body: "Q1 closed. Gross margin 38.4%, up 2.1pp vs Q4." },
      { time: "08:15", actor: "Agent", body: "3 suppliers are responsible for 62% of spend. Want a concentration report?" },
      { time: "10:02", actor: "You", body: "Yes — focus on last 90 days." },
      { time: "10:02", actor: "Agent", body: "Queued.", tool: { name: "business.report_supplier_concentration", arg: "window=90d", result: "running…" } },
    ],
  },
  marketing: {
    name: "Marketing Agent",
    desc: "Research, content, media generation.",
    icon: "✦",
    stream: [
      { time: "14:20", actor: "You", body: "Draft a follow-up email to Acme Retail after the proposal." },
      { time: "14:20", actor: "Agent", body: "Drafted. Reads professional, 112 words, mentions the warehouse audit workshop." },
      { time: "14:21", actor: "Agent", body: "Ready to send from billing@northwind.example?" },
    ],
  },
};

function AgentDock({ preset = "accounting" }) {
  const [collapsed, setCollapsed] = useState(false);
  const [pick, setPick] = useState(preset);
  const a = AGENT_PRESETS[pick];

  if (collapsed) {
    return (
      <aside className="wh-agent collapsed">
        <button className="wh-btn ghost icon sm" onClick={() => setCollapsed(false)} title="Expand agent">
          <I.sparkle />
        </button>
      </aside>
    );
  }

  return (
    <aside className="wh-agent">
      <div className="agent-head">
        <div className="wh-avatar agent">{a.icon}</div>
        <div>
          <div className="a-label">Agent</div>
          <div className="a-name">{a.name}</div>
        </div>
        <div className="a-status"><span className="pulse" />online</div>
        <button className="wh-btn ghost icon sm" onClick={() => setCollapsed(true)} title="Collapse">
          <I.chev />
        </button>
      </div>

      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--rule-1)' }}>
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          style={{
            width: '100%', background: 'transparent', border: 0,
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)',
            letterSpacing: '0.06em', textTransform: 'uppercase', outline: 0, padding: 0
          }}
        >
          <option value="accounting">Switch · Accounting</option>
          <option value="advisor">Switch · Advisor</option>
          <option value="marketing">Switch · Marketing</option>
        </select>
      </div>

      <div className="agent-stream">
        {a.stream.map((m, i) => (
          <div className="agent-msg" key={i}>
            <div>
              {m.actor === 'Agent'
                ? <div className="wh-avatar agent">{a.icon}</div>
                : <div className="wh-avatar">PR</div>}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink-1)' }}>{m.actor}</span>
                <span className="time">{m.time}</span>
              </div>
              <div className="body">{m.body}</div>
              {m.tool && (
                <div className="agent-tool">
                  <div className="tool-name">→ {m.tool.name}</div>
                  <div className="arg">{m.tool.arg}</div>
                  <div className="result">↳ {m.tool.result}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="agent-compose">
        <textarea placeholder={`Ask ${a.name.split(' ')[0]} anything. Shift+Enter for newline.`} />
        <div className="row">
          <div className="chips">
            <span className="agent-chip">/invoice</span>
            <span className="agent-chip">/expense</span>
            <span className="agent-chip">@Acme Retail</span>
          </div>
          <button className="wh-btn primary sm">
            <I.send size={13} />
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}

/* =============================================================
   THEME HOOK
   ============================================================= */
function useTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("wh-theme") === "dark"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("wh-theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);
  return [dark, () => setDark(d => !d)];
}

/* =============================================================
   SPARKLINE
   ============================================================= */
function Spark({ data = [], w = 120, h = 28 }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 2) - 1]);
  const line = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg className="wh-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path className="area" d={area} />
      <path className="line" d={line} />
    </svg>
  );
}

/* =============================================================
   SAMPLE DATA
   ============================================================= */
const EXPENSES = [
  { id: "exp_000118", date: "2026-03-25", supplier: "Papelería Centro SL",  number: "FC-2026-0042", category: "Office supplies", net: "120.00", tax: "25.20",  gross: "145.20", status: "recorded", due: "2026-04-24" },
  { id: "exp_000117", date: "2026-03-24", supplier: "Vodafone España",       number: "V-8810/26",     category: "Telecom",         net: "78.00",  tax: "16.38",  gross: "94.38",  status: "paid",     due: "2026-04-23" },
  { id: "exp_000116", date: "2026-03-22", supplier: "Amazon Business",       number: "AB-20998",      category: "IT & equipment",  net: "412.40", tax: "86.60",  gross: "499.00", status: "review",   due: "2026-04-21" },
  { id: "exp_000115", date: "2026-03-20", supplier: "AEAT",                  number: "—",             category: "Taxes",           net: "1840.00",tax: "0.00",   gross: "1840.00",status: "paid",     due: "2026-03-20" },
  { id: "exp_000114", date: "2026-03-18", supplier: "Endesa",                number: "EN-447812",     category: "Utilities",       net: "210.75", tax: "44.26",  gross: "255.01", status: "paid",     due: "2026-04-17" },
  { id: "exp_000113", date: "2026-03-16", supplier: "Figma Inc.",            number: "FG-2026-03",    category: "Software",        net: "180.00", tax: "0.00",   gross: "180.00", status: "paid",     due: "2026-03-16" },
  { id: "exp_000112", date: "2026-03-15", supplier: "Iberia Express",        number: "IB-29812",      category: "Travel",          net: "321.40", tax: "32.14",  gross: "353.54", status: "review",   due: "2026-03-15" },
  { id: "exp_000111", date: "2026-03-12", supplier: "Papelería Centro SL",   number: "FC-2026-0039",  category: "Office supplies", net: "62.10",  tax: "13.04",  gross: "75.14",  status: "paid",     due: "2026-04-11" },
  { id: "exp_000110", date: "2026-03-10", supplier: "Makro Madrid",          number: "MK-8012",       category: "Hospitality",     net: "144.20", tax: "14.42",  gross: "158.62", status: "paid",     due: "2026-04-09" },
];

const INVOICES = [
  { id: "sinv_000041", number: "2026-0041", issued: "2026-04-02", due: "2026-05-02", customer: "Acme Retail GmbH",       project: "Warehouse audit + automation",  net: "1500.00", tax: "315.00", gross: "1815.00", status: "sent" },
  { id: "sinv_000040", number: "2026-0040", issued: "2026-03-30", due: "2026-04-29", customer: "Lumafield SL",           project: "Q2 retainer · March",            net: "4000.00", tax: "840.00", gross: "4840.00", status: "paid" },
  { id: "sinv_000039", number: "2026-0039", issued: "2026-03-28", due: "2026-04-27", customer: "Mistral Supply Co.",     project: "Sorter integration · sprint 3",  net: "6200.00", tax: "1302.00",gross: "7502.00", status: "paid" },
  { id: "sinv_000038", number: "2026-0038", issued: "2026-03-18", due: "2026-04-17", customer: "Port of Algeciras",      project: "AGV fleet readiness",            net: "11400.00",tax: "2394.00",gross: "13794.00",status: "overdue" },
  { id: "sinv_000037", number: "2026-0037", issued: "2026-03-15", due: "2026-04-14", customer: "Kröger Logistik GmbH",   project: "WMS migration phase I",          net: "8000.00", tax: "1680.00",gross: "9680.00", status: "paid" },
  { id: "sinv_000036", number: "2026-0036", issued: "2026-03-11", due: "2026-04-10", customer: "Tanka Foods",            project: "Coldchain audit",                net: "2200.00", tax: "462.00", gross: "2662.00", status: "paid" },
  { id: "sinv_000035", number: "2026-0035", issued: "2026-03-08", due: "2026-04-07", customer: "Ochre & Oak",            project: "Fulfilment advisory",            net: "1200.00", tax: "252.00", gross: "1452.00", status: "draft" },
];

const CONTACTS = [
  { id: "ct_000245", type: "company", name: "Acme Retail GmbH",      role: "customer", country: "DE", city: "Berlin",    tax: "DE123456789", email: "ap@acme-retail.example",     deals: 3, openBalance: "1815.00", tags: ["priority","q2-target"] },
  { id: "ct_000244", type: "company", name: "Lumafield SL",          role: "customer", country: "ES", city: "Barcelona", tax: "B98765432",   email: "billing@lumafield.example",  deals: 2, openBalance: "0.00",    tags: ["retainer"] },
  { id: "ct_000242", type: "company", name: "Port of Algeciras",     role: "customer", country: "ES", city: "Cádiz",     tax: "P4567890J",   email: "contratacion@poa.example",   deals: 1, openBalance: "13794.00",tags: ["public-sector"] },
  { id: "ct_000301", type: "company", name: "Papelería Centro SL",   role: "supplier", country: "ES", city: "Madrid",    tax: "B87654321",   email: "facturas@papeleria.example", deals: 0, openBalance: "145.20",  tags: ["office"] },
  { id: "ct_000238", type: "company", name: "Mistral Supply Co.",    role: "both",     country: "FR", city: "Lyon",      tax: "FR83321456",  email: "finance@mistral.example",    deals: 4, openBalance: "0.00",    tags: ["integrator"] },
  { id: "ct_000234", type: "company", name: "Kröger Logistik GmbH",  role: "customer", country: "DE", city: "Hamburg",   tax: "DE887712345", email: "finance@kroger.example",     deals: 2, openBalance: "0.00",    tags: ["wms"] },
  { id: "ct_000231", type: "company", name: "Tanka Foods",           role: "customer", country: "ES", city: "Valencia",  tax: "B11223344",   email: "ap@tanka.example",           deals: 1, openBalance: "0.00",    tags: ["coldchain"] },
  { id: "ct_000229", type: "company", name: "Ochre & Oak",           role: "customer", country: "UK", city: "London",    tax: "GB442233",    email: "finance@ochre.example",      deals: 1, openBalance: "1452.00", tags: ["ecom"] },
  { id: "ct_000210", type: "company", name: "Vodafone España",       role: "supplier", country: "ES", city: "Madrid",    tax: "A80907397",   email: "empresas@vodafone.example",  deals: 0, openBalance: "0.00",    tags: ["telecom"] },
  { id: "ct_000201", type: "company", name: "Endesa",                role: "supplier", country: "ES", city: "Madrid",    tax: "A81948077",   email: "empresas@endesa.example",    deals: 0, openBalance: "255.01",  tags: ["utilities"] },
];

const DEALS = [
  { id: "deal_000072", title: "Warehouse audit & automation", customer: "Acme Retail GmbH",   stage: "won",        value: "1815.00",  close: "2026-04-02", owner: "PR", age: 14 },
  { id: "deal_000071", title: "Sorter integration sprint 4",  customer: "Mistral Supply Co.", stage: "proposal",   value: "9400.00",  close: "2026-04-18", owner: "PR", age: 9 },
  { id: "deal_000070", title: "Fleet readiness — Algeciras",  customer: "Port of Algeciras",  stage: "negotiation",value: "22000.00", close: "2026-04-22", owner: "LM", age: 21 },
  { id: "deal_000069", title: "WMS migration phase II",       customer: "Kröger Logistik",    stage: "qualified",  value: "14800.00", close: "2026-05-10", owner: "PR", age: 4 },
  { id: "deal_000068", title: "Coldchain retrofit",           customer: "Tanka Foods",        stage: "qualified",  value: "6400.00",  close: "2026-05-14", owner: "LM", age: 3 },
  { id: "deal_000067", title: "Black Friday fulfilment",      customer: "Ochre & Oak",        stage: "lead",       value: "3400.00",  close: "2026-06-02", owner: "PR", age: 2 },
  { id: "deal_000066", title: "Platform rollout Q3",          customer: "Lumafield SL",       stage: "proposal",   value: "18000.00", close: "2026-05-02", owner: "LM", age: 11 },
  { id: "deal_000065", title: "AGV fleet top-up",             customer: "Port of Algeciras",  stage: "lead",       value: "8400.00",  close: "2026-06-14", owner: "LM", age: 1 },
];

const TASKS = [
  { id: "tsk_0401", title: "Review supplier concentration report", project: "Internal / Finance",  assignee: "PR", agent: false, due: "today",       priority: "high",   status: "doing" },
  { id: "tsk_0402", title: "Approve expense FC-2026-0042",         project: "Internal / Finance",  assignee: "PR", agent: true,  due: "today",       priority: "med",    status: "todo" },
  { id: "tsk_0403", title: "Send invoice 2026-0041 to Acme",       project: "Acme Retail",         assignee: "Accounting", agent: true, due: "today",  priority: "high", status: "doing" },
  { id: "tsk_0404", title: "Draft Q2 proposal · Algeciras",        project: "Port of Algeciras",   assignee: "LM", agent: false, due: "Thu",         priority: "high",   status: "todo" },
  { id: "tsk_0405", title: "Chase overdue · Algeciras",            project: "Port of Algeciras",   assignee: "Advisor", agent: true, due: "Wed",     priority: "high",   status: "blocked" },
  { id: "tsk_0406", title: "Quarterly VAT submission (ES)",        project: "Internal / Finance",  assignee: "Accounting", agent: true, due: "Apr 20", priority: "high", status: "todo" },
  { id: "tsk_0407", title: "Onboarding call · Kröger Logistik",    project: "Kröger Logistik",     assignee: "PR", agent: false, due: "Apr 22",     priority: "med",    status: "todo" },
  { id: "tsk_0408", title: "Generate content calendar for May",    project: "Marketing",           assignee: "Marketing", agent: true, due: "Apr 24", priority: "med",  status: "todo" },
  { id: "tsk_0409", title: "Update company card · IBAN",           project: "Internal",            assignee: "PR", agent: false, due: "done",        priority: "low",    status: "done" },
  { id: "tsk_0410", title: "Reconcile March bank statement",       project: "Internal / Finance",  assignee: "Accounting", agent: true, due: "done",   priority: "med",  status: "done" },
];

/* =============================================================
   SMALL HELPERS
   ============================================================= */
const fmtEUR = (v) => "€" + Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (v) => {
  const n = Number(v);
  if (n >= 1_000_000) return "€" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return "€" + (n / 1_000).toFixed(1) + "k";
  return "€" + n.toFixed(0);
};

function StatusBadge({ status }) {
  const map = {
    recorded: { c: "", label: "recorded" },
    paid:     { c: "ok", label: "paid" },
    review:   { c: "warn", label: "review" },
    sent:     { c: "info", label: "sent" },
    draft:    { c: "", label: "draft" },
    overdue:  { c: "danger", label: "overdue" },
    won:      { c: "ok", label: "won" },
    lost:     { c: "danger", label: "lost" },
    todo:     { c: "", label: "todo" },
    doing:    { c: "info", label: "doing" },
    blocked:  { c: "danger", label: "blocked" },
    done:     { c: "ok", label: "done" },
  };
  const s = map[status] || { c: "", label: status };
  return <span className={`wh-badge ${s.c}`}><span className="dot" />{s.label}</span>;
}

/* =============================================================
   EMPLOYEES & BOOKINGS — sample data
   ============================================================= */
const EMPLOYEES = [
  { id: "ct_emp_000011", name: "Laura Mendes",     role: "Senior solutions engineer", initials: "LM", tz: "Europe/Madrid",
    bookable: true,  bookingTypes: ["visit","installation","maintenance"], bufferBefore: 30, bufferAfter: 30, maxPerDay: 3,
    weekly: { mon:[["09:00","13:00"],["15:00","18:00"]], tue:[["09:00","17:00"]], wed:[["09:00","17:00"]], thu:[["09:00","17:00"]], fri:[["09:00","14:00"]], sat:[], sun:[] } },
  { id: "ct_emp_000012", name: "Hugo Bentancor",   role: "Field technician",          initials: "HB", tz: "Europe/Madrid",
    bookable: true,  bookingTypes: ["installation","maintenance"],         bufferBefore: 15, bufferAfter: 30, maxPerDay: 4,
    weekly: { mon:[["08:00","17:00"]], tue:[["08:00","17:00"]], wed:[["08:00","17:00"]], thu:[["08:00","17:00"]], fri:[["08:00","17:00"]], sat:[], sun:[] } },
  { id: "ct_emp_000013", name: "Sofía Aragón",     role: "Customer success",          initials: "SA", tz: "Europe/Madrid",
    bookable: true,  bookingTypes: ["consultation","training","workshop"], bufferBefore: 15, bufferAfter: 15, maxPerDay: 5,
    weekly: { mon:[["10:00","18:00"]], tue:[["10:00","18:00"]], wed:[["10:00","18:00"]], thu:[["10:00","18:00"]], fri:[["10:00","16:00"]], sat:[], sun:[] } },
  { id: "ct_emp_000014", name: "Marek Jankowski",  role: "Robotics engineer",          initials: "MJ", tz: "Europe/Berlin",
    bookable: true,  bookingTypes: ["visit","installation"],               bufferBefore: 60, bufferAfter: 30, maxPerDay: 2,
    weekly: { mon:[["09:00","17:00"]], tue:[["09:00","17:00"]], wed:[["09:00","13:00"]], thu:[["09:00","17:00"]], fri:[["09:00","17:00"]], sat:[], sun:[] } },
  { id: "ct_emp_000015", name: "Patricia Ruiz",    role: "Owner",                      initials: "PR", tz: "Europe/Madrid",
    bookable: false, bookingTypes: ["consultation"],                        bufferBefore: 0,  bufferAfter: 0,  maxPerDay: null,
    weekly: { mon:[["10:00","12:00"]], tue:[], wed:[["10:00","12:00"]], thu:[], fri:[["10:00","12:00"]], sat:[], sun:[] } },
];

// Anchor: Mon 27 Apr 2026
const BOOKINGS = [
  { id: "book_000091", title: "Warehouse automation discovery visit", customer: "Acme Retail GmbH",  customerId: "ct_000245",
    serviceType: "visit",        status: "confirmed",   day: "tue", start: "09:00", end: "11:00", date: "2026-04-28",
    timezone: "Europe/Madrid", location: { kind: "on_site", label: "Acme Retail warehouse · Madrid Norte" },
    assigned: ["ct_emp_000011","ct_emp_000012"], deal: "deal_000072", project: "proj_000018", notes: "Focus on packing line bottlenecks." },
  { id: "book_000092", title: "WMS migration kickoff",                customer: "Kröger Logistik",   customerId: "ct_000234",
    serviceType: "consultation", status: "confirmed",   day: "mon", start: "10:00", end: "11:30", date: "2026-04-27",
    timezone: "Europe/Madrid", location: { kind: "remote", label: "Google Meet" },
    assigned: ["ct_emp_000013"], deal: null, project: "proj_000019", notes: "Expect 4 stakeholders." },
  { id: "book_000093", title: "Sorter recalibration · routine",       customer: "Mistral Supply Co.",customerId: "ct_000238",
    serviceType: "maintenance",  status: "in_progress", day: "mon", start: "14:00", end: "16:00", date: "2026-04-27",
    timezone: "Europe/Madrid", location: { kind: "on_site", label: "Mistral Lyon DC" },
    assigned: ["ct_emp_000014"], deal: "deal_000071", project: "proj_000017", notes: "Bring spare belt segment." },
  { id: "book_000094", title: "AGV fleet site survey",                customer: "Port of Algeciras", customerId: "ct_000242",
    serviceType: "visit",        status: "tentative",   day: "wed", start: "11:00", end: "14:00", date: "2026-04-29",
    timezone: "Europe/Madrid", location: { kind: "on_site", label: "Algeciras · Terminal 4" },
    assigned: ["ct_emp_000011","ct_emp_000014"], deal: "deal_000070", project: "proj_000016", notes: "Travel day before." },
  { id: "book_000095", title: "Operator training session 2",          customer: "Lumafield SL",      customerId: "ct_000244",
    serviceType: "training",     status: "confirmed",   day: "wed", start: "09:30", end: "11:00", date: "2026-04-29",
    timezone: "Europe/Madrid", location: { kind: "on_site", label: "Lumafield Barcelona HQ" },
    assigned: ["ct_emp_000013"], deal: null, project: "proj_000022", notes: "Bring printed quick-reference cards." },
  { id: "book_000096", title: "Coldchain audit walkthrough",          customer: "Tanka Foods",       customerId: "ct_000231",
    serviceType: "consultation", status: "confirmed",   day: "thu", start: "10:00", end: "12:00", date: "2026-04-30",
    timezone: "Europe/Madrid", location: { kind: "on_site", label: "Tanka Valencia plant" },
    assigned: ["ct_emp_000011"], deal: null, project: "proj_000021", notes: "" },
  { id: "book_000097", title: "Phase II proposal review",             customer: "Kröger Logistik",   customerId: "ct_000234",
    serviceType: "consultation", status: "confirmed",   day: "thu", start: "15:00", end: "16:00", date: "2026-04-30",
    timezone: "Europe/Madrid", location: { kind: "remote", label: "Zoom" },
    assigned: ["ct_emp_000013","ct_emp_000015"], deal: "deal_000069", project: "proj_000019", notes: "" },
  { id: "book_000098", title: "Quarterly check-in",                   customer: "Ochre & Oak",       customerId: "ct_000229",
    serviceType: "consultation", status: "tentative",   day: "fri", start: "10:30", end: "11:30", date: "2026-05-01",
    timezone: "Europe/Madrid", location: { kind: "phone", label: "Phone" },
    assigned: ["ct_emp_000013"], deal: null, project: null, notes: "" },
  { id: "book_000099", title: "Workshop · packing line redesign",     customer: "Acme Retail GmbH",  customerId: "ct_000245",
    serviceType: "workshop",     status: "confirmed",   day: "fri", start: "13:30", end: "17:00", date: "2026-05-01",
    timezone: "Europe/Madrid", location: { kind: "on_site", label: "Acme Retail Madrid Norte" },
    assigned: ["ct_emp_000011","ct_emp_000012","ct_emp_000013"], deal: "deal_000072", project: "proj_000018", notes: "Whiteboard + 3 facilitators." },
  { id: "book_000100", title: "Site assessment · Black Friday prep",  customer: "Ochre & Oak",       customerId: "ct_000229",
    serviceType: "visit",        status: "tentative",   day: "tue", start: "14:30", end: "16:00", date: "2026-04-28",
    timezone: "Europe/Madrid", location: { kind: "remote", label: "Google Meet" },
    assigned: ["ct_emp_000013"], deal: "deal_000067", project: null, notes: "" },
  { id: "book_000101", title: "Conveyor maintenance · monthly",       customer: "Mistral Supply Co.",customerId: "ct_000238",
    serviceType: "maintenance",  status: "completed",   day: "mon", start: "08:00", end: "09:30", date: "2026-04-27",
    timezone: "Europe/Madrid", location: { kind: "on_site", label: "Mistral Lyon DC" },
    assigned: ["ct_emp_000012"], deal: null, project: "proj_000017", notes: "Routine. No issues found." },
  { id: "book_000102", title: "Installation · pick-to-light",         customer: "Kröger Logistik",   customerId: "ct_000234",
    serviceType: "installation", status: "confirmed",   day: "tue", start: "11:00", end: "16:00", date: "2026-04-28",
    timezone: "Europe/Berlin", location: { kind: "on_site", label: "Kröger Hamburg DC · Aisle 12" },
    assigned: ["ct_emp_000014","ct_emp_000012"], deal: "deal_000069", project: "proj_000019", notes: "Bring rack-mount adapters." },
];

const AVAILABILITY_EXCEPTIONS = [
  { id: "bex_000001", contactId: "ct_emp_000011", kind: "time_off",           start: "2026-05-04", end: "2026-05-08", reason: "vacation",       notes: "" },
  { id: "bex_000002", contactId: "ct_emp_000012", kind: "blocked",            start: "2026-04-29", end: "2026-04-29", reason: "training",       notes: "Internal certification." },
  { id: "bex_000003", contactId: "ct_emp_000013", kind: "available_override", start: "2026-05-02", end: "2026-05-02", reason: "Saturday slot",  notes: "Customer-specific." },
];

/* Export to window */
Object.assign(window, {
  WRMark, WRWordmark, I,
  Topbar, Sidebar, AgentDock,
  useTheme, Spark,
  EXPENSES, INVOICES, CONTACTS, DEALS, TASKS, EMPLOYEES, BOOKINGS, AVAILABILITY_EXCEPTIONS,
  fmtEUR, fmtShort, StatusBadge,
});
