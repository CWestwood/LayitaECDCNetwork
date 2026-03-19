import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, Tooltip } from "react-leaflet";
import { NavLink } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../services/supabaseClient";
import { themeColors } from "../constants/layita_colors";
import logo from '../assets/layitalogo.svg';


// ─────────────────────────────────────────────────────────────────────────────
// GROUP COLOR MAPPING
// ─────────────────────────────────────────────────────────────────────────────
export const GROUP_COLORS = {
  "default":                                        { fill: "#9aa5b1", border: "#ffffff", glow: "rgba(154,165,177,0.5)" },
  "ss group 1 (2023)":                              { fill: "#2d6b73", border: "#ffffff", glow: "rgba(45,107,115,0.5)"  },
  "ss group 2 (feb 2024)":                          { fill: "#1990c4", border: "#ffffff", glow: "rgba(25,144,196,0.5)"  },
  "ss group 3 (oct 2024 - mpakama a/a training)":   { fill: "#6854a5", border: "#ffffff", glow: "rgba(104,84,165,0.5)"  },
  "ss group 4 (oct 2024 - madwaleni training)":     { fill: "#fc8438", border: "#ffffff", glow: "rgba(252,132,56,0.5)"  },
  "ss group 5 (nov 2025 elliotdale)":               { fill: "#c0392b", border: "#ffffff", glow: "rgba(192,57,43,0.5)"   },
  "ss group 6 (nov 2025 mqanduli)":                 { fill: "#956c00", border: "#ffffff", glow: "rgba(149,108,0,0.5)"   },
  "siyakholwa group":                               { fill: "#1e7e44", border: "#ffffff", glow: "rgba(30,126,68,0.5)"   },
  "person interested in joining":                   { fill: "#d96520", border: "#ffffff", glow: "rgba(217,101,32,0.5)"  },
  "other":                                          { fill: "#637381", border: "#ffffff", glow: "rgba(99,115,129,0.5)"  },
};

const resolveGroupColor = (groupName) => {
  if (!groupName) return GROUP_COLORS["default"];
  return GROUP_COLORS[groupName.toLowerCase().trim()] ?? GROUP_COLORS["default"];
};

// ── Visit preset options ──────────────────────────────────────────────────────
const VISIT_PRESETS = [
  {
    key: "visit_this_year",
    label: "Visited this year",
    matchFn: (lastVisit, now) => {
      if (!lastVisit) return true;
      return lastVisit >= `${now.getFullYear()}-01-01`;
    },
  },
  {
    key: "this_year",
    label: "Not visited this year",
    matchFn: (lastVisit, now) => {
      if (!lastVisit) return true;
      return lastVisit < `${now.getFullYear()}-01-01`;
    },
  },
  {
    key: "6months",
    label: "More than 6 months ago",
    matchFn: (lastVisit, now) => {
      if (!lastVisit) return true;
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 6);
      return lastVisit < cutoff.toISOString().slice(0, 10);
    },
  },
  {
    key: "1year",
    label: "More than 1 year ago",
    matchFn: (lastVisit, now) => {
      if (!lastVisit) return true;
      const cutoff = new Date(now);
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      return lastVisit < cutoff.toISOString().slice(0, 10);
    },
  },
  {
    key: "never",
    label: "No recorded visits",
    matchFn: (lastVisit) => !lastVisit,
  },
];

// ── Custom marker icon ────────────────────────────────────────────────────────
const createCustomIcon = (isSelected, groupName) => {
  const c = resolveGroupColor(groupName);
  const size = isSelected ? 18 : 10;
  const fill = isSelected ? "#ffffff" : c.fill;
  const border = isSelected ? c.fill : "#ffffff";
  const glow = isSelected ? c.glow : "rgba(0,0,0,0.18)";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${fill};
      border:2.5px solid ${border};
      border-radius:50%;
      box-shadow:0 1px ${isSelected ? 8 : 4}px ${glow};
      transition:all 0.2s ease;
    "></div>`,
    iconAnchor: [size / 2, size / 2],
  });
};

