/* global React */
/* Warehouse Hub — mobile shell.
   Composes on top of shell.jsx (uses I, WRWordmark, AGENT_PRESETS, etc.)
   Provides: MAppShell, MTopbar, MTabBar, MDrawer, MAgentSheet, MFiltersSheet
*/

const { useState: useM_State, useEffect: useM_Effect } = React;

const M_TABS = [
  { id: "overview", label: "Home",     icon: I.home,      href: "Overview.html" },
  { id: "tasks",    label: "Tasks",    icon: I.checklist, href: "Mobile-Tasks.html",    count: 14 },
  { id: "new",      label: "New",      icon: I.plus,      href: "#",      fab: true },
  { id: "invoices", label: "Invoices", icon: I.invoice,   href: "Mobile-Invoices.html", count: 41 },
  { id: "contacts", label: "Contacts", icon: I.users,     href: "Mobile-Contacts.html" },
];

function MTopbar({ kicker, title, onMenu, onSearch, onAgent }) {
  return (
    <header className="wh-m-top">
      <button className="wh-m-icon-btn" onClick={onMenu} aria-label="Menu">
        <I.menu />
      </button>
      <div className="crumb">
        {kicker && <div className="kicker">{kicker}</div>}
        <div className="title">{title}</div>
      </div>
      <button className="wh-m-icon-btn" onClick={onSearch} aria-label="Search">
        <I.search />
      </button>
      <button className="wh-m-icon-btn has-dot" onClick={onAgent} aria-label="Agent">
        <I.sparkle />
      </button>
    </header>
  );
}

function MTabBar({ active, onNew }) {
  return (
    <nav className="wh-m-tabs" aria-label="Primary">
      {M_TABS.map(t => {
        const Icon = t.icon;
        if (t.fab) {
          return (
            <a key={t.id} href={t.href} className="wh-m-tab fab" onClick={(e) => { e.preventDefault(); onNew && onNew(); }}>
              <span className="pill"><Icon /></span>
              <span style={{ marginTop: 2 }}>{t.label}</span>
            </a>
          );
        }
        return (
          <a key={t.id} href={t.href} className={`wh-m-tab ${active === t.id ? "active" : ""}`}>
            <Icon />
            <span>{t.label}</span>
            {t.count != null && t.count > 0 && <span className="count">{t.count > 99 ? "99+" : t.count}</span>}
          </a>
        );
      })}
    </nav>
  );
}

const M_DRAWER_GROUPS = [
  {
    title: "Workspace",
    items: [
      { id: "overview",  label: "Overview",       icon: I.home,      href: "Overview.html" },
      { id: "inbox",     label: "Inbox",          icon: I.inbox,     href: "#", count: 3 },
      { id: "tasks",     label: "Tasks",          icon: I.checklist, href: "Mobile-Tasks.html", count: 14 },
    ],
  },
  {
    title: "Accounting",
    items: [
      { id: "invoices",  label: "Sales invoices", icon: I.invoice, href: "Mobile-Invoices.html", count: 41 },
      { id: "expenses",  label: "Expenses",       icon: I.receipt, href: "Expenses.html", count: 118 },
      { id: "documents", label: "Documents",      icon: I.file,    href: "#" },
    ],
  },
  {
    title: "CRM",
    items: [
      { id: "contacts",  label: "Contacts",   icon: I.users,  href: "Mobile-Contacts.html" },
      { id: "deals",     label: "Pipeline",   icon: I.kanban, href: "Pipeline.html" },
    ],
  },
  {
    title: "Configure",
    items: [
      { id: "settings",  label: "Settings", icon: I.settings, href: "#" },
    ],
  },
];

