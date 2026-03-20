import { useEffect, useState, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import { themeColors } from "../constants/layita_colors";
import logo from '../assets/layitalogo.svg';

// ─────────────────────────────────────────────────────────────────────────────
// GROUP COLOR MAPPING (mirrored from ECDCMap)
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

// ─────────────────────────────────────────────────────────────────────────────
// TRAINING CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TRAINING_FILTERS = [
  { key: "smart_start_ever",  label: "Smart Start"   },
  { key: "first_aid_ever",    label: "First Aid"     },
  { key: "level4_ever",       label: "Level 4"       },
  { key: "level5_ever",       label: "Level 5"       },
  { key: "wordworks03_ever",  label: "WordWorks 0–3" },
  { key: "wordworks35_ever",  label: "WordWorks 3–5" },
  { key: "littlestars_ever",  label: "Little Stars"  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SORT OPTIONS
// ─────────────────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: "name_asc",        label: "Name A–Z"          },
  { key: "name_desc",       label: "Name Z–A"          },
  { key: "visit_recent",    label: "Recently visited"  },
  { key: "visit_oldest",    label: "Oldest visit"      },
  { key: "training_most",   label: "Most training"     },
  { key: "training_least",  label: "Least training"    },
];

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR NAV ITEMS
// ─────────────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    to: "/practitioners", label: "Practitioners",
    icon: <svg style={{width:16,height:16,flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  },
  {
    to: "/ecdc-list", label: "ECDC Map",
    icon: <svg style={{width:16,height:16,flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (isoStr) => {
  if (!isoStr) return null;
  const d = new Date(isoStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
};

const daysSince = (isoStr) => {
  if (!isoStr) return Infinity;
  const d = new Date(isoStr + "T00:00:00");
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

const visitUrgencyColor = (days, t) => {
  if (days === Infinity) return { text: t.danger, bg: t.dangerBg, label: "Never visited" };
  if (days > 365)        return { text: t.danger, bg: t.dangerBg, label: `${days}d ago` };
  if (days > 180)        return { text: t.warning, bg: t.warningBg, label: `${days}d ago` };
  return { text: t.success, bg: t.successBg, label: `${days}d ago` };
};

const PhoneIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.57 3.24 2 2 0 0 1 3.54 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.87-.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16z"/>
  </svg>
);

const WhatsappIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const t = themeColors;

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; }

  .prac-page {
    display: flex;
    height: 100vh; width: 100vw;
    overflow: hidden;
    position: fixed; top: 0; left: 0;
    background: ${t.background};
    color: ${t.text};
    font-family: 'DM Sans', sans-serif;
  }

  /* ── Sidebar (shared) ── */
  .prac-sidebar {
    width: 250px; min-width: 250px;
    background: ${t.bgSubtle};
    border-right: 1px solid ${t.border};
    height: 100vh;
    display: flex; flex-direction: column;
    z-index: 200; flex-shrink: 0; overflow: hidden;
    transition: width 0.28s cubic-bezier(0.4,0,0.2,1),
                min-width 0.28s cubic-bezier(0.4,0,0.2,1);
  }
  .prac-sidebar.collapsed { width: 56px; min-width: 56px; }

  .prac-sidebar-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 12px;
    border-bottom: 1px solid ${t.border};
    flex-shrink: 0; min-height: 58px;
    background: ${t.background};
  }

  .prac-sidebar-logo { width: 80px; opacity: 1; transition: opacity 0.15s, width 0.28s; }
  .prac-sidebar.collapsed .prac-sidebar-logo { width: 0; opacity: 0; pointer-events: none; }

  .prac-collapse-btn {
    background: none;
    border: 1px solid ${t.border};
    border-radius: 6px;
    color: ${t.textMuted};
    cursor: pointer; padding: 5px 6px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .prac-sidebar.collapsed .prac-collapse-btn { margin: 0 auto; }
  .prac-collapse-btn:hover { color: ${t.primaryDeep}; border-color: ${t.primary}; background: ${t.primaryTint08}; }

  .prac-sidebar-nav { flex: 1; padding: 10px 8px; overflow: hidden; }
  .prac-sidebar-nav ul { list-style: none; padding: 0; margin: 0; }
  .prac-sidebar-nav li { margin-bottom: 2px; position: relative; }
  .prac-sidebar-nav a {
    color: ${t.textSecondary};
    text-decoration: none;
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 7px;
    font-size: 0.85rem; font-weight: 500;
    white-space: nowrap; overflow: hidden;
    transition: background 0.15s, color 0.15s;
  }
  .prac-sidebar-nav a:hover { background: ${t.bgHover}; color: ${t.text}; }
  .prac-sidebar-nav a.active { background: ${t.primaryTint15}; color: ${t.primaryDeep}; font-weight: 600; }

  .prac-nav-label { opacity: 1; transition: opacity 0.15s; overflow: hidden; }
  .prac-sidebar.collapsed .prac-nav-label { opacity: 0; width: 0; pointer-events: none; }

  .prac-sidebar.collapsed .prac-sidebar-nav a::after {
    content: attr(data-tooltip);
    position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%);
    background: ${t.background}; border: 1px solid ${t.border}; color: ${t.text};
    font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; white-space: nowrap;
    opacity: 0; pointer-events: none; transition: opacity 0.15s; z-index: 9999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .prac-sidebar.collapsed .prac-sidebar-nav a:hover::after { opacity: 1; }

  /* ── Main content area ── */
  .prac-main {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; height: 100vh;
  }

  /* ── Top bar ── */
  .prac-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px;
    height: 58px; flex-shrink: 0;
    background: ${t.background};
    border-bottom: 1px solid ${t.border};
    gap: 16px;
  }

  .prac-topbar-title {
    font-family: 'Space Mono', monospace;
    font-size: 0.95rem; font-weight: 700;
    color: ${t.text}; text-transform: uppercase;
    letter-spacing: 0.06em; white-space: nowrap;
  }

  .prac-topbar-controls {
    display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end;
  }

  .prac-search-wrap { position: relative; width: 240px; }
  .prac-search-input {
    width: 100%; padding: 7px 12px 7px 30px;
    background: ${t.bgSunken};
    border: 1px solid ${t.border}; border-radius: 7px;
    font-family: 'DM Sans', sans-serif; font-size: 0.83rem;
    outline: none; transition: border-color 0.15s; color: ${t.text};
  }
  .prac-search-input::placeholder { color: ${t.textDisabled}; }
  .prac-search-input:focus { border-color: ${t.primary}; background: ${t.background}; box-shadow: 0 0 0 3px ${t.primaryTint15}; }
  .prac-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: ${t.textMuted}; pointer-events: none; }

  .prac-select {
    padding: 6px 10px; border: 1px solid ${t.border}; border-radius: 7px;
    background: ${t.bgSunken}; color: ${t.textSecondary};
    font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500;
    outline: none; cursor: pointer;
    transition: border-color 0.15s;
  }
  .prac-select:focus { border-color: ${t.primary}; }

  .prac-view-toggle {
    display: flex; border: 1px solid ${t.border}; border-radius: 7px; overflow: hidden;
  }
  .prac-view-btn {
    padding: 6px 10px; background: ${t.bgSunken}; border: none;
    color: ${t.textMuted}; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .prac-view-btn:not(:last-child) { border-right: 1px solid ${t.border}; }
  .prac-view-btn.active { background: ${t.primaryTint15}; color: ${t.primaryDeep}; }
  .prac-view-btn:hover:not(.active) { background: ${t.bgHover}; color: ${t.text}; }

  /* ── Filter bar ── */
  .prac-filterbar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 24px;
    background: ${t.bgSubtle};
    border-bottom: 1px solid ${t.border};
    overflow-x: auto; flex-shrink: 0;
  }
  .prac-filterbar::-webkit-scrollbar { height: 3px; }
  .prac-filterbar::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }

  .prac-filter-label {
    font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: ${t.textMuted};
    white-space: nowrap; flex-shrink: 0; margin-right: 4px;
  }

  .prac-chip {
    display: flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 20px;
    border: 1.5px solid ${t.border};
    background: ${t.background};
    font-size: 0.75rem; font-weight: 500; color: ${t.textSecondary};
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    user-select: none;
  }
  .prac-chip:hover { border-color: ${t.primary}; color: ${t.primaryDeep}; background: ${t.primaryTint08}; }
  .prac-chip.active {
    border-color: ${t.primaryDeep};
    background: ${t.primaryTint25};
    color: ${t.primaryDeep}; font-weight: 600;
  }
  .prac-chip-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .prac-divider { width: 1px; height: 20px; background: ${t.border}; flex-shrink: 0; margin: 0 2px; }

  .prac-filter-clear {
    padding: 4px 10px; border-radius: 20px;
    border: 1.5px dashed ${t.border};
    background: none; color: ${t.textMuted};
    font-family: 'DM Sans', sans-serif; font-size: 0.74rem; font-weight: 500;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    transition: border-color 0.15s, color 0.15s;
  }
  .prac-filter-clear:hover { border-color: ${t.danger}; color: ${t.danger}; }

  /* ── Stats strip ── */
  .prac-stats {
    display: flex; gap: 0;
    border-bottom: 1px solid ${t.border};
    flex-shrink: 0;
    background: ${t.background};
  }
  .prac-stat {
    flex: 1; padding: 10px 20px;
    display: flex; flex-direction: column; gap: 1px;
    border-right: 1px solid ${t.border};
  }
  .prac-stat:last-child { border-right: none; }
  .prac-stat-value {
    font-family: 'Space Mono', monospace;
    font-size: 1.15rem; font-weight: 700; color: ${t.primaryDeep};
  }
  .prac-stat-label { font-size: 0.68rem; color: ${t.textMuted}; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }

  /* ── Body (list + detail) ── */
  .prac-body {
    display: flex; flex: 1; overflow: hidden;
  }

  /* ── List panel ── */
  .prac-list-panel {
    width: 420px; min-width: 320px;
    border-right: 1px solid ${t.border};
    display: flex; flex-direction: column;
    overflow: hidden;
    transition: width 0.25s;
  }
  .prac-list-panel.expanded { width: 100%; border-right: none; }

  .prac-list-scroll { flex: 1; overflow-y: auto; }
  .prac-list-scroll::-webkit-scrollbar { width: 4px; }
  .prac-list-scroll::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }

  /* ── Table / list row ── */
  .prac-list-header {
    display: grid;
    grid-template-columns: 28px 480px 240px 180px 180px 120px;
    align-items: center;
    padding: 0 24px;
    height: 36px;
    background: ${t.bgSubtle};
    border-bottom: 1px solid ${t.border};
    position: sticky; top: 0; z-index: 2;
    font-size: 0.64rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: ${t.textMuted};
    flex-shrink: 0;
  }

  .prac-row {
    display: grid;
    grid-template-columns: 28px 480px 240px 180px 180px 120px;
    align-items: center;
    padding: 0 24px;
    min-height: 52px;
    border-bottom: 1px solid ${t.bgHover};
    cursor: pointer;
    background: ${t.background};
    transition: background 0.1s;
    border-left: 3px solid transparent;
  }
  .prac-row:hover { background: ${t.bgHover}; }
  .prac-row.selected { background: ${t.primaryTint08}; border-left-color: ${t.primary}; }

  .prac-row-dot { width: 10px; height: 10px; border-radius: 50%; }
  .prac-row-name { font-weight: 600; font-size: 0.87rem; color: ${t.text}; }
  .prac-row-ecdc { font-size: 0.72rem; color: ${t.textMuted}; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prac-row-group { font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prac-row-visit-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 12px;
    font-size: 0.68rem; font-weight: 600; white-space: nowrap;
  }
  .prac-row-training { display: flex; gap: 3px; flex-wrap: wrap; }
  .prac-row-training-dot { width: 7px; height: 7px; border-radius: 50%; }
  .prac-row-whatsapp { display: flex; align-items: center; justify-content: center; }
  .prac-row-whatsapp svg { color: #25d366; }

  /* ── Grid view ── */
  .prac-grid { padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }

  .prac-card {
    background: ${t.background};
    border: 1px solid ${t.border};
    border-radius: 10px; padding: 14px 16px;
    cursor: pointer;
    border-top: 3px solid transparent;
    transition: box-shadow 0.15s, transform 0.15s, border-top-color 0.15s;
  }
  .prac-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-1px); }
  .prac-card.selected { box-shadow: 0 4px 16px rgba(134,181,185,0.25); }

  .prac-card-top { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
  .prac-card-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Mono', monospace;
    font-size: 0.75rem; font-weight: 700; color: #fff;
    flex-shrink: 0;
  }
  .prac-card-name { font-weight: 700; font-size: 0.9rem; color: ${t.text}; line-height: 1.3; }
  .prac-card-ecdc { font-size: 0.72rem; color: ${t.textMuted}; margin-top: 2px; }

  .prac-card-group-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 8px; border-radius: 10px;
    font-size: 0.68rem; font-weight: 600;
    margin-bottom: 8px;
  }

  .prac-card-row { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: ${t.textMuted}; margin-top: 4px; }

  .prac-card-training { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .prac-training-tag {
    font-size: 0.63rem;
    background: ${t.primaryTint15};
    color: ${t.primaryDeep};
    border: 1px solid ${t.primaryTint25};
    border-radius: 4px; padding: 1px 6px; font-weight: 500;
  }

  /* ── Detail panel ── */
  .prac-detail-panel {
    flex: 1; overflow-y: auto;
    background: ${t.bgSubtle};
    display: flex; flex-direction: column;
  }
  .prac-detail-panel::-webkit-scrollbar { width: 4px; }
  .prac-detail-panel::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }

  .prac-detail-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    color: ${t.textMuted}; font-size: 0.85rem; padding: 40px;
    text-align: center;
  }
  .prac-detail-empty svg { opacity: 0.3; }

  .prac-detail-hero {
    background: ${t.background};
    border-bottom: 1px solid ${t.border};
    padding: 24px 28px 20px;
  }
  .prac-detail-hero-top { display: flex; align-items: flex-start; gap: 14px; }
  .prac-detail-avatar {
    width: 52px; height: 52px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Space Mono', monospace; font-size: 1rem; font-weight: 700;
    color: #fff; flex-shrink: 0;
  }
  .prac-detail-name {
    font-family: 'Space Mono', monospace;
    font-size: 1.1rem; font-weight: 700; color: ${t.text}; line-height: 1.3;
  }
  .prac-detail-group-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 10px; border-radius: 12px;
    font-size: 0.72rem; font-weight: 600; margin-top: 5px;
  }

  .prac-detail-meta-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 10px; margin-top: 16px;
  }
  .prac-detail-meta-item { display: flex; flex-direction: column; gap: 2px; }
  .prac-detail-meta-label { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: ${t.textMuted}; }
  .prac-detail-meta-value { font-size: 0.82rem; color: ${t.text}; font-weight: 500; text-align: center; }

  .prac-detail-section {
    background: ${t.background};
    margin-top: 8px;
    border-top: 1px solid ${t.border};
    border-bottom: 1px solid ${t.border};
    padding: 16px 28px;
  }
  .prac-detail-section-title {
    font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: ${t.primaryDeep};
    margin-bottom: 14px; display: flex; align-items: center; gap: 6px;
  }
  .prac-detail-section-title svg { opacity: 0.7; }

  /* Training grid */
  .prac-training-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;
  }
  .prac-training-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; border-radius: 8px;
    border: 1px solid ${t.border};
    font-size: 0.78rem; font-weight: 500;
  }
  .prac-training-item.has {
    background: ${t.successBg}; border-color: rgba(30,126,68,0.25);
    color: ${t.success};
  }
  .prac-training-item.needs {
    background: ${t.bgSunken}; color: ${t.textMuted};
  }
  .prac-training-icon {
    width: 18px; height: 18px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .prac-training-item.has .prac-training-icon { background: ${t.success}; color: #fff; }
  .prac-training-item.needs .prac-training-icon { background: ${t.border}; color: ${t.textMuted}; }

  /* Visit history */
  .prac-visit-row {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 10px 0; border-bottom: 1px solid ${t.bgHover};
    font-size: 0.8rem;
  }
  .prac-visit-row:last-child { border-bottom: none; }
  .prac-visit-date { font-weight: 600; color: ${t.text}; min-width: 90px; flex-shrink: 0; }
  .prac-visit-type {
    display: inline-block; padding: 1px 8px; border-radius: 10px;
    font-size: 0.68rem; font-weight: 600;
    background: ${t.primaryTint15}; color: ${t.primaryDeep};
    flex-shrink: 0;
  }
  .prac-visit-details { color: ${t.textMuted}; font-size: 0.75rem; line-height: 1.4; }
  .prac-visit-empty { color: ${t.textMuted}; font-style: italic; font-size: 0.82rem; padding: 6px 0; }

  /* ── Flags row ── */
  .prac-flags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .prac-flag {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 10px;
    font-size: 0.7rem; font-weight: 600; border: 1px solid transparent;
  }
  .prac-flag.yes { background: ${t.successBg}; color: ${t.success}; border-color: rgba(30,126,68,0.2); }
  .prac-flag.no  { background: ${t.bgSunken};  color: ${t.textMuted}; border-color: ${t.border}; }
  .prac-flag svg { flex-shrink: 0; }

  /* ── Loading ── */
  .prac-loading {
    flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 10px; font-size: 0.88rem; color: ${t.primaryDeep}; font-weight: 600;
  }
  .prac-spinner {
    width: 18px; height: 18px;
    border: 2.5px solid ${t.primaryTint25}; border-top-color: ${t.primary};
    border-radius: 50%; animation: prac-spin 0.7s linear infinite;
  }
  @keyframes prac-spin { to { transform: rotate(360deg); } }

  /* ── Empty state ── */
  .prac-no-results {
    padding: 48px 24px; text-align: center;
    color: ${t.textMuted}; font-size: 0.85rem;
  }

  /* ── Visit load more ── */
  .prac-load-more {
    margin-top: 10px; padding: 6px 14px;
    background: none; border: 1px solid ${t.border}; border-radius: 6px;
    font-family: 'DM Sans', sans-serif; font-size: 0.75rem; color: ${t.textMuted};
    cursor: pointer; transition: border-color 0.15s, color 0.15s;
  }
  .prac-load-more:hover { border-color: ${t.primary}; color: ${t.primaryDeep}; }

  /* animation */
  @keyframes prac-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .prac-detail-panel > * { animation: prac-fadein 0.18s ease; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Practitioners() {
  const [practitioners, setPractitioners] = useState([]);
  const [lastVisitMap, setLastVisitMap]   = useState(new Map());
  const [visitsByPrac, setVisitsByPrac]   = useState(new Map());
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState(null);
  const [search, setSearch]               = useState("");
  const [sortKey, setSortKey]             = useState("name_asc");
  const [viewMode, setViewMode]           = useState("list"); // "list" | "grid"
  const [activeGroups, setActiveGroups]   = useState([]);
  const [activeTraining, setActiveTraining] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [visitsExpanded, setVisitsExpanded] = useState(false);

  // Load data
  useEffect(() => {
    async function load() {
      const [
        { data: pracData },
        { data: visitData }
      ] = await Promise.all([
        supabase
          .from("practitioners")
          .select(`
            id, name, contact_number1, contact_number2,
            has_whatsapp, dsd_funded, dsd_registered,
            group:group_id ( id, group_name ),
            ecdc:ecdc_id ( id, name, area ),
            training ( ${TRAINING_FILTERS.map(f => f.key).join(", ")} )
          `)
          .order("name"),
        supabase
          .from("outreach_visits")
          .select("id, practitioner_id, date, outreach_type, transport_type, transport_cost, parents_trained, children_books, comments, outreach_happened")
          .order("date", { ascending: false })
      ]);

      if (pracData) setPractitioners(pracData);

      if (visitData) {
        const lvm = new Map();
        const vbp = new Map();
        for (const v of visitData) {
          if (!v.practitioner_id) continue;
          if (!lvm.has(v.practitioner_id) && v.outreach_type?.toLowerCase().trim() !== "update") {
            lvm.set(v.practitioner_id, v.date);
          }
          if (!vbp.has(v.practitioner_id)) vbp.set(v.practitioner_id, []);
          vbp.get(v.practitioner_id).push(v);
        }
        setLastVisitMap(lvm);
        setVisitsByPrac(vbp);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Unique groups for filter chips
  const allGroups = useMemo(() => {
    const seen = new Set();
    const groups = [];
    practitioners.forEach(p => {
      const name = p.group?.group_name;
      if (name && !seen.has(name)) { seen.add(name); groups.push(name); }
    });
    return groups.sort((a, b) => a.localeCompare(b));
  }, [practitioners]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = practitioners.filter(p => {
      const matchSearch = !q ||
        p.name?.toLowerCase().includes(q) ||
        p.ecdc?.name?.toLowerCase().includes(q) ||
        p.group?.group_name?.toLowerCase().includes(q);

      const matchGroup = activeGroups.length === 0 ||
        activeGroups.includes(p.group?.group_name);

      const matchTraining = activeTraining.length === 0 ||
        activeTraining.some(key => p.training?.[key] === true);

      return matchSearch && matchGroup && matchTraining;
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "name_asc":  return (a.name || "").localeCompare(b.name || "");
        case "name_desc": return (b.name || "").localeCompare(a.name || "");
        case "visit_recent": return daysSince(lastVisitMap.get(a.id)) - daysSince(lastVisitMap.get(b.id));
        case "visit_oldest": return daysSince(lastVisitMap.get(b.id)) - daysSince(lastVisitMap.get(a.id));
        case "training_most": {
          const countA = TRAINING_FILTERS.filter(f => a.training?.[f.key]).length;
          const countB = TRAINING_FILTERS.filter(f => b.training?.[f.key]).length;
          return countB - countA;
        }
        case "training_least": {
          const countA = TRAINING_FILTERS.filter(f => a.training?.[f.key]).length;
          const countB = TRAINING_FILTERS.filter(f => b.training?.[f.key]).length;
          return countA - countB;
        }
        default: return 0;
      }
    });
    return list;
  }, [practitioners, search, activeGroups, activeTraining, sortKey, lastVisitMap]);

  // Stats
  const stats = useMemo(() => {
    const total = practitioners.length;
    const neverVisited = practitioners.filter(p => !lastVisitMap.has(p.id)).length;
    const overdue = practitioners.filter(p => daysSince(lastVisitMap.get(p.id)) > 180).length;
    const thisyear = practitioners.filter(p => lastVisitMap.get(p.id) >= `${new Date().getFullYear()}-01-01`).length;
    const fullyTrained = practitioners.filter(p =>
      TRAINING_FILTERS.every(f => p.training?.[f.key])
    ).length;
    return { total, neverVisited, overdue, fullyTrained, thisyear };
  }, [practitioners, lastVisitMap]);

  const toggleGroup = (g) => setActiveGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  const toggleTraining = (k) => setActiveTraining(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);

  const getInitials = (name) => name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  const renderVisitBadge = (pracId) => {
    const days = daysSince(lastVisitMap.get(pracId));
    const { text, bg, label } = visitUrgencyColor(days, t);
    return (
      <span className="prac-row-visit-badge" style={{ background: bg, color: text }}>
        {label}
      </span>
    );
  };

  const trainingCount = (p) => TRAINING_FILTERS.filter(f => p.training?.[f.key]).length;

  // ── List row ──
  const renderRow = (p) => {
    const c = resolveGroupColor(p.group?.group_name);
    return (
      <div
        key={p.id}
        className={`prac-row${selected?.id === p.id ? " selected" : ""}`}
        onClick={() => setSelected(prev => prev?.id === p.id ? null : p)}
        style={{ borderLeftColor: selected?.id === p.id ? c.fill : "transparent" }}
      >
        <div className="prac-row-dot" style={{ background: c.fill }} />
        
        <div className="prac-row-name">{p.name || "—"}</div>
        <div className="prac-row-ecdc">{p.ecdc?.name || "No ECDC"}</div>
        
        
        <div>{renderVisitBadge(p.id)}</div>
        <div className="prac-row-training" style={{ alignItems: "center", justifyContent: "center" }}>
          {TRAINING_FILTERS.map(f => (
            <div key={f.key} className="prac-row-training-dot"
              title={f.label}
              style={{ background: p.training?.[f.key] ? t.success : t.border }} />
          ))}
          <span style={{ fontSize: "0.68rem", color: t.textMuted, marginLeft: 4 }}>
            {trainingCount(p)}/{TRAINING_FILTERS.length}
          </span>
        </div>
        <div className="prac-row-whatsapp">
          {p.has_whatsapp && <WhatsappIcon />}
        </div>
      </div>
    );
  };

  // ── Card ──
  const renderCard = (p) => {
    const c = resolveGroupColor(p.group?.group_name);
    const days = daysSince(lastVisitMap.get(p.id));
    const { text: vt, bg: vbg } = visitUrgencyColor(days, t);
    const tags = TRAINING_FILTERS.filter(f => p.training?.[f.key]);
    return (
      <div
        key={p.id}
        className={`prac-card${selected?.id === p.id ? " selected" : ""}`}
        onClick={() => setSelected(prev => prev?.id === p.id ? null : p)}
        style={{ borderTopColor: c.fill }}
      >
        <div className="prac-card-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="prac-card-name">{p.name || "—"}</div>
            <div className="prac-card-ecdc">{p.ecdc?.name || "No ECDC"}</div>
          </div>
        </div>

        {p.group?.group_name && (
          <div className="prac-card-group-badge" style={{ background: c.glow, color: c.fill }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.fill }} />
            {p.group.group_name}
          </div>
        )}

        <div className="prac-card-row">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={vt} strokeWidth="2.5">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{ color: vt, fontWeight: 600, fontSize: "0.72rem" }}>
            {days === Infinity ? "Never visited" : `${days}d ago`}
          </span>
        </div>

        {tags.length > 0 && (
          <div className="prac-card-training">
            {tags.map(f => <span key={f.key} className="prac-training-tag">{f.label}</span>)}
          </div>
        )}
      </div>
    );
  };

  // ── Detail panel ──
  const renderDetail = () => {
    if (!selected) return (
      <div className="prac-detail-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="1.5">
          <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
        </svg>
        <div>Select a practitioner to view details</div>
      </div>
    );

    const p = selected;
    const c = resolveGroupColor(p.group?.group_name);
    const days = daysSince(lastVisitMap.get(p.id));
    const { text: vt, bg: vbg, label: vlabel } = visitUrgencyColor(days, t);
    const visits = visitsByPrac.get(p.id) || [];
    const visitsToShow = visitsExpanded ? visits : visits.slice(0, 5);

    return (
      <>
        {/* Hero */}
        <div className="prac-detail-hero">
          <div className="prac-detail-hero-top">
            
            <div style={{ flex: 1 }}>
              <div className="prac-detail-name">{p.name || "—"}</div>
              {p.group?.group_name && (
                <div className="prac-detail-group-badge" style={{ background: c.glow, color: c.fill }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: c.fill }} />
                  {p.group.group_name}
                </div>
              )}
            </div>
            <button onClick={() => setSelected(null)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: t.textMuted, fontSize: "1rem", lineHeight: 1, padding: "2px"
            }}>✕</button>
          </div>

          <div className="prac-detail-meta-grid">
            <div className="prac-detail-meta-item">
              <div className="prac-detail-meta-label">ECDC</div>
              <div className="prac-detail-meta-value">{p.ecdc?.name || "—"}</div>
              {p.ecdc?.area && <div style={{ fontSize: "0.7rem", color: t.textMuted }}>{p.ecdc.area}</div>}
            </div>
            <div className="prac-detail-meta-item">
              <div className="prac-detail-meta-label">Last Visit</div>
              <div className="prac-detail-meta-value" style={{ color: vt }}>
                {days === Infinity ? "Never" : fmtDate(lastVisitMap.get(p.id))}
              </div>
              <div style={{ fontSize: "0.7rem", color: vt, fontWeight: 500 }}>{vlabel}</div>
            </div>
            {p.contact_number1 && (
              <div className="prac-detail-meta-item">
                <div className="prac-detail-meta-label">Contact</div>
                <div className="prac-detail-meta-value" style={{ alignItems: "center", gap:5 }}>
                  <PhoneIcon /> {p.contact_number1}
                </div>
                {p.contact_number2 && (
                  <div style={{ fontSize: "0.75rem", color: t.textMuted, alignItems: "center", gap: 5, marginTop: 2 }}>
                    <PhoneIcon /> {p.contact_number2}
                  </div>
                )}
              </div>
            )}
            <div className="prac-detail-meta-item">
              <div className="prac-detail-meta-label">Total Visits</div>
              <div className="prac-detail-meta-value">{visits.filter(v => v.outreach_type?.toLowerCase() !== "update").length}</div>
            </div>
          </div>

          <div className="prac-flags">
            <span className={`prac-flag ${p.has_whatsapp ? "yes" : "no"}`}>
              {p.has_whatsapp ? <CheckIcon /> : <XIcon />} WhatsApp
            </span>
            <span className={`prac-flag ${p.dsd_funded ? "yes" : "no"}`}>
              {p.dsd_funded ? <CheckIcon /> : <XIcon />} DSD Funded
            </span>
            <span className={`prac-flag ${p.dsd_registered ? "yes" : "no"}`}>
              {p.dsd_registered ? <CheckIcon /> : <XIcon />} DSD Registered
            </span>
          </div>
        </div>

        {/* Training */}
        <div className="prac-detail-section">
          <div className="prac-detail-section-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            Training Record — {trainingCount(p)}/{TRAINING_FILTERS.length}
          </div>
          <div className="prac-training-grid">
            {TRAINING_FILTERS.map(f => {
              const has = p.training?.[f.key] === true;
              return (
                <div key={f.key} className={`prac-training-item ${has ? "has" : "needs"}`}>
                  <div className="prac-training-icon">
                    {has ? <CheckIcon /> : <XIcon />}
                  </div>
                  {f.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Visit history */}
        <div className="prac-detail-section">
          <div className="prac-detail-section-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Visit History — {visits.length} record{visits.length !== 1 ? "s" : ""}
          </div>
          {visits.length === 0 ? (
            <div className="prac-visit-empty">No visits recorded yet.</div>
          ) : (
            <>
              {visitsToShow.map(v => (
                <div key={v.id} className="prac-visit-row">
                  <div className="prac-visit-date">{fmtDate(v.date) || "—"}</div>
                  <div style={{ flex: 1 }}>
                    <span className="prac-visit-type">{v.outreach_type || "Visit"}</span>
                    {v.outreach_happened && v.outreach_happened !== "yes" && (
                      <span style={{ marginLeft: 6, fontSize: "0.68rem", color: t.warning, fontWeight: 600 }}>
                        {v.outreach_happened}
                      </span>
                    )}
                    <div className="prac-visit-details">
                      {[
                        v.parents_trained && `${v.parents_trained} parents trained`,
                        v.children_books && `${v.children_books} books to children`,
                        v.transport_type && `${v.transport_type}${v.transport_km ? ` · ${v.transport_km}km` : ""}`,
                      ].filter(Boolean).join(" · ")}
                    </div>
                    {v.comments && (
                      <div style={{ fontSize: "0.73rem", color: t.textSecondary, marginTop: 3, fontStyle: "italic" }}>
                        "{v.comments}"
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {visits.length > 5 && (
                <button className="prac-load-more" onClick={() => setVisitsExpanded(v => !v)}>
                  {visitsExpanded ? `Show less` : `Show ${visits.length - 5} more visits`}
                </button>
              )}
            </>
          )}
        </div>
      </>
    );
  };

  const anyFilters = activeGroups.length > 0 || activeTraining.length > 0;

  return (
    <>
      <style>{styles}</style>
      <div className="prac-page">

        {/* ── Sidebar ── */}
        <div className={`prac-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          <div className="prac-sidebar-top">
            <img className="prac-sidebar-logo" src={logo} alt="Layita" />
            <button className="prac-collapse-btn" onClick={() => setSidebarCollapsed(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                {sidebarCollapsed ? <polyline points="9 18 15 12 9 6"/> : <polyline points="15 18 9 12 15 6"/>}
              </svg>
            </button>
          </div>
          <nav className="prac-sidebar-nav">
            <ul>
              {NAV_ITEMS.map(({ to, end, label, icon }) => (
                <li key={to}>
                  <NavLink to={to} end={end ?? false} data-tooltip={label}>
                    {icon}
                    <span className="prac-nav-label">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* ── Main ── */}
        <div className="prac-main">

          {/* Top bar */}
          <div className="prac-topbar">
            <div className="prac-topbar-title">Practitioners</div>
            <div className="prac-topbar-controls">
              <div className="prac-search-wrap">
                <svg className="prac-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  className="prac-search-input"
                  placeholder="Search name, ECDC, group…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select className="prac-select" value={sortKey} onChange={e => setSortKey(e.target.value)}>
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <div className="prac-view-toggle">
                <button className={`prac-view-btn${viewMode === "list" ? " active" : ""}`} onClick={() => setViewMode("list")} title="List view">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </button>
                <button className={`prac-view-btn${viewMode === "grid" ? " active" : ""}`} onClick={() => setViewMode("grid")} title="Grid view">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="prac-filterbar">
            <span className="prac-filter-label">Groups</span>
            {allGroups.map(g => {
              const c = resolveGroupColor(g);
              return (
                <div key={g} className={`prac-chip${activeGroups.includes(g) ? " active" : ""}`} onClick={() => toggleGroup(g)}>
                  <div className="prac-chip-dot" style={{ background: c.fill }} />
                  {g}
                </div>
              );
            })}
            <div className="prac-divider" />
            <span className="prac-filter-label">Training</span>
            {TRAINING_FILTERS.map(f => (
              <div key={f.key} className={`prac-chip${activeTraining.includes(f.key) ? " active" : ""}`} onClick={() => toggleTraining(f.key)}>
                {f.label}
              </div>
            ))}
            {anyFilters && (
              <button className="prac-filter-clear" onClick={() => { setActiveGroups([]); setActiveTraining([]); }}>
                Clear all
              </button>
            )}
          </div>

          {/* Stats strip */}
          <div className="prac-stats">
            <div className="prac-stat">
              <div className="prac-stat-value">{filtered.length}</div>
              <div className="prac-stat-label">Showing</div>
            </div>
            <div className="prac-stat">
              <div className="prac-stat-value">{stats.total}</div>
              <div className="prac-stat-label">Total</div>
            </div>
            <div className="prac-stat">
              <div className="prac-stat-value" style={{ color: t.success }}>{stats.thisyear}</div>
              <div className="prac-stat-label">Visited this year</div>
            </div>
            <div className="prac-stat">
              <div className="prac-stat-value" style={{ color: t.danger }}>{stats.neverVisited}</div>
              <div className="prac-stat-label">Never visited</div>
            </div>
            <div className="prac-stat">
              <div className="prac-stat-value" style={{ color: t.warning }}>{stats.overdue}</div>
              <div className="prac-stat-label">Overdue (&gt;6mo)</div>
            </div>
          </div>

          {/* Body */}
          <div className="prac-body">
            {/* List / grid panel */}
            <div className={`prac-list-panel${!selected ? " expanded" : ""}`}>
              {loading ? (
                <div className="prac-loading">
                  <div className="prac-spinner" /> Loading practitioners…
                </div>
              ) : (
                <div className="prac-list-scroll">
                  {filtered.length === 0 ? (
                    <div className="prac-no-results">No practitioners match your filters.</div>
                  ) : viewMode === "list" ? (
                    <>
                      <div className="prac-list-header">
                        <div />
                        <div>Name</div>
                        <div>ECDC</div>
                        <div>Last Visit</div>
                        <div style={{ textAlign: "center" }}>Training</div>
                        <div style={{ textAlign: "center" }}>Whatsapp</div>
                      </div>
                      {filtered.map(renderRow)}
                    </>
                  ) : (
                    <div className="prac-grid">
                      {filtered.map(renderCard)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="prac-detail-panel">
                {renderDetail()}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}