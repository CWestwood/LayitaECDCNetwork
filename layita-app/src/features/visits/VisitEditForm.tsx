// src/features/visits/VisitEditForm.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../auth/supabaseClient';
import { VisitRow } from './api/useVisits';
import { CloseIcon } from './_components';

interface KoboLabel {
  list_name: string;
  name: string;
  label: string;
}

interface Practitioner {
  id: string;
  name: string;
}

interface Props {
  visit: VisitRow;
  onDone: () => void;
  onSaved?: () => void;
}

export default function VisitEditForm({ visit: v, onDone, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // ── Dropdown options ─────────────────────────────────────────
  const [practitioners,          setPractitioners]          = useState<Practitioner[]>([]);
  const [outreachTypes,          setOutreachTypes]          = useState<KoboLabel[]>([]);
  const [outreachHappenedOptions,setOutreachHappenedOptions]= useState<KoboLabel[]>([]);
  const [optionsLoading,         setOptionsLoading]         = useState(true);

  // ── Derive the practitioner id from the visit row ────────────
  const initialPractitionerId =
    (v as any).practitioner_id ??
    (typeof v.practitioner === 'object' ? (v.practitioner as any)?.id : v.practitioner) ??
    '';

  // ── Form state ───────────────────────────────────────────────

  const [form, setForm] = useState({
    practitioner_name:     v.practitioner?.name || '',
    outreach_happened:     v.outreach_happened     ?? '',
    outreach_type:         v.outreach_type         ?? '',
    did_instead:           v.did_instead           ?? '',
    parents_trained:       v.parents_trained       ?? '',
    parents_enrolled:      v.parents_enrolled      ?? '',
    children_books:        v.children_books        ?? '',
    books_per_child:       v.books_per_child       ?? '',
    books_to_practitioner: v.books_to_practitioner ?? '',
    transport_km:          v.transport_km          ?? '',
    transport_cost:        v.transport_cost        ?? '',
    transport_type:        v.transport_type        ?? '',
    comments:              v.comments              ?? '',
  });

  const set = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    async function fetchOptions() {
      const [pracRes, labelRes] = await Promise.all([
        supabase.from('practitioners').select('id, name').order('name'),
        supabase
          .from('kobo_label')
          .select('list_name, name, label')
          .in('list_name', ['outreach_type', 'yesno_other']),
      ]);

      if (pracRes.data) setPractitioners(pracRes.data);

      if (labelRes.data) {
        const types = labelRes.data.filter((l) => l.list_name === 'outreach_type');
        const haps = labelRes.data.filter((l) => l.list_name === 'yesno_other');
        setOutreachTypes(types);
        setOutreachHappenedOptions(haps);

        setForm((prev) => {
          const prevHap = (prev.outreach_happened || '').toLowerCase().trim();
          const prevType = (prev.outreach_type || '').toLowerCase().trim();
          return {
            ...prev,
            outreach_happened: haps.find((o) => 
              o.name.toLowerCase() === prevHap || (o.label || '').toLowerCase() === prevHap
            )?.label ?? prev.outreach_happened,
            outreach_type: types.find((o) => 
              o.name.toLowerCase() === prevType || (o.label || '').toLowerCase() === prevType
            )?.label ?? prev.outreach_type,
          };
        });
      }

      setOptionsLoading(false);
    }
    fetchOptions();
  }, []);

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    let finalPractitionerId = String(initialPractitionerId);

    // Resolve practitioner ID from the typed name
    if (form.practitioner_name.trim()) {
      const typedName = form.practitioner_name.trim();
      const existing = practitioners.find(
        (p) => p.name.trim().toLowerCase() === typedName.toLowerCase()
      );

      if (existing) {
        finalPractitionerId = existing.id;
      } else {
        setError('Choose an existing practitioner. New practitioners should be created through the practitioner workflow.');
        setSaving(false);
        return;
      }
    } else {
      finalPractitionerId = '';
    }

    const { error: saveError, count } = await supabase
      .from('outreach_visits')
      .update({
        practitioner_id:       finalPractitionerId        || null,
        outreach_happened:     form.outreach_happened     || null,
        outreach_type:         form.outreach_type         || null,
        did_instead:           form.did_instead           || null,
        parents_trained:       numOrNull(form.parents_trained),
        parents_enrolled:      numOrNull(form.parents_enrolled),
        children_books:        numOrNull(form.children_books),
        books_per_child:       numOrNull(form.books_per_child),
        books_to_practitioner: numOrNull(form.books_to_practitioner),
        transport_km:          numOrNull(form.transport_km),
        transport_cost:        numOrNull(form.transport_cost),
        transport_type:        form.transport_type        || null,
        comments:              form.comments              || null,
      }, { count: 'exact' })
      .eq('id', v.id);

    setSaving(false);

    if (saveError) { setError(saveError.message); return; }
    if (count === 0) { setError('Permission denied — you do not have permission to edit this visit.'); return; }

    onSaved?.();
    onDone();
  };

  // ── Render ───────────────────────────────────────────────────
  if (optionsLoading) {
    return (
      <div className="ov-edit-form">
        <div className="ov-edit-loading">Loading options…</div>
      </div>
    );
  }

  return (
    <div className="ov-edit-form">
      <div className="ov-edit-form__header">
        <h1 className="ov-edit-form__title">Edit visit</h1>
         <button className="ov-edit-btn" onClick={onDone}><CloseIcon /></button>
      </div>
     

      {/* Date — read-only */}
      <div className="ov-edit-field">
        <label className="ov-edit-label">Date</label>
        <div className="ov-edit-readonly">{v.date}</div>
      </div>

      {/* Practitioner */}
      <div className="ov-edit-field">
        <label className="ov-edit-label">Practitioner</label>
        <input
          className="ov-edit-input"
          list="practitioner-options"
          value={form.practitioner_name}
          onChange={(e) => set('practitioner_name', e.target.value)}
          placeholder="Type or select a practitioner..."
        />
        <datalist id="practitioner-options">
          {practitioners.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </div>

      {/* Outreach happened */}
      <div className="ov-edit-field">
        <label className="ov-edit-label">Outreach happened</label>
        <select
          className="ov-edit-select"
          value={form.outreach_happened}
          onChange={(e) => set('outreach_happened', e.target.value)}
        >
          <option value="">— Select —</option>
          {outreachHappenedOptions.map((o) => (
            <option key={o.name} value={o.label}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Did instead — only shown when outreach didn't happen */}
      {form.outreach_happened === 'no' && (
        <div className="ov-edit-field">
          <label className="ov-edit-label">What happened instead?</label>
          <input
            className="ov-edit-input"
            value={form.did_instead}
            onChange={(e) => set('did_instead', e.target.value)}
          />
        </div>
      )}

      {/* Outreach type */}
      <div className="ov-edit-field">
        <label className="ov-edit-label">Outreach type</label>
        <select
          className="ov-edit-select"
          value={form.outreach_type}
          onChange={(e) => set('outreach_type', e.target.value)}
        >
          <option value="">— Select —</option>
          {outreachTypes.map((o) => (
            <option key={o.name} value={o.label}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Metrics */}
      <div className="ov-edit-section-heading">Metrics</div>
      <div className="ov-edit-grid">
        {([
          ['parents_trained',       'Parents trained'],
          ['parents_enrolled',      'Parents enrolled'],
          ['children_books',        'Books to children'],
          ['books_per_child',       'Books per child'],
          ['books_to_practitioner', 'Books to prac.'],
          ['transport_km',          'Transport km'],
          ['transport_cost',        'Transport cost (R)'],
        ] as [keyof typeof form, string][]).map(([field, label]) => (
          <div key={field} className="ov-edit-field">
            <label className="ov-edit-label">{label}</label>
            <input
              className="ov-edit-input"
              type="number"
              min="0"
              value={form[field] as string}
              onChange={(e) => set(field, e.target.value)}
            />
          </div>
        ))}

        <div className="ov-edit-field">
          <label className="ov-edit-label">Transport type</label>
          <input
            className="ov-edit-input"
            value={form.transport_type}
            onChange={(e) => set('transport_type', e.target.value)}
          />
        </div>
      </div>

      {/* Comments */}
      <div className="ov-edit-field">
        <label className="ov-edit-label">Comments</label>
        <textarea
          className="ov-edit-textarea"
          rows={3}
          value={form.comments}
          onChange={(e) => set('comments', e.target.value)}
        />
      </div>

      {error && <div className="ov-edit-error">{error}</div>}

      <div className="ov-edit-form__footer">
        <button className="ov-edit-btn ov-edit-btn--ghost" onClick={onDone} disabled={saving}>
          Cancel
        </button>
        <button className="ov-edit-btn ov-edit-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

const numOrNull = (v: string | number | null | undefined) =>
  v === '' || v == null ? null : Number(v);