// ── Landmark icon helper ──────────────────────────────────────────────────────
const getLandmarkIcon = (lm) => {
  let svg = "";
  const t = (lm?.type || "").toLowerCase();

  if (t === "clinic") {
    svg = `<svg fill="#1990c4" version="1.1" xmlns="http://www.w3.org/2000/svg"
              width="20" height="20" viewBox="0 0 50.596 49.994" xml:space="preserve">
            <path d="M48.648,15.387H35.026V1.925C35.026,0.862,34.159,0,33.083,0H17.512c-1.074,0-1.941,0.862-1.941,1.925v13.461H1.948
              C0.873,15.387,0,16.245,0,17.307v15.385c0,1.062,0.873,1.916,1.947,1.916h13.623v13.463c0,1.06,0.867,1.923,1.941,1.923h15.571
              c1.075,0,1.941-0.863,1.941-1.923V34.608h13.622c1.075,0,1.948-0.854,1.948-1.916V17.307C50.596,16.245,49.723,15.387,48.648,15.387z"/>
            </svg>`;
  } else if (t === "hospital") {
    svg = `<svg width="18" height="18" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><path d="M56.609 1.114s-48.788-.015-48.774 0C3.338 1.114.81 3.439.81 8.188v48.966c0 4.443 2.273 6.769 6.766 6.769h49.173c4.493 0 6.769-2.21 6.769-6.769V8.188c.001-4.634-2.275-7.074-6.909-7.074zm-8.343 52.518h-8.302v-17.82H24.469v17.82h-8.301V13.896h8.301v15.053h15.495V13.896h8.302v39.736z" fill="#c0392b"></path></svg>`;
  } else if (t === "ngo") {
    svg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fc8438" stroke-width="2" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke-linecap="round"/></svg>`;
  } else {
    svg = `<svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <rect width="16" height="16" fill="#1e7e44" />
  <path fill="#ffffff" d="M0,8v7h3v-4h3v4h6V8L6,3L0,8z M10,1L7.6,3L13,7.5V13h3V6L10,1z" />
</svg>`;
  }

  return L.divIcon({
    className: "landmark-icon",
    html: `<div style="display:flex;align-items:center;justify-content:center;filter:drop-shadow(0px 1px 3px rgba(0,0,0,0.25));">
      ${svg}
      <div style="position:absolute;top:22px;background:rgba(255,255,255,0.92);color:#1a2027;font-size:0.5rem;font-family:'DM Sans',sans-serif;padding:1px 4px;border-radius:3px;white-space:nowrap;pointer-events:none;border:1px solid #d1d9e0;">
        ${lm?.name || "Landmark"}
      </div>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [10, 10],
  });
};

// ── FlyTo helper ──────────────────────────────────────────────────────────────
function FlyToSelected({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.flyTo([location.latitude, location.longitude], 13, { duration: 0.9 });
  }, [location, map]);
  return null;
}

// ── Training filter config ────────────────────────────────────────────────────
const TRAINING_FILTERS = [
  { key: "smart_start_ever",  label: "Smart Start"   },
  { key: "first_aid_ever",    label: "First Aid"     },
  { key: "level4_ever",       label: "Level 4"       },
  { key: "level5_ever",       label: "Level 5"       },
  { key: "wordworks03_ever",  label: "WordWorks 0–3" },
  { key: "wordworks35_ever",  label: "WordWorks 3–5" },
  { key: "littlestars_ever",  label: "Little Stars"  },
];

// ── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    to: "/practitioners", label: "Practitioners",
    icon: <svg style={{width:16,height:18,flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  },
  {
    to: "/ecdc-list", label: "ECDC Map",
    icon: <svg style={{width:16,height:18,flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
];

const PhoneIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.57 3.24 2 2 0 0 1 3.54 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.87-.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16z"/>
  </svg>
);

const fmtDate = (isoStr) => {
  if (!isoStr) return null;
  const d = new Date(isoStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
};

// ── Build CSS from theme tokens ───────────────────────────────────────────────
const t = themeColors;

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');

  .ecdc-page {
    display: flex;
    height: 100vh; width: 100vw;
    overflow: hidden;
    position: fixed; top: 0; left: 0;
    background: ${t.background};
    color: ${t.text};
  }

  /* ── Sidebar ── */
  .ecdc-sidebar {
    width: 250px; min-width: 250px;
    background: ${t.bgSubtle};
    border-right: 1px solid ${t.border};
    height: 100vh;
    display: flex; flex-direction: column;
    z-index: 200; flex-shrink: 0; overflow: hidden;
    transition: width 0.28s cubic-bezier(0.4,0,0.2,1),
                min-width 0.28s cubic-bezier(0.4,0,0.2,1);
  }
  .ecdc-sidebar.collapsed { width: 56px; min-width: 56px; }

  .ecdc-sidebar-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 12px;
    border-bottom: 1px solid ${t.border};
    flex-shrink: 0; min-height: 58px;
    background: ${t.background};
  }

  .ecdc-sidebar-logo { width: 80px; opacity: 1; transition: opacity 0.15s, width 0.28s; }
  .ecdc-sidebar.collapsed .ecdc-sidebar-logo { width: 0; opacity: 0; pointer-events: none; }

  .ecdc-collapse-btn {
    background: none;
    border: 1px solid ${t.border};
    border-radius: 6px;
    color: ${t.textMuted};
    cursor: pointer; padding: 5px 6px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .ecdc-sidebar.collapsed .ecdc-collapse-btn { margin: 0 auto; }
  .ecdc-collapse-btn:hover {
    color: ${t.primaryDeep};
    border-color: ${t.primary};
    background: ${t.primaryTint08};
  }

  .ecdc-sidebar-nav { flex: 1; padding: 10px 8px; overflow: hidden; }
  .ecdc-sidebar-nav ul { list-style: none; padding: 0; margin: 0; }
  .ecdc-sidebar-nav li { margin-bottom: 2px; position: relative; }
  .ecdc-sidebar-nav a {
    color: ${t.textSecondary};
    text-decoration: none;
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 7px;
    font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 500;
    white-space: nowrap; overflow: hidden;
    transition: background 0.15s, color 0.15s;
  }
  .ecdc-sidebar-nav a:hover { background: ${t.bgHover}; color: ${t.text}; }
  .ecdc-sidebar-nav a.active {
    background: ${t.primaryTint15};
    color: ${t.primaryDeep};
    font-weight: 600;
  }

  .ecdc-nav-label { opacity: 1; transition: opacity 0.15s; overflow: hidden; }
  .ecdc-sidebar.collapsed .ecdc-nav-label { opacity: 0; width: 0; pointer-events: none; }

  .ecdc-sidebar.collapsed .ecdc-sidebar-nav a::after {
    content: attr(data-tooltip);
    position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%);
    background: ${t.background};
    border: 1px solid ${t.border};
    color: ${t.text};
    font-size: 0.75rem; font-family: 'DM Sans', sans-serif;
    padding: 4px 10px; border-radius: 6px; white-space: nowrap;
    opacity: 0; pointer-events: none; transition: opacity 0.15s; z-index: 9999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .ecdc-sidebar.collapsed .ecdc-sidebar-nav a:hover::after { opacity: 1; }

  /* Sidebar legend */
  .ecdc-sidebar-legend {
    padding: 10px 10px 16px;
    border-top: 1px solid ${t.border};
    flex-shrink: 0; overflow: hidden;
  }
  .ecdc-legend-heading {
    font-size: 0.62rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: ${t.textMuted};
    margin-bottom: 8px; padding: 0 2px; white-space: nowrap;
    opacity: 1; transition: opacity 0.15s;
  }
  .ecdc-sidebar.collapsed .ecdc-legend-heading { opacity: 0; }
  .ecdc-legend-items { display: flex; flex-direction: column; gap: 5px; }
  .ecdc-legend-item { display: flex; align-items: center; gap: 9px; padding: 2px; }
  .ecdc-legend-dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.7); flex-shrink: 0; transition: transform 0.28s; }
  .ecdc-sidebar.collapsed .ecdc-legend-dot { transform: translateX(3px); }
  .ecdc-legend-label {
    font-size: 0.74rem; color: ${t.textSecondary};
    white-space: nowrap; font-family: 'DM Sans', sans-serif;
    overflow: hidden; text-overflow: ellipsis;
    opacity: 1; transition: opacity 0.15s; max-width: 185px;
  }
  .ecdc-sidebar.collapsed .ecdc-legend-label { opacity: 0; }

  /* ── Map area ── */
  .ecdc-map-area { flex: 1; height: 100vh; overflow: hidden; position: relative; }
  .ecdc-map-area .leaflet-container { height: 100%; width: 100%; }

  .leaflet-tooltip.ecdc-map-tooltip {
    background: ${t.background};
    border: 1px solid ${t.border};
    color: ${t.text};
    border-radius: 7px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.12);
    font-family: 'DM Sans', sans-serif;
    font-size: 0.8rem; padding: 8px 12px; line-height: 1.4;
  }
  .ecdc-map-tooltip .tooltip-name { font-weight: 700; color: ${t.text}; display: block; }
  .ecdc-map-tooltip .tooltip-practitioners { font-size: 0.75rem; color: ${t.textMuted}; max-width: 220px; white-space: normal; display: block; margin-top: 2px; }
  .leaflet-tooltip.ecdc-map-tooltip:before { border: none; }

  /* ── Floating panel ── */
  .ecdc-panel {
    position: absolute; top: 16px; right: 16px; z-index: 500;
    width: 258px;
    background: ${t.bgPanel};
    border: 1px solid ${t.border};
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.10);
    display: flex; flex-direction: column;
    max-height: calc(100vh - 32px);
    font-family: 'DM Sans', sans-serif;
    overflow: hidden;
  }

  .ecdc-panel-header {
    padding: 14px 18px 12px;
    background: ${t.primary};
    border-radius: 11px 11px 0 0;
  }
  .ecdc-panel-header h2 {
    font-family: 'Space Mono', monospace;
    font-size: 0.88rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: #ffffff; margin: 0;
  }

  .ecdc-search-wrap {
    padding: 10px 12px;
    border-bottom: 1px solid ${t.border};
    position: relative;
    background: ${t.bgSubtle};
  }
  .ecdc-search-input {
    width: 100%; padding: 7px 12px 7px 30px;
    background: ${t.background};
    border: 1px solid ${t.border};
    border-radius: 7px;
    font-family: 'DM Sans', sans-serif; font-size: 0.83rem;
    outline: none; transition: border-color 0.15s;
    color: ${t.text}; box-sizing: border-box;
  }
  .ecdc-search-input::placeholder { color: ${t.textDisabled}; }
  .ecdc-search-input:focus { border-color: ${t.primary}; box-shadow: 0 0 0 3px ${t.primaryTint15}; }
  .ecdc-search-icon { position: absolute; left: 22px; top: 50%; transform: translateY(-50%); color: ${t.textMuted}; pointer-events: none; }

  /* Filter sections */
  .ecdc-filter-section { border-bottom: 1px solid ${t.border}; }
  .ecdc-filter-toggle {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px; cursor: pointer; user-select: none;
    transition: background 0.15s;
    background: ${t.bgSubtle};
  }
  .ecdc-filter-toggle:hover { background: ${t.bgHover}; }
  .ecdc-filter-toggle-label {
    font-size: 0.71rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: ${t.textMuted};
    display: flex; align-items: center; gap: 6px;
  }
  .ecdc-filter-toggle-label svg { color: ${t.primary}; }
  .ecdc-filter-active-count {
    background: ${t.primaryTint25};
    color: ${t.primaryDeep};
    border-radius: 10px; padding: 1px 7px;
    font-size: 0.68rem; font-weight: 700;
  }
  .ecdc-filter-chevron { color: ${t.textMuted}; transition: transform 0.2s; }
  .ecdc-filter-chevron.open { transform: rotate(180deg); }

  .ecdc-filter-body {
    padding: 6px 12px 10px;
    display: flex; flex-direction: column; gap: 2px;
    background: ${t.background};
  }
  .ecdc-filter-mode { display: flex; gap: 6px; margin-bottom: 8px; }
  .ecdc-filter-mode-btn {
    flex: 1; padding: 4px 0;
    background: ${t.bgSunken};
    border: 1px solid ${t.border};
    border-radius: 5px;
    font-family: 'DM Sans', sans-serif; font-size: 0.7rem; font-weight: 500;
    color: ${t.textMuted}; cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    text-align: center;
  }
  .ecdc-filter-mode-btn.active {
    border-color: ${t.primary};
    color: ${t.primaryDeep};
    background: ${t.primaryTint08};
    font-weight: 600;
  }

  .ecdc-filter-chip {
    display: flex; align-items: center; gap: 8px; padding: 5px 8px;
    border-radius: 6px; cursor: pointer; transition: background 0.1s;
  }
  .ecdc-filter-chip:hover { background: ${t.bgHover}; }
  .ecdc-filter-chip input[type="checkbox"] {
    appearance: none; width: 14px; height: 14px;
    border: 1.5px solid ${t.borderStrong};
    border-radius: 3px; background: ${t.background};
    cursor: pointer; position: relative; flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .ecdc-filter-chip input[type="checkbox"]:checked {
    background: ${t.primary}; border-color: ${t.primaryDark};
  }
  .ecdc-filter-chip input[type="checkbox"]:checked::after {
    content: ''; position: absolute; left: 2px; top: -1px;
    width: 6px; height: 9px;
    border: 2px solid #ffffff; border-top: none; border-left: none;
    transform: rotate(40deg);
  }
  .ecdc-filter-chip-label { font-size: 0.8rem; color: ${t.textSecondary}; line-height: 1; }

  .ecdc-filter-clear {
    margin-top: 6px; padding: 0; background: none; border: none;
    font-family: 'DM Sans', sans-serif; font-size: 0.72rem; color: ${t.textMuted};
    cursor: pointer; text-align: left; text-decoration: underline; text-underline-offset: 2px;
  }
  .ecdc-filter-clear:hover { color: ${t.text}; }

  /* Visit filter radios */
  .ecdc-visit-filter-body {
    padding: 4px 12px 10px;
    display: flex; flex-direction: column; gap: 1px;
    background: ${t.background};
  }
  .ecdc-radio-chip {
    display: flex; align-items: center; gap: 9px; padding: 6px 8px;
    border-radius: 6px; cursor: pointer; transition: background 0.1s;
  }
  .ecdc-radio-chip:hover { background: ${t.bgHover}; }
  .ecdc-radio-chip input[type="radio"] {
    appearance: none; width: 14px; height: 14px;
    border: 1.5px solid ${t.borderStrong};
    border-radius: 50%; background: ${t.background};
    cursor: pointer; position: relative; flex-shrink: 0;
    transition: border-color 0.15s, background 0.15s;
  }
  .ecdc-radio-chip input[type="radio"]:checked {
    background: ${t.primary}; border-color: ${t.primaryDark};
  }
  .ecdc-radio-chip input[type="radio"]:checked::after {
    content: ''; position: absolute;
    width: 5px; height: 5px;
    background: #ffffff; border-radius: 50%;
    top: 50%; left: 50%; transform: translate(-50%, -50%);
  }
  .ecdc-radio-label { font-size: 0.8rem; color: ${t.textSecondary}; line-height: 1.3; cursor: pointer; }
  .ecdc-radio-chip.selected .ecdc-radio-label { color: ${t.primaryDeep}; font-weight: 600; }

  .ecdc-visits-loading {
    display: flex; align-items: center; gap: 6px; padding: 4px 8px 6px;
    font-size: 0.7rem; color: ${t.textMuted};
  }
  .ecdc-visits-spinner {
    width: 10px; height: 10px;
    border: 1.5px solid ${t.primaryTint25}; border-top-color: ${t.primary};
    border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0;
  }

  /* Count + Show row */
  .ecdc-count-row {
    padding: 7px 14px;
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    background: ${t.bgSubtle};
    border-bottom: 1px solid ${t.border};
  }
  .ecdc-count {
    font-size: 0.68rem; color: ${t.textMuted}; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .ecdc-show-btn {
    display: flex; align-items: center; gap: 5px; padding: 4px 10px;
    background: ${t.background};
    border: 1px solid ${t.border};
    border-radius: 6px; font-family: 'DM Sans', sans-serif;
    font-size: 0.72rem; font-weight: 500; color: ${t.textMuted};
    cursor: pointer; transition: border-color 0.15s, color 0.15s, background 0.15s;
    white-space: nowrap;
  }
  .ecdc-show-btn:hover { border-color: ${t.primary}; color: ${t.primaryDeep}; background: ${t.primaryTint08}; }
  .ecdc-show-btn.active { border-color: ${t.primary}; color: ${t.primaryDeep}; background: ${t.primaryTint15}; font-weight: 600; }
  .ecdc-show-btn svg { transition: transform 0.2s; }
  .ecdc-show-btn.active svg { transform: rotate(180deg); }

  /* List */
  .ecdc-list { overflow-y: auto; flex: 1; transition: max-height 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease; }
  .ecdc-list.hidden { max-height: 0 !important; opacity: 0; overflow: hidden; pointer-events: none; }
  .ecdc-list::-webkit-scrollbar { width: 4px; }
  .ecdc-list::-webkit-scrollbar-track { background: transparent; }
  .ecdc-list::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }

  .ecdc-item {
    padding: 10px 16px; cursor: pointer;
    border-left: 3px solid transparent;
    border-bottom: 1px solid ${t.bgHover};
    transition: background 0.1s, border-color 0.1s;
    background: ${t.background};
  }
  .ecdc-item:hover { background: ${t.bgHover}; }
  .ecdc-item.selected { background: ${t.primaryTint08}; border-left-color: ${t.primary}; }

  .ecdc-item-top { display: flex; align-items: center; gap: 7px; }
  .ecdc-item-group-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ecdc-item-name { font-weight: 500; font-size: 0.87rem; color: ${t.text}; line-height: 1.3; }
  .ecdc-item-area { font-size: 0.73rem; color: ${t.textMuted}; margin-top: 1px; padding-left: 15px; }
  .ecdc-item-badge {
    display: inline-block; margin-top: 4px; margin-left: 15px;
    font-size: 0.68rem;
    background: ${t.primaryTint15};
    color: ${t.primaryDeep};
    border-radius: 20px; padding: 1px 8px; font-weight: 500;
  }

  /* Detail card */
  .ecdc-detail {
    position: absolute; top: 16px; left: 16px; z-index: 500;
    width: 300px;
    background: ${t.background};
    border: 1px solid ${t.border};
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    padding: 16px 18px; font-family: 'DM Sans', sans-serif;
    max-height: 45vh; overflow-y: auto;
    animation: slideUp 0.2s ease;
  }
  @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  .ecdc-detail-header { display: flex; align-items: flex-start; gap: 8px; padding-right: 18px; margin-bottom: 2px; }
  .ecdc-detail-group-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .ecdc-detail-name { font-family: 'Space Mono', monospace; font-size: 1rem; font-weight: 700; color: ${t.text}; line-height: 1.3; }
  .ecdc-detail-meta { padding-left: 18px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 2px; }
  .ecdc-detail-area { font-size: 0.75rem; color: ${t.textMuted}; }
  .ecdc-detail-group-label { font-size: 0.72rem; font-weight: 600; }
  .ecdc-detail-close { position: absolute; top: 12px; right: 14px; background: none; border: none; cursor: pointer; color: ${t.textMuted}; font-size: 1rem; line-height: 1; }
  .ecdc-detail-close:hover { color: ${t.text}; }

  .ecdc-practitioners-heading {
    font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: ${t.primaryDeep}; margin-bottom: 8px;
  }
  .ecdc-practitioner-card {
    background: ${t.bgSubtle};
    border: 1px solid ${t.border};
    border-radius: 7px; padding: 9px 12px; margin-bottom: 7px;
  }
  .ecdc-practitioner-name { font-weight: 600; font-size: 0.84rem; color: ${t.text}; }
  .ecdc-practitioner-contact { font-size: 0.75rem; color: ${t.textMuted}; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
  .ecdc-practitioner-group { font-size: 0.7rem; font-weight: 500; margin-top: 4px; display: flex; align-items: center; gap: 5px; }
  .ecdc-practitioner-group-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .ecdc-practitioner-last-visit { font-size: 0.68rem; color: ${t.textMuted}; margin-top: 3px; display: flex; align-items: center; gap: 4px; }
  .ecdc-practitioner-last-visit.overdue { color: ${t.danger}; font-weight: 500; }
  .ecdc-practitioner-training { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .ecdc-training-tag {
    font-size: 0.63rem;
    background: ${t.primaryTint15};
    color: ${t.primaryDeep};
    border: 1px solid ${t.primaryTint25};
    border-radius: 4px; padding: 1px 6px; font-weight: 500;
  }

  /* Badge */
  .ecdc-badge {
    position: absolute; bottom: 24px; right: 16px; z-index: 500;
    background: ${t.background};
    border: 1px solid ${t.border};
    color: ${t.primaryDeep};
    padding: 6px 14px; border-radius: 20px;
    font-size: 0.72rem; font-weight: 600;
    pointer-events: none; font-family: 'DM Sans', sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.10);
  }

  /* Loading overlay */
  .ecdc-loading {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(246,248,250,0.88);
    z-index: 999; font-family: 'DM Sans', sans-serif;
    font-size: 0.88rem; color: ${t.primaryDeep}; gap: 10px; font-weight: 600;
  }
  .ecdc-spinner {
    width: 18px; height: 18px;
    border: 2.5px solid ${t.primaryTint25}; border-top-color: ${t.primary};
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ── Derive the dominant group for an ECDC ────────────────────────────────────
const dominantGroupName = (practitioners) => {
  if (!practitioners?.length) return null;
  const counts = {};
  for (const p of practitioners) {
    const name = p.group?.group_name ?? null;
    if (!name) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0][0];
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function ECDCMap() {
  const [ecdcs, setEcdcs]             = useState([]);
  const [landmarks, setLandmarks]     = useState([]);
  const [filtered, setFiltered]       = useState([]);
  const [selected, setSelected]       = useState(null);
  const [search, setSearch]           = useState("");
  const [loading, setLoading]         = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [filterMode, setFilterMode]   = useState("any");
  const [trainingStatus, setTrainingStatus] = useState("has");
  const [legendGroups, setLegendGroups] = useState([]);
  const [listVisible, setListVisible] = useState(false);

  const [visitFilterOpen, setVisitFilterOpen] = useState(false);
  const [visitPreset,     setVisitPreset]     = useState(null);
  const [lastVisitMap,    setLastVisitMap]     = useState(null);
  const [visitsLoading,   setVisitsLoading]   = useState(false);

  useEffect(() => {
    async function load() {
      const [
        { data: ecdcData, error: ecdcError },
        { data: landmarkData, error: landmarkError }
      ] = await Promise.all([
        supabase
          .from("ecdc_list")
          .select(`
            id, name, area, latitude, longitude,
            practitioners (
              id, name, contact_number1, contact_number2,
              group:group_id ( id, group_name ),
              training ( ${TRAINING_FILTERS.map((f) => f.key).join(", ")} )
            )
          `)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("name"),
        supabase
          .from("landmarks")
          .select("id, name, type, latitude, longitude")
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("name")
      ]);

      if (!ecdcError && ecdcData) {
        setEcdcs(ecdcData);
        setFiltered(ecdcData);
        const seen = new Set();
        const groups = [];
        ecdcData.forEach((e) =>
          e.practitioners?.forEach((p) => {
            const name = p.group?.group_name;
            if (name && !seen.has(name)) { seen.add(name); groups.push(name); }
          })
        );
        groups.sort((a, b) => a.localeCompare(b));
        setLegendGroups(groups);
      }
      if (!landmarkError && landmarkData) setLandmarks(landmarkData);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!visitFilterOpen || lastVisitMap !== null) return;
    async function loadVisits() {
      setVisitsLoading(true);
      const { data, error } = await supabase
        .from("outreach_visits")
        .select("practitioner_id, date, outreach_type")
        .order("date", { ascending: false });

      if (!error && data) {
        const map = new Map();
        for (const row of data) {
          if (row.outreach_type?.toLowerCase().trim() === "update") continue;
          if (!row.practitioner_id) continue;
          if (!map.has(row.practitioner_id)) map.set(row.practitioner_id, row.date);
        }
        setLastVisitMap(map);
      } else {
        setLastVisitMap(new Map());
      }
      setVisitsLoading(false);
    }
    loadVisits();
  }, [visitFilterOpen, lastVisitMap]);

  useEffect(() => {
    const q = search.toLowerCase();
    const now = new Date();

    const matchesSearch = (e) =>
      !q ||
      e.name?.toLowerCase().includes(q) ||
      e.area?.toLowerCase().includes(q) ||
      e.practitioners?.some(
        (p) => p.name?.toLowerCase().includes(q) || p.group?.group_name?.toLowerCase().includes(q)
      );

    const practitionerHasTraining = (p, keys) => {
      const t = p.training || {};

      const checkStatus = (k) => {
        return trainingStatus === "has" ? t[k] === true : t[k] !== true;
      };
      return filterMode === "all" ? keys.every(checkStatus) : keys.some(checkStatus);
    };

    const matchesTraining = (e) =>
      activeFilters.length === 0 ||
      e.practitioners?.some((p) => practitionerHasTraining(p, activeFilters));

    const matchesVisit = (e) => {
      if (!visitPreset || !lastVisitMap) return true;
      const preset = VISIT_PRESETS.find((p) => p.key === visitPreset);
      if (!preset) return true;
      return e.practitioners?.some((p) => preset.matchFn(lastVisitMap.get(p.id) ?? null, now));
    };

    setFiltered(ecdcs.filter((e) => matchesSearch(e) && matchesTraining(e) && matchesVisit(e)));
  }, [search, ecdcs, activeFilters, filterMode, trainingStatus, visitPreset, lastVisitMap]);

  const toggleFilter = (key) =>
    setActiveFilters((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const handleSelect = (ecdc) => setSelected((prev) => (prev?.id === ecdc.id ? null : ecdc));

  const getTrainingTags = (training) => {
    if (!training) return [];
    return TRAINING_FILTERS.filter((f) => training[f.key] === true).map((f) => f.label);
  };

  const dotStyle = (groupName) => {
    const c = resolveGroupColor(groupName);
    return { background: c.fill };
  };

  const isPractitionerOverdue = (practitionerId) => {
    if (!visitPreset || !lastVisitMap) return false;
    const preset = VISIT_PRESETS.find((p) => p.key === visitPreset);
    if (!preset) return false;
    return preset.matchFn(lastVisitMap.get(practitionerId) ?? null, new Date());
  };

  return (
    <>
      <style>{styles}</style>
      <div className="ecdc-page">

        {/* ── Sidebar ── */}
        <div className={`ecdc-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          <div className="ecdc-sidebar-top">
            <img className="ecdc-sidebar-logo" src={logo} alt="Layita" />
            <button
              className="ecdc-collapse-btn"
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                {sidebarCollapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
              </svg>
            </button>
          </div>

          <nav className="ecdc-sidebar-nav">
            <ul>
              {NAV_ITEMS.map(({ to, end, label, icon }) => (
                <li key={to}>
                  <NavLink to={to} end={end ?? false} data-tooltip={label}>
                    {icon}
                    <span className="ecdc-nav-label">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {legendGroups.length > 0 && (
            <div className="ecdc-sidebar-legend">
              <div className="ecdc-legend-heading">Groups</div>
              <div className="ecdc-legend-items">
                {legendGroups.map((name) => {
                  const c = resolveGroupColor(name);
                  return (
                    <div key={name} className="ecdc-legend-item">
                      <div className="ecdc-legend-dot" style={{ background: c.fill }} title={name} />
                      <span className="ecdc-legend-label">{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Map ── */}
        <div className="ecdc-map-area">
          {loading && (
            <div className="ecdc-loading">
              <div className="ecdc-spinner" />
              Loading centres…
            </div>
          )}

          <MapContainer center={[-32.0006, 28.8986]} zoom={11} style={{ height: "100%", width: "100%" }} zoomControl={false}>
            <TileLayer
              url="https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://stadiamaps.com">Stadia</a>'
              opacity={0.7}
            />
            <TileLayer
              url="https://tiles.stadiamaps.com/tiles/stamen_terrain_lines/{z}/{x}/{y}.png"
              attribution='Map tiles by <a href="https://stamen.com">Stamen</a>'
              opacity={1.0}
            />
            <FlyToSelected location={selected} />

            {filtered.map((ecdc) => {
              const groupName = dominantGroupName(ecdc.practitioners);
              return (
                <Marker
                  key={ecdc.id}
                  position={[ecdc.latitude, ecdc.longitude]}
                  icon={createCustomIcon(selected?.id === ecdc.id, groupName)}
                  eventHandlers={{ click: () => handleSelect(ecdc) }}
                >
                  <Tooltip offset={[0, -7]} direction="top" className="ecdc-map-tooltip">
                    <span className="tooltip-name">{ecdc.name || "Unnamed Centre"}</span>
                    <span className="tooltip-practitioners">
                      {ecdc.practitioners?.map(p => p.name).join(', ') || 'No practitioners listed'}
                    </span>
                  </Tooltip>
                </Marker>
              );
            })}

            {landmarks.map((lm) => (
              <Marker key={`lm-${lm.id}`} position={[lm.latitude, lm.longitude]} icon={getLandmarkIcon(lm)} zIndexOffset={-100}>
                <Tooltip offset={[0, -9]} direction="top" className="ecdc-map-tooltip">
                  <span className="tooltip-name">{lm.name || "Unnamed Landmark"}</span>
                  {lm.type && (
                    <span className="tooltip-practitioners" style={{ textTransform: "capitalize" }}>
                      {lm.type.replace(/_/g, " ")}
                    </span>
                  )}
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>

          {/* ── Floating panel ── */}
          <div className="ecdc-panel">
            <div className="ecdc-panel-header">
              <h2>ECDC Directory</h2>
            </div>

            <div className="ecdc-search-wrap">
              <svg className="ecdc-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                className="ecdc-search-input"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Training filters */}
            <div className="ecdc-filter-section">
              <div className="ecdc-filter-toggle" onClick={() => setFiltersOpen((v) => !v)}>
                <span className="ecdc-filter-toggle-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                  Training filters
                  {activeFilters.length > 0 && <span className="ecdc-filter-active-count">{activeFilters.length}</span>}
                </span>
                <svg className={`ecdc-filter-chevron${filtersOpen ? " open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              {filtersOpen && (
                <div className="ecdc-filter-body">
                  <div className="ecdc-filter-mode">
                    <button className={`ecdc-filter-mode-btn${filterMode === "any" ? " active" : ""}`} onClick={() => setFilterMode("any")}>Any selected</button>
                    <button className={`ecdc-filter-mode-btn${filterMode === "all" ? " active" : ""}`} onClick={() => setFilterMode("all")}>All selected</button>
                  </div>
                  <div className="ecdc-filter-mode">
                    <button className={`ecdc-filter-mode-btn${trainingStatus === "has" ? " active" : ""}`} onClick={() => setTrainingStatus("has")}>Has training</button>
                    <button className={`ecdc-filter-mode-btn${trainingStatus === "needs" ? " active" : ""}`} onClick={() => setTrainingStatus("needs")}> Needs training</button>
                  </div>
                  {TRAINING_FILTERS.map((f) => (
                    <label key={f.key} className="ecdc-filter-chip">
                      <input type="checkbox" checked={activeFilters.includes(f.key)} onChange={() => toggleFilter(f.key)} />
                      <span className="ecdc-filter-chip-label">{f.label}</span>
                    </label>
                  ))}
                  {activeFilters.length > 0 && (
                    <button className="ecdc-filter-clear" onClick={() => setActiveFilters([])}>Clear filters</button>
                  )}
                </div>
              )}
            </div>

            {/* Visit filter */}
            <div className="ecdc-filter-section">
              <div className="ecdc-filter-toggle" onClick={() => setVisitFilterOpen((v) => !v)}>
                <span className="ecdc-filter-toggle-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Visit filter
                  {visitPreset && <span className="ecdc-filter-active-count">1</span>}
                </span>
                <svg className={`ecdc-filter-chevron${visitFilterOpen ? " open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              {visitFilterOpen && (
                <div className="ecdc-visit-filter-body">
                  {visitsLoading && (
                    <div className="ecdc-visits-loading">
                      <div className="ecdc-visits-spinner" />
                      Loading visit history…
                    </div>
                  )}
                  {VISIT_PRESETS.map((preset) => (
                    <label key={preset.key} className={`ecdc-radio-chip${visitPreset === preset.key ? " selected" : ""}`}>
                      <input type="radio" name="visit_preset" checked={visitPreset === preset.key} onChange={() => setVisitPreset(preset.key)} />
                      <span className="ecdc-radio-label">{preset.label}</span>
                    </label>
                  ))}
                  {visitPreset && (
                    <button className="ecdc-filter-clear" onClick={() => setVisitPreset(null)}>Clear filter</button>
                  )}
                </div>
              )}
            </div>

            {/* Count + Show/Hide */}
            <div className="ecdc-count-row">
              <span className="ecdc-count">{filtered.length} / {ecdcs.length} centre{ecdcs.length !== 1 ? "s" : ""}</span>
              <button className={`ecdc-show-btn${listVisible ? " active" : ""}`} onClick={() => setListVisible((v) => !v)}>
                {listVisible ? "Hide" : "Show"}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>

            {/* Scrollable list */}
            <div className={`ecdc-list${listVisible ? "" : " hidden"}`}>
              {filtered.map((ecdc) => {
                const groupName = dominantGroupName(ecdc.practitioners);
                return (
                  <div
                    key={ecdc.id}
                    className={`ecdc-item${selected?.id === ecdc.id ? " selected" : ""}`}
                    onClick={() => handleSelect(ecdc)}
                  >
                    <div className="ecdc-item-top">
                      <div className="ecdc-item-group-dot" style={dotStyle(groupName)} />
                      <div className="ecdc-item-name">{ecdc.name || "Unnamed Centre"}</div>
                    </div>
                    {ecdc.area && <div className="ecdc-item-area">{ecdc.area}</div>}
                    {ecdc.practitioners?.length > 0 && (
                      <span className="ecdc-item-badge">
                        {ecdc.practitioners.length} practitioner{ecdc.practitioners.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                );
              })}
              {!loading && filtered.length === 0 && (
                <div style={{ padding: "16px", color: t.textMuted, fontSize: "0.83rem", textAlign: "center" }}>
                  No results found
                </div>
              )}
            </div>
          </div>

          {/* ── Detail card ── */}
          {selected && (() => {
            const dominantGroup = dominantGroupName(selected.practitioners);
            const dc = resolveGroupColor(dominantGroup);
            return (
              <div className="ecdc-detail">
                <button className="ecdc-detail-close" onClick={() => setSelected(null)}>✕</button>
                <div className="ecdc-detail-header">
                  <div className="ecdc-detail-group-dot" style={{ background: dc.fill }} />
                  <div className="ecdc-detail-name">{selected.name}</div>
                </div>
                <div className="ecdc-detail-meta">
                  {selected.area && <div className="ecdc-detail-area">{selected.area}</div>}
                  {dominantGroup && (
                    <div className="ecdc-detail-group-label" style={{ color: dc.fill }}>{dominantGroup}</div>
                  )}
                </div>

                <div className="ecdc-practitioners-heading">Practitioners</div>
                {selected.practitioners?.length > 0 ? (
                  selected.practitioners.map((p) => {
                    const tags = getTrainingTags(p.training);
                    const pc = resolveGroupColor(p.group?.group_name);
                    const lastVisitISO = lastVisitMap?.get(p.id) ?? null;
                    const lastVisitDisplay = fmtDate(lastVisitISO);
                    const overdue = isPractitionerOverdue(p.id);
                    return (
                      <div key={p.id} className="ecdc-practitioner-card">
                        <div className="ecdc-practitioner-name">{p.name || "—"}</div>
                        {p.group?.group_name && (
                          <div className="ecdc-practitioner-group" style={{ color: pc.fill }}>
                            <div className="ecdc-practitioner-group-dot" style={{ background: pc.fill }} />
                            {p.group.group_name}
                          </div>
                        )}
                        {p.contact_number1 && <div className="ecdc-practitioner-contact"><PhoneIcon />{p.contact_number1}</div>}
                        {p.contact_number2 && <div className="ecdc-practitioner-contact"><PhoneIcon />{p.contact_number2}</div>}
                        {lastVisitMap && (
                          <div className={`ecdc-practitioner-last-visit${overdue ? " overdue" : ""}`}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                              <line x1="16" y1="2" x2="16" y2="6"/>
                              <line x1="8" y1="2" x2="8" y2="6"/>
                              <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            {lastVisitDisplay ? `Last visit: ${lastVisitDisplay}${overdue ? " ⚠" : ""}` : "Never visited"}
                          </div>
                        )}
                        {tags.length > 0 && (
                          <div className="ecdc-practitioner-training">
                            {tags.map((tag) => <span key={tag} className="ecdc-training-tag">{tag}</span>)}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: "0.82rem", color: t.textMuted, fontStyle: "italic" }}>
                    No practitioners linked yet.
                  </div>
                )}
              </div>
            );
          })()}

          {!loading && (
            <div className="ecdc-badge">{filtered.length} / {ecdcs.length} centres</div>
          )}
        </div>
      </div>
    </>
  );
}