import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = () => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <img src="/src/assets/layitalogo.svg" alt="Layita Logo" />
      </div>
      <nav className="sidebar-nav">
        <ul>
          <li><NavLink to="/" end>Dashboard</NavLink></li>
          <li><NavLink to="/practitioners">Practitioners</NavLink></li>
          <li><NavLink to="/outreach-visits">Outreach Visits</NavLink></li>
          <li><NavLink to="/groups">Groups</NavLink></li>
          <li><NavLink to="/areas">Areas</NavLink></li>
          <li><NavLink to="/ecdc-list">ECDC List</NavLink></li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
