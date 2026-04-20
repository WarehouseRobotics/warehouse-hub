/* global React, ReactDOM */
/* Boot helper: mounts the app shell (topbar + sidebar + main slot + agent dock) */
const { createRoot } = ReactDOM;

function AppShell({ active, crumbs, children, agentPreset }) {
  const [dark, toggle] = useTheme();
  return (
    <div className="wh-app">
      <Topbar crumbs={crumbs} onToggleTheme={toggle} isDark={dark} />
      <Sidebar active={active} />
      <main className="wh-main">{children}</main>
      <AgentDock preset={agentPreset || "accounting"} />
    </div>
  );
}

window.AppShell = AppShell;
window.mountApp = function mountApp(node) {
  const root = document.getElementById("app");
  createRoot(root).render(node);
};
