import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Practitioner } from './types';
import { Icon, Icons } from './_components';
import { TRAINING_FILTERS } from "../../lib/Trainingfilters";
import { fetchPractitionerEditOptions, savePractitionerEdits } from './api/practitionerEdit';

interface Group {
  id: string;
  group_name: string;
}

interface ECDC {
  id: string;
  name: string;
}

interface Props {
  p: Practitioner;
  onDone: () => void;
  onSaved?: () => void;
}

function dateKeyForTraining(key: string) {
  return key.endsWith('_ever') ? key.replace(/_ever$/, '_date') : `${key}_date`;
}

function trainingDatePayload(dates: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(dates).map(([key, value]) => [dateKeyForTraining(key), value || null]),
  );
}

export default function PractitionerEditForm({ p, onDone, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [groups, setGroups] = useState<Group[]>([]);
  const [ecdcs, setEcdcs] = useState<ECDC[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const initialGroupId = p.group?.id || '';
  const initialEcdcId = p.ecdc?.id || '';

  const [form, setForm] = useState({
    name: p.name || '',
    group_id: initialGroupId,
    ecdc_id: initialEcdcId,
    contact_number1: p.contact_number1 || '',
    contact_number2: p.contact_number2 || '',
    has_whatsapp: p.has_whatsapp || false,
    dsd_funded: p.dsd_funded || false,
    dsd_registered: p.dsd_registered || false,
  });

  const [trainingForm, setTrainingForm] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    TRAINING_FILTERS.forEach((f) => {
      init[f.key] = !!p.training?.[f.key];
    });
    return init;
  });

  const [trainingDates, setTrainingDates] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    TRAINING_FILTERS.forEach((f) => {
      init[f.key] = String(p.training?.[dateKeyForTraining(f.key)] || '');
    });
    return init;
  });

  useEffect(() => {
    async function fetchOptions() {
      const { groups: loadedGroups, ecdcs: loadedEcdcs } = await fetchPractitionerEditOptions();

      setGroups(loadedGroups);
      setEcdcs(loadedEcdcs);

      setForm((prev) => ({
        ...prev,
        group_id: prev.group_id || loadedGroups.find((g) => g.group_name === p.group?.group_name)?.id || '',
        ecdc_id: prev.ecdc_id || loadedEcdcs.find((e) => e.name === p.ecdc?.name)?.id || '',
      }));

      setOptionsLoading(false);
    }
    fetchOptions();
  }, [p]);

  const set = (field: keyof typeof form, value: string | boolean) => {
    setConfirming(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setTraining = (key: string, value: boolean) => {
    setConfirming(false);
    setTrainingForm((prev) => ({ ...prev, [key]: value }));
  };

  const setTrainingDate = (key: string, value: string) => {
    setConfirming(false);
    setTrainingDates((prev) => ({ ...prev, [key]: value }));
  };

  const changedFields = () => {
    const changes: string[] = [];
    if (form.name !== (p.name || '')) changes.push('Name');
    if (form.group_id !== initialGroupId) changes.push('Group');
    if (form.ecdc_id !== initialEcdcId) changes.push('ECDC');
    if (form.contact_number1 !== (p.contact_number1 || '')) changes.push('Primary contact');
    if (form.contact_number2 !== (p.contact_number2 || '')) changes.push('Secondary contact');
    if (form.has_whatsapp !== !!p.has_whatsapp) changes.push('WhatsApp');
    if (form.dsd_funded !== !!p.dsd_funded) changes.push('DSD funded');
    if (form.dsd_registered !== !!p.dsd_registered) changes.push('DSD registered');

    TRAINING_FILTERS.forEach((f) => {
      if (trainingForm[f.key] !== !!p.training?.[f.key]) changes.push(`${f.label} training`);
      const existingDate = String(p.training?.[dateKeyForTraining(f.key)] || '');
      if (trainingDates[f.key] !== existingDate) changes.push(`${f.label} date`);
    });

    return changes;
  };

  const handleSave = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await savePractitionerEdits(p.id, {
        name: form.name || null,
        group_id: form.group_id || null,
        ecdc_id: form.ecdc_id || null,
        contact_number1: form.contact_number1 || null,
        contact_number2: form.contact_number2 || null,
        has_whatsapp: form.has_whatsapp,
        dsd_funded: form.dsd_funded,
        dsd_registered: form.dsd_registered,
      }, {
        ...trainingForm,
        ...trainingDatePayload(trainingDates),
      });
    } catch (saveError) {
      setSaving(false);
      setError(saveError instanceof Error ? saveError.message : 'Practitioner could not be saved.');
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['practitioners'] }),
      queryClient.invalidateQueries({ queryKey: ['visits', 'global-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['ecdcs', 'with-practitioners'] }),
    ]);

    setSaving(false);
    onSaved?.();
    onDone();
  };

  if (optionsLoading) {
    return (
      <div className="p2-detail p2-detail--empty">
        <div className="p2-loading"><div className="p2-spinner" /> Loading options...</div>
      </div>
    );
  }

  const changes = changedFields();

  return (
    <div className="p2-detail p2-edit-container">
      <div className="p2-edit-header">
        <h2 className="p2-edit-title">Edit practitioner</h2>
        <button className="p2-edit-close" onClick={onDone} disabled={saving}>
          <Icon d={Icons.close} size={14} />
        </button>
      </div>

      <div className="p2-edit-body">
        <div className="p2-edit-field">
          <label className="p2-edit-label">Name</label>
          <input className="p2-edit-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>

        <div className="p2-edit-field">
          <label className="p2-edit-label">Group</label>
          <select className="p2-edit-select" value={form.group_id} onChange={(e) => set('group_id', e.target.value)}>
            <option value="">- Select -</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
          </select>
        </div>

        <div className="p2-edit-field">
          <label className="p2-edit-label">ECDC</label>
          <select className="p2-edit-select" value={form.ecdc_id} onChange={(e) => set('ecdc_id', e.target.value)}>
            <option value="">- Select -</option>
            {ecdcs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div className="p2-edit-grid">
          <div className="p2-edit-field">
            <label className="p2-edit-label">Primary Contact</label>
            <input className="p2-edit-input" value={form.contact_number1} onChange={(e) => set('contact_number1', e.target.value)} />
          </div>
          <div className="p2-edit-field">
            <label className="p2-edit-label">Secondary Contact</label>
            <input className="p2-edit-input" value={form.contact_number2} onChange={(e) => set('contact_number2', e.target.value)} />
          </div>
        </div>

        <div className="p2-edit-section-heading">Flags</div>
        <div className="p2-edit-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <label className="p2-edit-checkbox-label">
            <input type="checkbox" checked={form.has_whatsapp} onChange={(e) => set('has_whatsapp', e.target.checked)} />
            WhatsApp
          </label>
          <label className="p2-edit-checkbox-label">
            <input type="checkbox" checked={form.dsd_funded} onChange={(e) => set('dsd_funded', e.target.checked)} />
            DSD Funded
          </label>
          <label className="p2-edit-checkbox-label">
            <input type="checkbox" checked={form.dsd_registered} onChange={(e) => set('dsd_registered', e.target.checked)} />
            DSD Registered
          </label>
        </div>

        <div className="p2-edit-section-heading">Training</div>
        <div className="p2-edit-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {TRAINING_FILTERS.map((f) => (
            <div key={f.key} className="p2-edit-field">
              <label className="p2-edit-checkbox-label">
                <input type="checkbox" checked={trainingForm[f.key]} onChange={(e) => setTraining(f.key, e.target.checked)} />
                {f.label}
              </label>
              <input
                className="p2-edit-input"
                type="date"
                value={trainingDates[f.key]}
                onChange={(e) => setTrainingDate(f.key, e.target.value)}
                disabled={!trainingForm[f.key]}
              />
            </div>
          ))}
        </div>

        {error && <div className="p2-edit-error">{error}</div>}

        {confirming && (
          <div className="p2-edit-confirm">
            <strong>Confirm changes</strong>
            <span>{changes.length > 0 ? changes.join(', ') : 'No visible field changes detected.'}</span>
          </div>
        )}

        <div className="p2-edit-footer">
          <button className="p2-edit-btn p2-edit-btn--ghost" onClick={onDone} disabled={saving}>
            Cancel
          </button>
          {confirming && (
            <button className="p2-edit-btn p2-edit-btn--ghost" onClick={() => setConfirming(false)} disabled={saving}>
              Review
            </button>
          )}
          <button className="p2-edit-btn p2-edit-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : confirming ? 'Confirm' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
