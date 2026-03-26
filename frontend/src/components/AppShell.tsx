import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState, type PropsWithChildren } from "react";
import { formatMoney } from "../app/utils";
import type { MagnusUser } from "../app/types";
import { BrandLogo } from "./BrandLogo";

interface AppShellProps extends PropsWithChildren {
  amiConnected: boolean;
  user: MagnusUser;
  onLogout: () => void;
  onRefreshBalance: () => void;
}

export function AppShell({
  amiConnected,
  user,
  onLogout,
  onRefreshBalance,
  children,
}: AppShellProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="app-frame">
      {sidebarOpen ? <div className="mobile-sidebar-scrim" onClick={() => setSidebarOpen(false)} /> : null}

      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar-brand">
          <BrandLogo context="sidebar" />
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Workspace</div>
          <SidebarLink to="/campaigns" icon="campaigns" label="Campaigns" end />
          <SidebarLink to="/ivrs" icon="ivr" label="IVR" />
          <SidebarLink to="/run" icon="run" label="Run Campaign" />
          <div className="nav-group">
            <SidebarLink to="/history" icon="history" label="CDR / History" />
            <div className="nav-sub">
              <SidebarLink to="/history?status=answered" label="Answered" subItem />
              <SidebarLink to="/history?status=failed-group" label="Failed / Errors" subItem />
            </div>
          </div>
          <SidebarLink to="/reports" icon="reports" label="Reports" />
          <SidebarLink to="/contacts" icon="contacts" label="Contact Lists" />
          <SidebarLink to="/agents" icon="agents" label="Agents" />
          <SidebarLink to="/sip" icon="sip" label="SIP Trunks" />
        </nav>

        <div className="sidebar-footer">
          <div className="account-panel">
            <div className="account-panel__row">
              <span className="account-panel__eyebrow">ACCOUNT</span>
              <button className="link-button" type="button" onClick={onLogout}>
                Sign out
              </button>
            </div>
            <div className="account-panel__name">
              {user.username}
              {user.firstname ? ` (${user.firstname})` : ""}
            </div>
            <div className="account-panel__row account-panel__row--bottom">
              <span className="account-panel__balance">{formatMoney(user.credit)}</span>
              <button className="link-button" type="button" onClick={onRefreshBalance} title="Refresh balance">
                ↻
              </button>
            </div>
          </div>

          <div className="ami-badge">
            <div className={`ami-dot${amiConnected ? " on" : ""}`} />
            <div>
              <div className="ami-badge__title">{amiConnected ? "AMI Online" : "AMI Offline"}</div>
              <div className="ami-badge__sub">Asterisk AMI</div>
            </div>
          </div>

        </div>
      </aside>

      <div className="shell-main">
        <div className="shell-mobilebar">
          <button className="mobile-nav-toggle" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <span className="mobile-nav-toggle__bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}

interface SidebarLinkProps {
  to: string;
  icon?: IconName;
  label: string;
  end?: boolean;
  subItem?: boolean;
}

function SidebarLink({ to, icon, label, end, subItem = false }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `${subItem ? "nav-sub-item" : "nav-item"}${isActive ? " active" : ""}`
      }
    >
      {icon ? (
        <span className="nav-icon">
          <SidebarGlyph name={icon} />
        </span>
      ) : (
        <span className="nav-sub-dot" aria-hidden="true" />
      )}
      <span className="nav-label">{label}</span>
    </NavLink>
  );
}

type IconName = "campaigns" | "ivr" | "run" | "history" | "contacts" | "agents" | "sip" | "reports";

function SidebarGlyph({ name }: { name: IconName }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "campaigns":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
          <path d="M7 8.5h10M7 12h6M7 15.5h8" />
        </svg>
      );
    case "run":
      return (
        <svg {...commonProps}>
          <path d="M8 6.5v11l9-5.5-9-5.5Z" />
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        </svg>
      );
    case "ivr":
      return (
        <svg {...commonProps}>
          <path d="M6 7.5h12" />
          <path d="M6 12h5" />
          <path d="M13.5 12h4.5" />
          <path d="M6 16.5h3.5" />
          <path d="M12.5 16.5h5.5" />
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        </svg>
      );
    case "history":
      return (
        <svg {...commonProps}>
          <path d="M12 7v5l3 2" />
          <path d="M20 12a8 8 0 1 1-2.35-5.66" />
          <path d="M20 4v4h-4" />
        </svg>
      );
    case "contacts":
      return (
        <svg {...commonProps}>
          <path d="M8.5 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M15.5 10.5a2.5 2.5 0 1 0 0-5" />
          <path d="M4.5 18.5a4.5 4.5 0 0 1 8 0" />
          <path d="M14 18.5a4 4 0 0 1 5.5-3.7" />
        </svg>
      );
    case "agents":
      return (
        <svg {...commonProps}>
          <path d="M4 12a8 8 0 0 1 16 0" />
          <path d="M6.5 12v4a2 2 0 0 1-2 2H4v-6h2.5Z" />
          <path d="M17.5 12H20v6h-.5a2 2 0 0 1-2-2v-4Z" />
          <path d="M9.5 18.5h5" />
        </svg>
      );
    case "sip":
      return (
        <svg {...commonProps}>
          <path d="M9 7.5h6" />
          <path d="M9 12h6" />
          <path d="M9 16.5h3" />
          <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
        </svg>
      );
    case "reports":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
          <path d="M7 16v-3" />
          <path d="M10.5 16V10" />
          <path d="M14 16v-5" />
          <path d="M17.5 16V8" />
        </svg>
      );
  }
}
