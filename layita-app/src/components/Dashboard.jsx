import React from 'react';
import { supabase } from '../services/supabaseClient';
import { LAYITA_HEX_COLORS } from '../constants/layita_colors';
import Sidebar from './Sidebar';
import './Dashboard.css';

const Dashboard = ({ children, title }) => {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="dashboard-container">
      <Sidebar />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1>{title || 'Dashboard'}</h1>
          <button onClick={handleLogout} style={{ backgroundColor: LAYITA_HEX_COLORS.orange }}>
            Logout
          </button>
        </header>
        <section className="dashboard-content">
          <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
            {children}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
