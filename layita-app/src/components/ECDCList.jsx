import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

const ECDCList = () => {
  const [ecdcList, setEcdcList] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: ecdcList, error: ecdcError } = await supabase.from('ecdc_list').select('*');
      if (ecdcError) console.error('Error fetching ECDC list:', ecdcError);
      else setEcdcList(ecdcList);

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
      <h2>ECDC List</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Area</th>
            <th>Longitude</th>
            <th>Latitude</th>
          </tr>
        </thead>
        <tbody>
          {ecdcList.map((ecdc) => (
            <tr key={ecdc.id}>
              <td>{ecdc.name}</td>
              <td>{areas.find((a) => a.id === ecdc.area_id)?.name}</td>
              <td>{ecdc.longitude}</td>
              <td>{ecdc.latitude}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ECDCList;
