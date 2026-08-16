import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EcdcOption,
  useDataQualitySummary,
  useEcdcOptions,
  useMergeEcdcs,
  useMergePractitioners,
  usePractitionerOptions,
  PractitionerOption,
  useResolveUnmatched,
  useUnmatchedRecords,
  useKoboReconciliation,
  useDuplicateVisitCandidates,
  useResolveDuplicateVisit,
} from '../api/useDataQuality';
import '../../../styles/data-quality.css';

function severityLabel(severity: string) {
  if (severity === 'critical') return 'Critical';
  if (severity === 'high') return 'High';
  if (severity === 'medium') return 'Medium';
  return 'Low';
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function FieldChoice({
  label,
  field,
  keepValue,
  discardValue,
  value,
  onChange,
  allowCombine = false,
}: {
  label: string;
  field: string;
  keepValue: unknown;
  discardValue: unknown;
  value: string;
  onChange: (field: string, value: string) => void;
  allowCombine?: boolean;
}) {
  return (
    <label className="dq-merge-field">
      <span className="dq-merge-field__label">{label}</span>
      <select className="dq-select" value={value} onChange={(event) => onChange(field, event.target.value)}>
        <option value="keep">Keep: {displayValue(keepValue)}</option>
        <option value="discard">Use merge record: {displayValue(discardValue)}</option>
        <option value="coalesce">Prefer filled value</option>
        {allowCombine && <option value="or">Yes if either is yes</option>}
      </select>
    </label>
  );
}

function selectedById<T extends { id: string }>(rows: T[], id: string) {
  return rows.find((row) => row.id === id) ?? null;
}

function MergeRecordsPanel() {
  const { data: practitioners = [] } = usePractitionerOptions();
  const { data: ecdcs = [] } = useEcdcOptions();
  const mergePractitioners = useMergePractitioners();
  const mergeEcdcs = useMergeEcdcs();

  const [mode, setMode] = useState<'practitioners' | 'ecdcs'>('practitioners');
  const [keepId, setKeepId] = useState('');
  const [discardId, setDiscardId] = useState('');
  const [choices, setChoices] = useState<Record<string, string>>({});

  const rows = mode === 'practitioners' ? practitioners : ecdcs;
  const keep = selectedById(rows, keepId);
  const discard = selectedById(rows, discardId);
  const canMerge = keepId && discardId && keepId !== discardId;
  const isPending = mergePractitioners.isPending || mergeEcdcs.isPending;

  const setChoice = (field: string, value: string) => {
    setChoices((current) => ({ ...current, [field]: value }));
  };

  const resetSelection = (nextMode: 'practitioners' | 'ecdcs') => {
    setMode(nextMode);
    setKeepId('');
    setDiscardId('');
    setChoices({});
  };

  const submitMerge = () => {
    if (!canMerge) return;

    if (mode === 'practitioners') {
      mergePractitioners.mutate({ keepId, discardId, fieldChoices: choices });
    } else {
      mergeEcdcs.mutate({ keepId, discardId, fieldChoices: choices });
    }
  };

  const practitionerKeep = keep as PractitionerOption | null;
  const practitionerDiscard = discard as PractitionerOption | null;
  const ecdcKeep = keep as EcdcOption | null;
  const ecdcDiscard = discard as EcdcOption | null;

  return (
    <section className="dq-section dq-merge">
      <div className="dq-section__header">
        <div>
          <h2 className="dq-section__title">Merge Practitioners / ECDCs</h2>
          <p className="dq-section__subtitle">
            Move linked records to the kept record, choose which fields to keep, and soft-delete the duplicate.
          </p>
        </div>
        <div className="dq-segment" role="group" aria-label="Record type">
          <button
            className={`dq-segment__button${mode === 'practitioners' ? ' dq-segment__button--active' : ''}`}
            onClick={() => resetSelection('practitioners')}
          >
            Practitioners
          </button>
          <button
            className={`dq-segment__button${mode === 'ecdcs' ? ' dq-segment__button--active' : ''}`}
            onClick={() => resetSelection('ecdcs')}
          >
            ECDCs
          </button>
        </div>
      </div>

      <div className="dq-merge-selectors">
        <label>
          <span>Keep this record</span>
          <select className="dq-select" value={keepId} onChange={(event) => setKeepId(event.target.value)}>
            <option value="">Choose record</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id} disabled={row.id === discardId}>
                {row.name || 'Unnamed'}{'area' in row && row.area ? ` - ${row.area}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Merge this duplicate into it</span>
          <select className="dq-select" value={discardId} onChange={(event) => setDiscardId(event.target.value)}>
            <option value="">Choose duplicate</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id} disabled={row.id === keepId}>
                {row.name || 'Unnamed'}{'area' in row && row.area ? ` - ${row.area}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {keep && discard && (
        <div className="dq-merge-grid">
          {mode === 'practitioners' && practitionerKeep && practitionerDiscard ? (
            <>
              <FieldChoice label="Name" field="name" keepValue={practitionerKeep.name} discardValue={practitionerDiscard.name} value={choices.name ?? 'keep'} onChange={setChoice} />
              <FieldChoice label="Primary contact" field="contact_number1" keepValue={practitionerKeep.contact_number1} discardValue={practitionerDiscard.contact_number1} value={choices.contact_number1 ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="Secondary contact" field="contact_number2" keepValue={practitionerKeep.contact_number2} discardValue={practitionerDiscard.contact_number2} value={choices.contact_number2 ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="ECDC link" field="ecdc_id" keepValue={practitionerKeep.ecdc_list?.name} discardValue={practitionerDiscard.ecdc_list?.name} value={choices.ecdc_id ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="Group" field="group_id" keepValue={practitionerKeep.groups?.group_name} discardValue={practitionerDiscard.groups?.group_name} value={choices.group_id ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="WhatsApp" field="has_whatsapp" keepValue={practitionerKeep.has_whatsapp} discardValue={practitionerDiscard.has_whatsapp} value={choices.has_whatsapp ?? 'or'} onChange={setChoice} allowCombine />
              <FieldChoice label="DSD registered" field="dsd_registered" keepValue={practitionerKeep.dsd_registered} discardValue={practitionerDiscard.dsd_registered} value={choices.dsd_registered ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="DSD funded" field="dsd_funded" keepValue={practitionerKeep.dsd_funded} discardValue={practitionerDiscard.dsd_funded} value={choices.dsd_funded ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="Status" field="status" keepValue={practitionerKeep.status} discardValue={practitionerDiscard.status} value={choices.status ?? 'keep'} onChange={setChoice} />
            </>
          ) : ecdcKeep && ecdcDiscard ? (
            <>
              <FieldChoice label="Name" field="name" keepValue={ecdcKeep.name} discardValue={ecdcDiscard.name} value={choices.name ?? 'keep'} onChange={setChoice} />
              <FieldChoice label="Area" field="area" keepValue={ecdcKeep.area} discardValue={ecdcDiscard.area} value={choices.area ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="Longitude" field="longitude" keepValue={ecdcKeep.longitude} discardValue={ecdcDiscard.longitude} value={choices.longitude ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="Latitude" field="latitude" keepValue={ecdcKeep.latitude} discardValue={ecdcDiscard.latitude} value={choices.latitude ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="Chief" field="chief" keepValue={ecdcKeep.chief} discardValue={ecdcDiscard.chief} value={choices.chief ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="Headman" field="headman" keepValue={ecdcKeep.headman} discardValue={ecdcDiscard.headman} value={choices.headman ?? 'coalesce'} onChange={setChoice} />
              <FieldChoice label="Children" field="number_children" keepValue={ecdcKeep.number_children} discardValue={ecdcDiscard.number_children} value={choices.number_children ?? 'coalesce'} onChange={setChoice} />
            </>
          ) : null}
        </div>
      )}

      <div className="dq-merge-footer">
        <button
          className="dq-button dq-button--primary"
          disabled={!canMerge || isPending}
          onClick={submitMerge}
        >
          {isPending ? 'Merging...' : `Merge ${mode === 'practitioners' ? 'Practitioners' : 'ECDCs'}`}
        </button>
        {keepId && discardId && keepId === discardId && (
          <span className="dq-merge-warning">Choose two different records.</span>
        )}
      </div>
    </section>
  );
}

function ReconciliationPanel() {
  const { data: rows = [], isLoading, error } = useKoboReconciliation();
  return (
    <section className="dq-section">
      <div className="dq-section__header">
        <div>
          <h2 className="dq-section__title">Kobo Reconciliation</h2>
          <p className="dq-section__subtitle">
            Raw submissions that are not yet safely represented by a visible record.
          </p>
        </div>
        <Link className="dq-button" to="/kobo-monitor">Open Kobo Monitor</Link>
      </div>
      {isLoading ? <div className="dq-empty">Checking submission lineage...</div> : error ? (
        <div className="dq-empty" role="alert">Reconciliation could not be loaded: {error.message}</div>
      ) : rows.length === 0 ? <div className="dq-empty">Every accepted submission is accounted for.</div> : (
        <div className="dq-table-wrap">
          <table className="dq-table">
            <thead><tr><th>Submission</th><th>State</th><th>Status</th><th>Attempts</th><th>Unmatched</th><th>Last error</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.instance_id}>
                <td className="dq-mono">{row.instance_id}</td>
                <td>{row.reconciliation_state.replaceAll('_', ' ')}</td>
                <td>{row.processing_status ?? 'Pending'}</td>
                <td>{row.attempt_count ?? 0}</td>
                <td>{row.unresolved_count}</td>
                <td>{row.error_message || '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DuplicateVisitsPanel() {
  const { data: rows = [], isLoading, error } = useDuplicateVisitCandidates();
  const resolveDuplicate = useResolveDuplicateVisit();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  return (
    <section className="dq-section">
      <div className="dq-section__header">
        <div>
          <h2 className="dq-section__title">Possible Duplicate Visits</h2>
          <p className="dq-section__subtitle">
            High-confidence same-day matches. Choose which visit remains reportable and record why.
          </p>
        </div>
      </div>
      {isLoading ? <div className="dq-empty">Checking for duplicate visits...</div> : error ? (
        <div className="dq-empty" role="alert">Duplicate candidates could not be loaded: {error.message}</div>
      ) : rows.length === 0 ? <div className="dq-empty">No high-confidence duplicate visits found.</div> : (
        <div className="dq-table-wrap">
          <table className="dq-table">
            <thead><tr><th>Date</th><th>Confidence</th><th>Visit A</th><th>Visit B</th><th>Reason and action</th></tr></thead>
            <tbody>{rows.map((row) => {
              const key = `${row.visit_a_id}:${row.visit_b_id}`;
              const reason = reasons[key] ?? '';
              return (
                <tr key={key}>
                  <td>{row.date}</td>
                  <td>{row.confidence_score}%</td>
                  <td className="dq-mono">{row.visit_a_id}</td>
                  <td className="dq-mono">{row.visit_b_id}</td>
                  <td>
                    <input
                      className="dq-search"
                      value={reason}
                      onChange={(event) => setReasons((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder="Required resolution reason"
                    />
                    <div className="dq-actions">
                      <button className="dq-button dq-button--primary" disabled={reason.trim().length < 5 || resolveDuplicate.isPending}
                        onClick={() => resolveDuplicate.mutate({ keepId: row.visit_a_id, discardId: row.visit_b_id, reason })}>
                        Keep A
                      </button>
                      <button className="dq-button" disabled={reason.trim().length < 5 || resolveDuplicate.isPending}
                        onClick={() => resolveDuplicate.mutate({ keepId: row.visit_b_id, discardId: row.visit_a_id, reason })}>
                        Keep B
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function DataQualityPage() {
  const { data: metrics = [], isLoading: metricsLoading } = useDataQualitySummary();
  const { data: unmatched = [], isLoading: unmatchedLoading } = useUnmatchedRecords();
  const { data: practitioners = [] } = usePractitionerOptions();
  const resolveUnmatched = useResolveUnmatched();
  const [selectedPractitioners, setSelectedPractitioners] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const filteredUnmatched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unmatched;

    return unmatched.filter((row) =>
      row.raw_value?.toLowerCase().includes(q) ||
      row.field?.toLowerCase().includes(q) ||
      row.instance_id?.toLowerCase().includes(q)
    );
  }, [search, unmatched]);

  return (
    <>
        <section className="dq-metrics" aria-label="Data quality summary">
          {metricsLoading ? (
            <div className="dq-empty">Loading quality checks...</div>
          ) : (
            metrics.map((metric) => (
              <div key={metric.metric_key} className={`dq-metric dq-metric--${metric.severity}`}>
                <span className="dq-metric__label">{metric.label}</span>
                <strong className="dq-metric__value">{metric.value}</strong>
                <span className="dq-metric__severity">{severityLabel(metric.severity)}</span>
              </div>
            ))
          )}
        </section>

        <ReconciliationPanel />

        <DuplicateVisitsPanel />

        <MergeRecordsPanel />

        <section className="dq-section">
          <div className="dq-section__header">
            <div>
              <h2 className="dq-section__title">Unmatched Kobo Queue</h2>
              <p className="dq-section__subtitle">
                Link unmatched values to an existing practitioner or mark them reviewed.
              </p>
            </div>

            <input
              className="dq-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search raw value, field, or submission ID"
            />
          </div>

          {unmatchedLoading ? (
            <div className="dq-empty">Loading unmatched records...</div>
          ) : filteredUnmatched.length === 0 ? (
            <div className="dq-empty">No unresolved unmatched records.</div>
          ) : (
            <div className="dq-table-wrap">
              <table className="dq-table">
                <thead>
                  <tr>
                    <th>Raw Value</th>
                    <th>Field</th>
                    <th>Submission</th>
                    <th>Link Practitioner</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnmatched.map((row) => {
                    const selectedId = selectedPractitioners[row.id] ?? '';

                    return (
                      <tr key={row.id}>
                        <td>{row.raw_value || '-'}</td>
                        <td>{row.field || '-'}</td>
                        <td className="dq-mono">{row.instance_id || '-'}</td>
                        <td>
                          <select
                            className="dq-select"
                            value={selectedId}
                            onChange={(event) =>
                              setSelectedPractitioners((current) => ({
                                ...current,
                                [row.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Choose practitioner</option>
                            {practitioners.map((practitioner) => (
                              <option key={practitioner.id} value={practitioner.id}>
                                {practitioner.name || 'Unnamed practitioner'}
                                {practitioner.ecdc_list?.name ? ` - ${practitioner.ecdc_list.name}` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="dq-actions">
                            <button
                              className="dq-button dq-button--primary"
                              disabled={!selectedId || resolveUnmatched.isPending}
                              onClick={() =>
                                resolveUnmatched.mutate({
                                  id: row.id,
                                  resolvedId: selectedId,
                                  resolutionType: 'link',
                                  note: 'Linked from Data Quality page',
                                })
                              }
                            >
                              Link
                            </button>
                            <button
                              className="dq-button"
                              disabled={resolveUnmatched.isPending}
                              onClick={() =>
                                resolveUnmatched.mutate({
                                  id: row.id,
                                  resolutionType: 'reviewed',
                                  note: 'Marked reviewed from Data Quality page',
                                })
                              }
                            >
                              Reviewed
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
    </>
  );
}
