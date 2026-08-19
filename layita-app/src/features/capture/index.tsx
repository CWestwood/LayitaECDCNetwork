import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { useAuth } from '../auth/useAuth';
import { useCaptureOptions, useRequestIdentityReview, useSubmitCapture } from './api';
import SearchableSelector from './SearchableSelector';
import {
  buildCapturePayload,
  CAPTURE_FORM_VERSION,
  captureErrorMessage,
  emptyCaptureValues,
  happened,
  needsEcdc,
  needsOutcome,
  needsPractitioner,
  newCaptureId,
  parseStoredDraft,
  similaritySuggestions,
  validateCapture,
} from './model';
import type { CaptureFormValues, CaptureResult, CaptureState, IdentityKind, StoredDraft } from './model';
import '../../styles/capture.css';

const OUTREACH_TYPES = [
  ['caregiver_training', 'Caregiver training'],
  ['literacy_promotion', 'Literacy promotion'],
  ['practitioner_support', 'Practitioner support'],
  ['ecdc_mapping', 'ECDC mapping'],
  ['interested_practitioner', 'Interested practitioner'],
  ['ecdc_update', 'Update ECDC details'],
  ['other', 'Other outreach'],
] as const;

const OUTREACH_OUTCOMES = [
  ['happened', 'Yes'],
  ['different_to_planned', 'Different to planned'],
  ['did_not_happen', 'Did not happen'],
] as const;

