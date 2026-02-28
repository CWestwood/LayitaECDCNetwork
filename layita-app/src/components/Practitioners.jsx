import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

const Practitioners = () => {
  const [practitioners, setPractitioners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPractitioners = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('practitioners').select('*');
      if (error) {
        console.error('Error fetching practitioners:', error);
      } else {
        setPractitioners(data);
      }
      setLoading(false);
    };

    fetchPractitioners();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Practitioners</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Contact Number 1</th>
            <th>Contact Number 2</th>
          </tr>
        </thead>
        <tbody>
          {practitioners.map((practitioner) => (
            <tr key={practitioner.id}>
              <td>{practitioner.name}</td>
              <td>{practitioner.contact_number1}</td>
              <td>{practitioner.contact_number2}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Practitioners;
