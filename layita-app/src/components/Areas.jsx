import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

const Areas = () => {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAreas = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('area').select('*');
      if (error) {
        console.error('Error fetching areas:', error);
      } else {
        setAreas(data);
      }
      setLoading(false);
    };

    fetchAreas();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Areas</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Is Active</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((area) => (
            <tr key={area.id}>
              <td>{area.name}</td>
              <td>{area.is_active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Areas;