function readableTime(value: string | null) {
  if (!value) return 'Not saved yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function NumberField({ label, error, ...props }: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `capture-${String(props.name)}`;
  return (
    <div className={`capture-field ${error ? 'capture-field--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="decimal" min="0" step="any" aria-invalid={Boolean(error)} {...props} />
      {error ? <p className="capture-error">{error}</p> : null}
    </div>
  );
}

function StatusBadge({ state }: { state: CaptureState }) {
  const labels: Record<CaptureState, string> = {
    draft: 'Draft',
    submitting: 'Submitting',
    submitted: 'Submitted',
    failed: 'Failed',
    needs_review: 'Needs review',
  };
  return <span className={`capture-status capture-status--${state}`} aria-live="polite">{labels[state]}</span>;
}

export default function CapturePage() {
  const { profile, session } = useAuth();
  const draftKey = `layita-capture-draft:${profile?.id ?? 'unknown'}`;
  const initialDraft = useMemo(() => parseStoredDraft(localStorage.getItem(draftKey)), [draftKey]);
  const [captureId, setCaptureId] = useState(() => initialDraft?.captureId ?? newCaptureId());
  const [recovered, setRecovered] = useState(Boolean(initialDraft));
  const [startedAt, setStartedAt] = useState(() => initialDraft?.startedAt ?? new Date().toISOString());
  const [completedAt, setCompletedAt] = useState<string | undefined>(() => initialDraft?.completedAt);
  const [values, setValues] = useState<CaptureFormValues>(() => initialDraft?.values ?? emptyCaptureValues());
  const [state, setState] = useState<CaptureState>(() => initialDraft?.state ?? 'draft');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(() => initialDraft?.savedAt ?? null);
  const [reviewRequestId, setReviewRequestId] = useState<string | undefined>(() => initialDraft?.reviewRequestId);
  const [errors, setErrors] = useState<Partial<Record<keyof CaptureFormValues, string>>>({});
  const [failureMessage, setFailureMessage] = useState('');
  const [failedAction, setFailedAction] = useState<'submit' | 'review'>('submit');
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [locationMessage, setLocationMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const submitInFlight = useRef(false);
  const optionsQuery = useCaptureOptions();
  const submitMutation = useSubmitCapture();
  const reviewMutation = useRequestIdentityReview();
  const ecdcs = optionsQuery.data?.ecdcs ?? [];
  const practitioners = optionsQuery.data?.practitioners ?? [];
  const isLocked = state !== 'draft';
  const isOperational = needsOutcome(values.outreachType);
  const visitHappened = happened(values);

  useEffect(() => {
    if (state === 'submitted') return;
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const stored: StoredDraft = {
        formVersion: CAPTURE_FORM_VERSION,
        captureId,
        startedAt,
        completedAt,
        savedAt,
        values,
        state: state === 'submitting' ? 'draft' : state,
        reviewRequestId,
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(stored));
        setLastSavedAt(savedAt);
      } catch {
        // Draft persistence is best-effort; submission remains available.
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [captureId, completedAt, draftKey, reviewRequestId, startedAt, state, values]);

  useEffect(() => {
    const warnDuringSubmission = (event: BeforeUnloadEvent) => {
      if (state !== 'submitting') return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnDuringSubmission);
    return () => window.removeEventListener('beforeunload', warnDuringSubmission);
  }, [state]);

  const setField = <K extends keyof CaptureFormValues>(key: K, value: CaptureFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const persistDraft = (
    nextState: StoredDraft['state'],
    nextCompletedAt = completedAt,
    nextReviewRequestId = reviewRequestId,
  ) => {
    const savedAt = new Date().toISOString();
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        formVersion: CAPTURE_FORM_VERSION,
        captureId,
        startedAt,
        completedAt: nextCompletedAt,
        savedAt,
        values,
        state: nextState,
        reviewRequestId: nextReviewRequestId,
      } satisfies StoredDraft));
      setLastSavedAt(savedAt);
    } catch {
      // Draft persistence is best-effort; visible failure handling remains.
    }
  };

  const openReview = (kind: IdentityKind, name: string) => {
    setValues((current) => ({ ...current, reviewKind: kind, reviewName: name, reviewNotes: '' }));
    window.setTimeout(() => document.getElementById('capture-review-name')?.focus(), 0);
  };

  const startNew = () => {
    try { localStorage.removeItem(draftKey); } catch { /* Ignore unavailable storage. */ }
    setCaptureId(newCaptureId());
    setRecovered(false);
    setStartedAt(new Date().toISOString());
    setCompletedAt(undefined);
    setValues(emptyCaptureValues());
    setState('draft');
    setLastSavedAt(null);
    setReviewRequestId(undefined);
    setErrors({});
    setFailureMessage('');
    setResult(null);
    setLocationMessage('');
    submitInFlight.current = false;
  };

  const editFailedDraft = () => {
    setCaptureId(newCaptureId());
    setCompletedAt(undefined);
    setState('draft');
    setFailureMessage('');
    setResult(null);
    submitInFlight.current = false;
  };

  const runSubmission = async () => {
    if (submitInFlight.current) return;
    if (!session) {
      setFailedAction('submit');
      setFailureMessage('Your session has expired. Sign in again; this draft will remain on this device.');
      setState('failed');
      return;
    }
    const validation = validateCapture(values);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setState('draft');
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    if (values.reviewKind) {
      setErrors((current) => ({ ...current, reviewName: 'Finish or cancel the identity review before submitting.' }));
      document.getElementById('capture-review-name')?.focus();
      return;
    }

    const endedAt = completedAt ?? new Date().toISOString();
    setCompletedAt(endedAt);
    persistDraft('draft', endedAt);
    submitInFlight.current = true;
    setState('submitting');
    setFailureMessage('');
    setFailedAction('submit');
    try {
      const response = await submitMutation.mutateAsync({
        captureId,
        clientCreatedAt: endedAt,
        payload: buildCapturePayload(values, startedAt, endedAt),
      });
      if (!response.success) {
        setFailureMessage(captureErrorMessage(response.code));
        setResult(response);
        setState('failed');
        return;
      }
      setResult(response);
      setState('submitted');
      try { localStorage.removeItem(draftKey); } catch { /* Ignore unavailable storage. */ }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const expired = /jwt|session|refresh token|not authenticated|401/i.test(message);
      setFailureMessage(expired
        ? 'Your session expired during submission. Sign in again and retry this same reference; the draft is safe.'
        : `Submission could not be confirmed. Check your connection and retry the same reference. ${message}`);
      setState('failed');
    } finally {
      submitInFlight.current = false;
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runSubmission();
  };

  const runReviewRequest = async () => {
    if (submitInFlight.current) return;
    if (!session) {
      setFailureMessage('Your session has expired. Sign in again; this draft will remain on this device.');
      setFailedAction('review');
      setState('failed');
      return;
    }
    if (!values.reviewKind || values.reviewName.trim().length < 2) {
      setErrors((current) => ({ ...current, reviewName: 'Enter the name that could not be found.' }));
      return;
    }
    submitInFlight.current = true;
    setState('submitting');
    setFailedAction('review');
    setFailureMessage('');
    try {
      const requestId = await reviewMutation.mutateAsync({
        captureId,
        kind: values.reviewKind,
        name: values.reviewName,
        notes: values.reviewNotes,
        outreachType: values.outreachType,
        date: values.date,
      });
      setReviewRequestId(requestId);
      persistDraft('needs_review', completedAt, requestId);
      setState('needs_review');
    } catch (error) {
      setFailureMessage(`The review request could not be saved. Retry when connected. ${error instanceof Error ? error.message : String(error)}`);
      setState('failed');
    } finally {
      submitInFlight.current = false;
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location capture is not available in this browser.');
      return;
    }
    setLocationMessage('Getting location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValues((current) => ({
          ...current,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
          altitude: position.coords.altitude == null ? '' : String(position.coords.altitude),
          accuracy: String(position.coords.accuracy),
        }));
        setLocationMessage(`Location captured to approximately ${Math.round(position.coords.accuracy)} metres.`);
      },
      (error) => setLocationMessage(`Location was not captured: ${error.message}`),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const reviewSuggestions = values.reviewKind === 'ecdc'
    ? similaritySuggestions(values.reviewName, ecdcs)
    : similaritySuggestions(values.reviewName, practitioners);

  return (
    <div className="page capture-page">
      <main className="capture-main">
        <header className="capture-header">
          <div>
            <span className="capture-eyebrow">Website capture pilot</span>
            <h1>Record outreach</h1>
            <p>Save one canonical outreach record. Kobo remains available during the pilot.</p>
          </div>
          <StatusBadge state={state} />
        </header>

        <section className="capture-meta" aria-label="Draft information">
          <div><span>Reference</span><strong>{captureId}</strong></div>
          <div><span>Form version</span><strong>{CAPTURE_FORM_VERSION}</strong></div>
          <div><span>Last saved on this device</span><strong>{readableTime(lastSavedAt)}</strong></div>
          {recovered ? <p className="capture-recovered" role="status">Recovered the draft saved on this device.</p> : null}
        </section>

        {optionsQuery.error ? (
          <div className="capture-banner capture-banner--error" role="alert">
            ECDCs and practitioners could not be loaded. {optionsQuery.error.message}
            <button type="button" onClick={() => void optionsQuery.refetch()}>Retry</button>
          </div>
        ) : optionsQuery.isLoading ? (
          <div className="capture-banner" role="status">Loading current ECDCs and practitioners…</div>
        ) : null}

        {state === 'submitted' && result ? (
          <section className="capture-result capture-result--success" aria-live="polite">
            <h2>Outreach submitted</h2>
            <p>This reference is saved in canonical reporting{result.duplicate ? ' (an earlier successful response was safely recovered)' : ''}.</p>
            <dl><div><dt>Capture reference</dt><dd>{captureId}</dd></div><div><dt>Visit ID</dt><dd>{result.visit_id}</dd></div></dl>
            <button type="button" className="capture-button capture-button--primary" onClick={startNew}>Start another capture</button>
          </section>
        ) : state === 'needs_review' ? (
          <section className="capture-result capture-result--review" aria-live="polite">
            <h2>Identity review requested</h2>
            <p>The record has not been submitted as a visit. A manager can resolve the missing {values.reviewKind} without creating an unreviewed duplicate.</p>
            <dl><div><dt>Capture reference</dt><dd>{captureId}</dd></div><div><dt>Review request</dt><dd>{reviewRequestId}</dd></div></dl>
            <button type="button" className="capture-button capture-button--primary" onClick={startNew}>Start another capture</button>
          </section>
        ) : (
          <>
            {state === 'failed' && (
              <section className="capture-result capture-result--failed" role="alert">
                <h2>{failedAction === 'review' ? 'Review request failed' : 'Submission failed'}</h2>
                <p>{failureMessage}</p>
                <p><strong>Reference:</strong> {captureId}</p>
                <div className="capture-actions">
                  <button type="button" className="capture-button capture-button--primary" onClick={() => void (failedAction === 'review' ? runReviewRequest() : runSubmission())}>Retry same reference</button>
                  <button type="button" className="capture-button" onClick={editFailedDraft}>Edit as a new reference</button>
                </div>
              </section>
            )}

            <form ref={formRef} onSubmit={handleSubmit} noValidate>
              <fieldset disabled={isLocked}>
                <section className="capture-card">
                  <div className="capture-card__heading"><span>1</span><div><h2>Outreach</h2><p>What took place and when?</p></div></div>
                  <div className="capture-grid capture-grid--two">
                    <div className={`capture-field ${errors.date ? 'capture-field--error' : ''}`}>
                      <label htmlFor="capture-date">Outreach date *</label>
                      <input id="capture-date" type="date" value={values.date} onChange={(event) => setField('date', event.target.value)} aria-invalid={Boolean(errors.date)} />
                      {errors.date ? <p className="capture-error">{errors.date}</p> : null}
                    </div>
                    <div className={`capture-field ${errors.outreachType ? 'capture-field--error' : ''}`}>
                      <label htmlFor="capture-type">Activity *</label>
                      <select id="capture-type" value={values.outreachType} onChange={(event) => setField('outreachType', event.target.value as CaptureFormValues['outreachType'])} aria-invalid={Boolean(errors.outreachType)}>
                        <option value="">Choose activity</option>
                        {OUTREACH_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      {errors.outreachType ? <p className="capture-error">{errors.outreachType}</p> : null}
                    </div>
                  </div>
                  {isOperational && (
                    <fieldset className={`capture-choice ${errors.outcome ? 'capture-field--error' : ''}`}>
                      <legend>Did it happen as planned? *</legend>
                      <div className="capture-choice__options">
                        {OUTREACH_OUTCOMES.map(([value, label]) => (
                          <label key={value}><input type="radio" name="outcome" value={value} checked={values.outcome === value} onChange={() => setField('outcome', value)} />{label}</label>
                        ))}
                      </div>
                      {errors.outcome ? <p className="capture-error">{errors.outcome}</p> : null}
                    </fieldset>
                  )}
                  {values.outcome === 'different_to_planned' && (
                    <div className={`capture-field ${errors.didInstead ? 'capture-field--error' : ''}`}>
                      <label htmlFor="capture-instead">What happened instead? *</label>
                      <input id="capture-instead" value={values.didInstead} onChange={(event) => setField('didInstead', event.target.value)} aria-invalid={Boolean(errors.didInstead)} />
                      {errors.didInstead ? <p className="capture-error">{errors.didInstead}</p> : null}
                    </div>
                  )}
                </section>

                {values.outreachType && visitHappened && (
                  <section className="capture-card">
                    <div className="capture-card__heading"><span>2</span><div><h2>People and place</h2><p>Select existing records to prevent duplicates.</p></div></div>
                    <div className="capture-grid capture-grid--two">
                      <SearchableSelector
                        label="ECDC"
                        options={ecdcs}
                        selectedIds={values.ecdcId ? [values.ecdcId] : []}
                        required={needsEcdc(values.outreachType)}
                        error={errors.ecdcId}
                        onChange={(ids) => { setField('ecdcId', ids[0] ?? ''); if (ids.length) setField('reviewKind', ''); }}
                        onNotFound={(name) => openReview('ecdc', name)}
                      />
                      <SearchableSelector
                        label="Practitioners"
                        options={practitioners}
                        selectedIds={values.practitionerIds}
                        multiple
                        required={needsPractitioner(values.outreachType)}
                        error={errors.practitionerIds}
                        onChange={(ids) => { setField('practitionerIds', ids); if (ids.length) setField('reviewKind', ''); }}
                        onNotFound={(name) => openReview('practitioner', name)}
                      />
                    </div>

                    {values.reviewKind && (
                      <div className="capture-review-box" role="region" aria-labelledby="capture-review-title">
                        <div><h3 id="capture-review-title">Request review: {values.reviewKind === 'ecdc' ? 'ECDC' : 'practitioner'} not found</h3><p>This saves an actionable request; it does not create a new canonical record.</p></div>
                        <div className={`capture-field ${errors.reviewName ? 'capture-field--error' : ''}`}>
                          <label htmlFor="capture-review-name">Name that could not be found *</label>
                          <input id="capture-review-name" value={values.reviewName} onChange={(event) => setField('reviewName', event.target.value)} aria-invalid={Boolean(errors.reviewName)} />
                          {errors.reviewName ? <p className="capture-error">{errors.reviewName}</p> : null}
                        </div>
                        {reviewSuggestions.length > 0 && <div className="capture-similarity"><strong>Possible existing matches:</strong>{reviewSuggestions.map((option) => <button type="button" key={option.id} onClick={() => { if (values.reviewKind === 'ecdc') setField('ecdcId', option.id); else setField('practitionerIds', [...new Set([...values.practitionerIds, option.id])]); setField('reviewKind', ''); }}>{option.name}{option.detail ? ` — ${option.detail}` : ''}</button>)}</div>}
                        <div className="capture-field"><label htmlFor="capture-review-notes">Notes for the reviewer</label><textarea id="capture-review-notes" rows={3} value={values.reviewNotes} onChange={(event) => setField('reviewNotes', event.target.value)} /></div>
                        <div className="capture-actions"><button type="button" className="capture-button capture-button--warning" onClick={() => void runReviewRequest()}>Send for review</button><button type="button" className="capture-button" onClick={() => setField('reviewKind', '')}>Cancel</button></div>
                      </div>
                    )}
                  </section>
                )}

                {isOperational && visitHappened && (
                  <section className="capture-card">
                    <div className="capture-card__heading"><span>3</span><div><h2>Transport</h2><p>Use return-trip cost and distance.</p></div></div>
                    <div className="capture-grid capture-grid--three">
                      <div className={`capture-field ${errors.transportType ? 'capture-field--error' : ''}`}><label htmlFor="capture-transport">Transport used *</label><select id="capture-transport" value={values.transportType} onChange={(event) => setField('transportType', event.target.value as CaptureFormValues['transportType'])} aria-invalid={Boolean(errors.transportType)}><option value="">Choose transport</option><option value="walked">Walked</option><option value="public">Public transport</option><option value="private">Private transport</option><option value="other">Other</option></select>{errors.transportType ? <p className="capture-error">{errors.transportType}</p> : null}</div>
                      {(values.transportType === 'public' || values.transportType === 'private') && <NumberField name="transportCost" label="Return-trip cost (R) *" value={values.transportCost} onChange={(event) => setField('transportCost', event.target.value)} error={errors.transportCost} />}
                      {values.transportType === 'private' && <NumberField name="transportKm" label="Return-trip distance (km) *" value={values.transportKm} onChange={(event) => setField('transportKm', event.target.value)} error={errors.transportKm} />}
                    </div>
                    <fieldset className={`capture-choice ${errors.publicTransportAccessible ? 'capture-field--error' : ''}`}><legend>Can this site be reached by public transport? *</legend><div className="capture-choice__options"><label><input type="radio" name="publicTransportAccessible" checked={values.publicTransportAccessible === 'yes'} onChange={() => setField('publicTransportAccessible', 'yes')} />Yes</label><label><input type="radio" name="publicTransportAccessible" checked={values.publicTransportAccessible === 'no'} onChange={() => setField('publicTransportAccessible', 'no')} />No</label></div>{errors.publicTransportAccessible ? <p className="capture-error">{errors.publicTransportAccessible}</p> : null}</fieldset>
                  </section>
                )}

                {values.outreachType && visitHappened && (
                  <section className="capture-card">
                    <div className="capture-card__heading"><span>{isOperational ? '4' : '3'}</span><div><h2>Results</h2><p>Enter only the measures relevant to this outreach.</p></div></div>
                    <div className="capture-grid capture-grid--three">
                      <NumberField name="parentsEnrolled" label="Parents enrolled" value={values.parentsEnrolled} onChange={(event) => setField('parentsEnrolled', event.target.value)} error={errors.parentsEnrolled} />
                      <NumberField name="parentsTrained" label="Parents attending" value={values.parentsTrained} onChange={(event) => setField('parentsTrained', event.target.value)} error={errors.parentsTrained} />
                      <NumberField name="peopleReached" label="People reached" value={values.peopleReached} onChange={(event) => setField('peopleReached', event.target.value)} error={errors.peopleReached} />
                      <NumberField name="childrenBooks" label="Children receiving books" value={values.childrenBooks} onChange={(event) => setField('childrenBooks', event.target.value)} error={errors.childrenBooks} />
                      <NumberField name="booksPerChild" label="Books per child" value={values.booksPerChild} onChange={(event) => setField('booksPerChild', event.target.value)} error={errors.booksPerChild} />
                      <NumberField name="booksToPractitioner" label="Books left with practitioner" value={values.booksToPractitioner} onChange={(event) => setField('booksToPractitioner', event.target.value)} error={errors.booksToPractitioner} />
                    </div>
                    <div className="capture-checks"><label><input type="checkbox" checked={values.bookdashGiven} onChange={(event) => setField('bookdashGiven', event.target.checked)} />Book Dash books given</label><label><input type="checkbox" checked={values.photosTaken} onChange={(event) => setField('photosTaken', event.target.checked)} />Photos taken (uploads come in Phase D)</label></div>
                  </section>
                )}

                <section className="capture-card">
                  <div className="capture-card__heading"><span>{isOperational && visitHappened ? '5' : '4'}</span><div><h2>Location and notes</h2><p>Location is optional unless your team requires it for this activity.</p></div></div>
                  <button type="button" className="capture-button" onClick={captureLocation}>Use current location</button>{locationMessage ? <p className="capture-location-message" role="status">{locationMessage}</p> : null}
                  <div className="capture-grid capture-grid--four">
                    <NumberField name="latitude" label="Latitude" value={values.latitude} min="-90" onChange={(event) => setField('latitude', event.target.value)} error={errors.latitude} />
                    <NumberField name="longitude" label="Longitude" value={values.longitude} min="-180" onChange={(event) => setField('longitude', event.target.value)} error={errors.longitude} />
                    <NumberField name="altitude" label="Altitude (m)" value={values.altitude} min={undefined} onChange={(event) => setField('altitude', event.target.value)} />
                    <NumberField name="accuracy" label="Accuracy (m)" value={values.accuracy} onChange={(event) => setField('accuracy', event.target.value)} error={errors.accuracy} />
                  </div>
                  <div className="capture-field"><label htmlFor="capture-comments">Comments</label><textarea id="capture-comments" rows={4} value={values.comments} onChange={(event) => setField('comments', event.target.value)} placeholder="Anything the team should know about this outreach" /></div>
                </section>

                <footer className="capture-submit-bar">
                  <div><strong>Ready to submit?</strong><span>Check the details above. Staff ownership is taken securely from your signed-in account.</span></div>
                  <button type="submit" className="capture-button capture-button--primary" disabled={optionsQuery.isLoading || Boolean(optionsQuery.error) || Boolean(values.reviewKind)}>Submit outreach</button>
                </footer>
              </fieldset>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
