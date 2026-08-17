import { useMemo, useState } from 'react';
import { formatDate, formatLabel } from '../../lib/format';
import { useCreateTrainingSession, useSaveAttendance, useTrainingData, useUpdateTrainingSession } from './api/useTraining';
import '../../styles/training.css';

const ATTENDANCE = ['invited', 'attended', 'completed', 'absent', 'cancelled'];

export default function Training() {
  const { data, isLoading, error } = useTrainingData();
  const create = useCreateTrainingSession(); const save = useSaveAttendance(); const update = useUpdateTrainingSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState(''); const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set()); const [status, setStatus] = useState('invited');
  const [form, setForm] = useState({ course_code: '', title: '', session_date: '', venue: '', facilitator: '' });
  const selected = data?.sessions.find((session) => session.id === selectedId) ?? null;
  const roster = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.practitioners ?? []).filter((person) => !query || person.name?.toLowerCase().includes(query) || person.ecdc?.name?.toLowerCase().includes(query));
  }, [data?.practitioners, search]);
  const existing = new Map(selected?.attendance.map((row) => [row.practitioner_id, row.attendance_status]) ?? []);
  const submit = () => {
    if (!form.course_code || !form.title.trim() || !form.session_date) return;
    create.mutate(form, { onSuccess: () => setForm({ course_code: '', title: '', session_date: '', venue: '', facilitator: '' }) });
  };
  const saveSelected = () => save.mutate({ sessionId: selected!.id, rows: [...selectedPeople].map((practitioner_id) => ({ practitioner_id, attendance_status: status })) }, { onSuccess: () => setSelectedPeople(new Set()) });

  return <div className="page tr-page"><main className="tr-main">
    <header><h1>Training</h1><p>Plan holiday training, invite practitioners, and keep attendance history in one place.</p></header>
    <section className="tr-card"><h2>Create session</h2><div className="tr-form">
      <label>Course<select value={form.course_code} onChange={(event) => setForm({ ...form, course_code: event.target.value })}><option value="">Choose course</option>{data?.courses.map((course) => <option key={course.code} value={course.code}>{course.name}</option>)}</select></label>
      <label>Session title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Date<input type="date" value={form.session_date} onChange={(event) => setForm({ ...form, session_date: event.target.value })} /></label><label>Venue<input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></label><label>Facilitator<input value={form.facilitator} onChange={(event) => setForm({ ...form, facilitator: event.target.value })} /></label><button className="lyt-btn tr-primary" disabled={create.isPending} onClick={submit}>Create session</button>
    </div></section>
    <div className="tr-layout"><section className="tr-card tr-sessions"><h2>Sessions</h2>{isLoading ? <p>Loading…</p> : error ? <p role="alert">{error.message}</p> : data?.sessions.length === 0 ? <p>No training sessions yet.</p> : data?.sessions.map((session) => <button key={session.id} className={`tr-session${selectedId === session.id ? ' tr-session--active' : ''}`} onClick={() => { setSelectedId(session.id); setSelectedPeople(new Set()); }}><strong>{session.title}</strong><span>{formatDate(session.session_date)} · {session.venue || 'Venue not set'}</span><span>{formatLabel(session.status)} · {session.attendance.length} people</span></button>)}</section>
      <section className="tr-card tr-roster">{!selected ? <div className="tr-empty">Select a session to manage attendance.</div> : <><div className="tr-roster-head"><div><h2>{selected.title}</h2><p>{formatDate(selected.session_date)} · {formatLabel(selected.course_code)}</p></div><select value={selected.status} onChange={(event) => update.mutate({ id: selected.id, status: event.target.value })}><option value="planned">Planned</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
        <div className="tr-toolbar"><input placeholder="Search practitioner or ECDC" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="lyt-btn" onClick={() => setSelectedPeople(selectedPeople.size === roster.length ? new Set() : new Set(roster.map((person) => person.id)))}>{selectedPeople.size === roster.length ? 'Clear all' : 'Select all shown'}</button><select value={status} onChange={(event) => setStatus(event.target.value)}>{ATTENDANCE.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}</select><button className="lyt-btn tr-primary" disabled={!selectedPeople.size || save.isPending} onClick={saveSelected}>Apply to {selectedPeople.size}</button></div>
        <div className="tr-roster-list">{roster.map((person) => <label key={person.id} className="tr-person"><input type="checkbox" checked={selectedPeople.has(person.id)} onChange={() => setSelectedPeople((current) => { const next = new Set(current); if (next.has(person.id)) next.delete(person.id); else next.add(person.id); return next; })} /><span><strong>{person.name || 'Unnamed practitioner'}</strong><small>{person.ecdc?.name || 'No ECDC'}</small></span><em>{formatLabel(existing.get(person.id) || 'not added')}</em></label>)}</div>
      </>}</section></div>
  </main></div>;
}
