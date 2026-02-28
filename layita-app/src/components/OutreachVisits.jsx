import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

const OutreachVisits = () => {
  const [outreachVisits, setOutreachVisits] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: visits, error: visitsError } = await supabase.from('outreach_visits').select('*');
      if (visitsError) console.error('Error fetching outreach visits:', visitsError);
      else setOutreachVisits(visits);

      const { data: practitioners, error: practitionersError } = await supabase.from('practitioners').select('id, name');
      if (practitionersError) console.error('Error fetching practitioners:', practitionersError);
      else setPractitioners(practitioners);

      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Outreach Visits</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Practitioner</th>
            <th>Outreach Type</th>
            <th>Transport Type</th>
            <th>Transport Cost</th>
            <th>Transport KM</th>
            <th>Parents Trained</th>
            <th>Total Books to Children</th>
            <th>Books to Practitioner</th>
            <th>Photos Taken</th>
            <th>Comments</th>
            <th>Outreach Happened</th>
            <th>Did Instead</th>
          </tr>
        </thead>
        <tbody>
          {outreachVisits.map((visit) => (
            <tr key={visit.id}>
              <td>{visit.date}</td>
              <td>{practitioners.find((p) => p.id === visit.practitioner_id)?.name}</td>
              <td>{visit.outreach_type}</td>
              <td>{visit.transport_type}</td>
              <td>{visit.transport_cost}</td>
              <td>{visit.transport_km}</td>
              <td>{visit.parents_trained}</td>
              <td>{visit.total_books_to_children}</td>
              <td>{visit.books_to_practitioner}</td>
              <td>{visit.photos_taken ? 'Yes' : 'No'}</td>
              <td>{visit.comments}</td>
              <td>{visit.outreach_happened}</td>
              <td>{visit.did_instead}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default OutreachVisits;
