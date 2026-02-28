import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: groups, error: groupsError } = await supabase.from('groups').select('*');
      if (groupsError) console.error('Error fetching groups:', groupsError);
      else setGroups(groups);

      const { data: areas, error: areasError } = await supabase.from('area').select('id, name');
      if (areasError) console.error('Error fetching areas:', areasError);
      else setAreas(areas);

      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Groups</h2>
      <table>
        <thead>
          <tr>
            <th>Group Name</th>
            <th>Organisation</th>
            <th>Area</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id}>
              <td>{group.group_name}</td>
              <td>{group.organisation}</td>
              <td>{areas.find((a) => a.id === group.area_id)?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Groups;
