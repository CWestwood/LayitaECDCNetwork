import React from 'react';
import Dashboard from '../components/Dashboard';
import ECDCList from '../components/ECDCList';

const ECDCListPage = () => {
  return (
    <Dashboard title="ECDC List">
      <ECDCList />
    </Dashboard>
  );
};

export default ECDCListPage;