function MDrawer({ open, onClose, active }) {
  return (
    <>
      <div className={`wh-m-scrim ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`wh-m-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="ws">
          <div className="mk">N</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">Northwind Robotics</div>
            <div className="tg">ES · EUR · Owner</div>
          </div>
          <button className="wh-m-icon-btn" onClick={onClose} aria-label="Close"><I.close /></button>
        </div>
        <nav>
          {M_DRAWER_GROUPS.map(g => (
            <div className="nav-grp" key={g.title}>
              <div className="t">{g.title}</div>
              {g.items.map(it => {
                const Icon = it.icon;
                return (
                  <a key={it.id} href={it.href} className={`nav-it ${it.id === active ? "active" : ""}`}>
                    <Icon className="icn" />
                    <span>{it.label}</span>
                    {it.count != null && <span className="count">{it.count}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--rule-1)", display: "flex", alignItems: "center", gap: 10 }}>
          <div className="wh-avatar">PR</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Patricia Ruiz</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)" }}>patricia@northwind.example</div>
          </div>
        </div>
      </aside>
    </>
  );
}

function MAgentSheet({ open, onClose, preset = "accounting" }) {
  const a = AGENT_PRESETS[preset];
  return (
    <>
      <div className={`wh-m-scrim ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`wh-m-sheet ${open ? "open" : ""}`} role="dialog" aria-label="Agent">
        <div className="grabber" />
        <div className="sheet-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="wh-avatar agent" style={{ width: 32, height: 32, fontSize: 14 }}>{a.icon}</div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>Agent</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{a.name}</div>
            </div>
          </div>
          <button className="wh-m-icon-btn" onClick={onClose} aria-label="Close"><I.close /></button>
        </div>
        <div className="sheet-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {a.stream.map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10 }}>
                <div>
                  {m.actor === "Agent"
                    ? <div className="wh-avatar agent">{a.icon}</div>
                    : <div className="wh-avatar">PR</div>}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{m.actor}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)" }}>{m.time}</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 2 }}>{m.body}</div>
                  {m.tool && (
                    <div className="agent-tool" style={{ marginTop: 6 }}>
                      <div className="tool-name">→ {m.tool.name}</div>
                      <div className="arg">{m.tool.arg}</div>
                      <div className="result">↳ {m.tool.result}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--rule-1)", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--paper-1)" }}>
          <textarea
            placeholder={`Ask ${a.name.split(" ")[0]} anything…`}
            style={{
              width: "100%", minHeight: 56, resize: "none",
              background: "var(--paper-0)", border: "1px solid var(--rule-1)",
              borderRadius: 8, padding: 10, fontSize: 14, color: "var(--ink-1)", outline: 0,
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="agent-chip">/invoice</span>
            <span className="agent-chip">/expense</span>
            <div style={{ flex: 1 }} />
            <button className="wh-btn primary sm"><I.send size={13} /> Send</button>
          </div>
        </div>
      </div>
    </>
  );
}

function MAgentFab({ onClick, preset = "accounting" }) {
  const a = AGENT_PRESETS[preset];
  return (
    <button className="wh-m-agent-fab" onClick={onClick}>
      <span className="av">{a.icon}</span>
      <span>{a.name.split(" ")[0]}</span>
      <span className="pulse" />
    </button>
  );
}

/* The mobile shell wrapper. Pass: active (tab id), kicker, title, agentPreset, hasActionBar.
   Children render inside .wh-m-page. */
function MAppShell({ active, kicker, title, agentPreset = "accounting", hasActionBar = false, hideAgentFab = false, children }) {
  const [drawerOpen, setDrawerOpen] = useM_State(false);
  const [agentOpen,  setAgentOpen]  = useM_State(false);

  // theme on init
  useM_Effect(() => {
    try { if (localStorage.getItem("wh-theme") === "dark") document.documentElement.classList.add("dark"); } catch {}
  }, []);

  return (
    <div className={`wh-m-app ${hasActionBar ? "has-action-bar" : ""}`}>
      <MTopbar
        kicker={kicker}
        title={title}
        onMenu={() => setDrawerOpen(true)}
        onAgent={() => setAgentOpen(true)}
        onSearch={() => {}}
      />
      <main className="wh-m-page">{children}</main>
      {!hideAgentFab && <MAgentFab onClick={() => setAgentOpen(true)} preset={agentPreset} />}
      <MTabBar active={active} />
      <MDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} active={active} />
      <MAgentSheet open={agentOpen} onClose={() => setAgentOpen(false)} preset={agentPreset} />
    </div>
  );
}

Object.assign(window, {
  MTopbar, MTabBar, MDrawer, MAgentSheet, MAgentFab, MAppShell,
});
