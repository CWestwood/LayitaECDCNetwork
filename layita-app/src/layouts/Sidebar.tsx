import { useState, useEffect } from "react";
import { supabase } from "../features/auth/supabaseClient";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../routes/Navitems";
import logo from "../assets/layitalogosvg.svg";
import { useAuth }  from "../features/auth/useAuth";

interface UserProfile {
  name: string;
  role: string;
}

export default function Sidebar({ footer = null, defaultCollapsed = false }) {

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { isAdmin, loading } = useAuth()
  const visibleItems = loading
    ? []
    : NAV_ITEMS.filter(item =>
        !item.hiddenFromNav &&
        (item.role === "all" || (item.role === "admin" && isAdmin) || (item.role === "staff" && !isAdmin)) &&
        !(isAdmin && item.hideForAdmin)
      );

  useEffect(() => {
    async function getProfile() {
      // 1. Get the current authenticated user's ID
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // 2. Fetch the name and role from the 'profiles' table
        const { data, error } = await supabase
          .from('profiles')
          .select('name, role')
          .eq('id', user.id)
          .single(); // We only expect one row

        if (!error && data) {
          setProfile(data);
        }
      }
    }
    getProfile();
  }, []); 

  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar__top">
        <div className="sidebar__logo-area">
          <img src={logo} alt="Layita Logo" className="sidebar__logo" />
        </div>
        <button
          className="sidebar__collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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

      <div className="sidebar__footer">
        {footer && (
          <div className="sidebar__custom-footer" style={{ marginBottom: '16px', width: '100%' }}>
            {footer}
          </div>
        )}
        
        <div className="sidebar__user" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="sidebar__user-info" style={{ overflow: 'hidden' }}>
            <div className="sidebar__user-name">{profile?.name || "Admin User"}</div>
            <div className="sidebar__user-role" style={{ textTransform: 'capitalize' }}>{profile?.role || "Administrator"}</div>
          </div>
          <button 
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
