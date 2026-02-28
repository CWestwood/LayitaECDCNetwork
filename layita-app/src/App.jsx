import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PractitionersPage from './pages/PractitionersPage';
import OutreachVisitsPage from './pages/OutreachVisitsPage';
import GroupsPage from './pages/GroupsPage';
import AreasPage from './pages/AreasPage';
import ECDCListPage from './pages/ECDCListPage';
import { supabase } from './services/supabaseClient';
import './App.css';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!session ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/" element={session ? <DashboardPage /> : <Navigate to="/login" />} />
        <Route path="/practitioners" element={session ? <PractitionersPage /> : <Navigate to="/login" />} />
        <Route path="/outreach-visits" element={session ? <OutreachVisitsPage /> : <Navigate to="/login" />} />
        <Route path="/groups" element={session ? <GroupsPage /> : <Navigate to="/login" />} />
        <Route path="/areas" element={session ? <AreasPage /> : <Navigate to="/login" />} />
        <Route path="/ecdc-list" element={session ? <ECDCListPage /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;