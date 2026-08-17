import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { NAV_ITEMS } from "../routes/Navitems";
import logo from "../assets/layitalogosvg.svg";
import { useAuth }  from "../features/auth/useAuth";

interface SidebarProps {
  footer?: ReactNode;
  defaultCollapsed?: boolean;
}

export default function Sidebar({ footer = null, defaultCollapsed = false }: SidebarProps) {
  const { isAdmin, loading, can, profile, role, session, signOut } = useAuth();
  const visibleItems = loading
    ? []
    : NAV_ITEMS.filter(item =>
        !item.hiddenFromNav &&
        (!item.capability || can(item.capability)) &&
        !(isAdmin && item.hideForAdmin)
      );

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('layita-sidebar-collapsed') === 'true' || defaultCollapsed);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { localStorage.setItem('layita-sidebar-collapsed', String(collapsed)); }, [collapsed]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign out failed');
    }
  };

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar__top">
        <div className="sidebar__logo-area">
          <img src={logo} alt="Layita Logo" className="sidebar__logo" />
        </div>
        <button
          type="button"
          className="sidebar__collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            {collapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      <nav className="sidebar__nav">
        <ul>
          {/* Note: If you want to add the "nav-section-label" (e.g., "Overview", "Programme") 
              like in the HTML, you will need to update your NAV_ITEMS array to include section 
              headers and map through them here. */}
          {visibleItems.map(({ to, label, icon, mobilePrimary }) => (
            <li key={to} data-mobile-primary={mobilePrimary !== false ? "true" : "false"}>
              <NavLink
                to={to}
                className={({ isActive }) => (isActive ? "active" : "")}
                data-tooltip={label}
              >
                <span className="sidebar__nav-icon">{icon}</span>
                <span className="sidebar__nav-label">{label}</span>
              </NavLink>
            </li>
          ))}
          {visibleItems.some((item) => !item.mobilePrimary) && <li className="sidebar__more-mobile"><button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-label="More navigation"><span className="sidebar__nav-icon">•••</span><span className="sidebar__nav-label">More</span></button></li>}

          {/* Mobile-only logout button (hidden on desktop via CSS) */}
          <li className="sidebar__nav-logout-mobile">
            <a
              href="#logout"
              onClick={(e) => {
                e.preventDefault();
                handleLogout();
              }}
              data-tooltip="Log out"
            >
              <span className="sidebar__nav-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
              <span className="sidebar__nav-label">Log out</span>
            </a>
          </li>
        </ul>
      </nav>
      {moreOpen && <div className="sidebar__mobile-menu" role="dialog" aria-label="More navigation"><div className="sidebar__mobile-menu-head"><strong>More</strong><button onClick={() => setMoreOpen(false)} aria-label="Close more navigation">×</button></div>{visibleItems.filter((item) => !item.mobilePrimary).map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)}>{item.icon}<span>{item.label}</span></NavLink>)}</div>}

      <div className="sidebar__footer">
        {footer && (
          <div className="sidebar__custom-footer" style={{ marginBottom: '16px', width: '100%' }}>
            {footer}
          </div>
        )}
        
        <div className="sidebar__user" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="sidebar__user-info" style={{ overflow: 'hidden' }}>
            <div className="sidebar__user-name">{profile?.name || session?.user.email || "Signed in"}</div>
            <div className="sidebar__user-role" style={{ textTransform: 'capitalize' }}>{role || "User"}</div>
          </div>
          <button 
            type="button"
            onClick={handleLogout} 
            title="Log out"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted, #6B7280)', padding: '6px', display: 'flex', alignItems: 'center', transition: 'color 0.2s', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
