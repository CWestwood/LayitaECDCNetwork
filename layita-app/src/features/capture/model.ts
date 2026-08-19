import type { Json } from '../../types/database.generated';

export const CAPTURE_FORM_VERSION = 'capture-v1';

export type OutreachType =
  | 'caregiver_training'
  | 'literacy_promotion'
  | 'practitioner_support'
  | 'ecdc_mapping'
  | 'interested_practitioner'
  | 'ecdc_update'
  | 'other';

export type OutreachOutcome = 'happened' | 'different_to_planned' | 'did_not_happen';
export type CaptureState = 'draft' | 'submitting' | 'submitted' | 'failed' | 'needs_review';
export type IdentityKind = 'ecdc' | 'practitioner';

export interface CaptureFormValues {
  date: string;
  outreachType: OutreachType | '';
  outcome: OutreachOutcome | '';
  didInstead: string;
  ecdcId: string;
  practitionerIds: string[];
  transportType: '' | 'walked' | 'public' | 'private' | 'other';
  transportCost: string;
  transportKm: string;
  publicTransportAccessible: '' | 'yes' | 'no';
  parentsEnrolled: string;
  parentsTrained: string;
  childrenBooks: string;
  booksPerChild: string;
  booksToPractitioner: string;
  peopleReached: string;
  bookdashGiven: boolean;
  photosTaken: boolean;
  latitude: string;
  longitude: string;
  altitude: string;
  accuracy: string;
  comments: string;
  reviewKind: IdentityKind | '';
  reviewName: string;
  reviewNotes: string;
}

export interface CaptureResult {
  success: boolean;
  duplicate?: boolean;
  visit_id?: string;
  ecdc_id?: string | null;
  practitioner_id?: string | null;
  code?: string;
}

export interface StoredDraft {
  formVersion: typeof CAPTURE_FORM_VERSION;
  captureId: string;
  startedAt: string;
  completedAt?: string;
  savedAt: string;
  values: CaptureFormValues;
  state?: Extract<CaptureState, 'draft' | 'failed' | 'needs_review'>;
  reviewRequestId?: string;
}

export interface NamedOption {
  id: string;
  name: string;
  detail?: string;
}

const operationalTypes = new Set<OutreachType>([
  'caregiver_training',
  'literacy_promotion',
  'practitioner_support',
  'ecdc_mapping',
  'other',
]);

const practitionerTypes = new Set<OutreachType>([
  'caregiver_training',
  'literacy_promotion',
  'practitioner_support',
  'interested_practitioner',
]);

const ecdcTypes = new Set<OutreachType>(['ecdc_mapping', 'ecdc_update']);

export function newCaptureId() {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `web-${id}`;
}

export function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function emptyCaptureValues(): CaptureFormValues {
  return {
    date: todayLocal(),
    outreachType: '',
    outcome: '',
    didInstead: '',
    ecdcId: '',
    practitionerIds: [],
    transportType: '',
    transportCost: '',
    transportKm: '',
    publicTransportAccessible: '',
    parentsEnrolled: '',
    parentsTrained: '',
    childrenBooks: '',
    booksPerChild: '',
    booksToPractitioner: '',
    peopleReached: '',
    bookdashGiven: false,
    photosTaken: false,
    latitude: '',
    longitude: '',
    altitude: '',
    accuracy: '',
    comments: '',
    reviewKind: '',
    reviewName: '',
    reviewNotes: '',
  };
}

export function needsOutcome(type: CaptureFormValues['outreachType']) {
  return type !== '' && operationalTypes.has(type);
}

export function happened(values: CaptureFormValues) {
  return !needsOutcome(values.outreachType) || values.outcome !== 'did_not_happen';
}

export function needsPractitioner(type: CaptureFormValues['outreachType']) {
  return type !== '' && practitionerTypes.has(type);
}

export function needsEcdc(type: CaptureFormValues['outreachType']) {
  return type !== '' && ecdcTypes.has(type);
}

function numeric(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireNonNegative(
  errors: Partial<Record<keyof CaptureFormValues, string>>,
  key: keyof CaptureFormValues,
  value: string,
  label: string,
) {
  if (!value.trim()) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) errors[key] = `${label} must be zero or more.`;
}

export function validateCapture(values: CaptureFormValues) {
  const errors: Partial<Record<keyof CaptureFormValues, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.date = 'Choose the outreach date.';
  if (!values.outreachType) errors.outreachType = 'Choose the outreach activity.';
  if (needsOutcome(values.outreachType) && !values.outcome) errors.outcome = 'Choose what happened.';
  if (values.outcome === 'different_to_planned' && !values.didInstead.trim()) {
    errors.didInstead = 'Describe what happened instead.';
  }

  if (happened(values)) {
    if (needsPractitioner(values.outreachType) && values.practitionerIds.length === 0) {
      errors.practitionerIds = 'Choose at least one practitioner or request a review.';
    }
    if (needsEcdc(values.outreachType) && !values.ecdcId) {
      errors.ecdcId = 'Choose an ECDC or request a review.';
    }
    if (needsOutcome(values.outreachType) && !values.transportType) {
      errors.transportType = 'Choose the transport used.';
    }
    if ((values.transportType === 'public' || values.transportType === 'private') && !values.transportCost.trim()) {
      errors.transportCost = 'Enter the return-trip cost.';
    }
    if (values.transportType === 'private' && !values.transportKm.trim()) {
      errors.transportKm = 'Enter the return-trip distance.';
    }
    if (needsOutcome(values.outreachType) && !values.publicTransportAccessible) {
      errors.publicTransportAccessible = 'Choose whether public transport reaches the site.';
    }
  }

  const nonNegative: Array<[keyof CaptureFormValues, string, string]> = [
    ['transportCost', values.transportCost, 'Transport cost'],
    ['transportKm', values.transportKm, 'Distance'],
    ['parentsEnrolled', values.parentsEnrolled, 'Parents enrolled'],
    ['parentsTrained', values.parentsTrained, 'Parents attending'],
    ['childrenBooks', values.childrenBooks, 'Children receiving books'],
    ['booksPerChild', values.booksPerChild, 'Books per child'],
    ['booksToPractitioner', values.booksToPractitioner, 'Books for practitioners'],
    ['peopleReached', values.peopleReached, 'People reached'],
    ['accuracy', values.accuracy, 'Location accuracy'],
  ];
  nonNegative.forEach(([key, value, label]) => requireNonNegative(errors, key, value, label));
  const wholeNumberFields: Array<[keyof CaptureFormValues, string, string]> = [
    ['parentsEnrolled', values.parentsEnrolled, 'Parents enrolled'],
    ['parentsTrained', values.parentsTrained, 'Parents attending'],
    ['childrenBooks', values.childrenBooks, 'Children receiving books'],
    ['booksPerChild', values.booksPerChild, 'Books per child'],
    ['booksToPractitioner', values.booksToPractitioner, 'Books for practitioners'],
    ['peopleReached', values.peopleReached, 'People reached'],
  ];
  wholeNumberFields.forEach(([key, value, label]) => {
    if (value.trim() && Number.isFinite(Number(value)) && !Number.isInteger(Number(value))) {
      errors[key] = `${label} must be a whole number.`;
    }
  });

  const enrolled = numeric(values.parentsEnrolled);
  const trained = numeric(values.parentsTrained);
  if (enrolled !== null && trained !== null && trained > enrolled) {
    errors.parentsTrained = 'Parents attending cannot exceed parents enrolled.';
  }

  const latitude = numeric(values.latitude);
  const longitude = numeric(values.longitude);
  if ((values.latitude.trim() && latitude === null) || (latitude !== null && (latitude < -90 || latitude > 90))) {
    errors.latitude = 'Latitude must be between -90 and 90.';
  }
  if ((values.longitude.trim() && longitude === null) || (longitude !== null && (longitude < -180 || longitude > 180))) {
    errors.longitude = 'Longitude must be between -180 and 180.';
  }
  if ((values.latitude.trim() && !values.longitude.trim()) || (!values.latitude.trim() && values.longitude.trim())) {
    errors.longitude = errors.longitude ?? 'Enter both latitude and longitude.';
  }
  return errors;
}

export function buildCapturePayload(values: CaptureFormValues, startedAt: string, completedAt = new Date().toISOString()): Json {
  const primaryPractitionerId = values.practitionerIds[0] ?? null;
  return {
    visit: {
      date: values.date,
      outreach_type: values.outreachType,
      outreach_happened: values.outcome || null,
      did_instead: values.didInstead.trim() || null,
      comments: values.comments.trim() || null,
      transport_type: values.transportType || null,
      transport_cost: numeric(values.transportCost),
      transport_km: numeric(values.transportKm),
      practitioner_id: primaryPractitionerId,
      parents_enrolled: numeric(values.parentsEnrolled),
      parents_trained: numeric(values.parentsTrained),
      children_books: numeric(values.childrenBooks),
      books_per_child: numeric(values.booksPerChild),
      books_to_practitioner: numeric(values.booksToPractitioner),
      photos_taken: values.photosTaken,
      people_reached: numeric(values.peopleReached),
      capture_started_at: startedAt,
      capture_ended_at: completedAt,
      public_transport_accessible: values.publicTransportAccessible === ''
        ? null
        : values.publicTransportAccessible === 'yes',
      bookdash_given: values.bookdashGiven,
      captured_latitude: numeric(values.latitude),
      captured_longitude: numeric(values.longitude),
      captured_altitude_m: numeric(values.altitude),
      captured_accuracy_m: numeric(values.accuracy),
    },
    ecdc: { id: values.ecdcId || null, values: {} },
    practitioner: { id: primaryPractitionerId, values: {}, training: {} },
    practitioner_ids: values.practitionerIds,
    attachments: [],
  };
}

export function parseStoredDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Partial<StoredDraft>;
    if (
      draft.formVersion !== CAPTURE_FORM_VERSION
      || typeof draft.captureId !== 'string'
      || typeof draft.startedAt !== 'string'
      || typeof draft.savedAt !== 'string'
      || !draft.values
      || !Array.isArray(draft.values.practitionerIds)
    ) return null;
    return draft as StoredDraft;
  } catch {
    return null;
  }
}

function normalizedName(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

export function nameSimilarity(left: string, right: string) {
  const a = normalizedName(left);
  const b = normalizedName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const aWords = new Set(a.split(' '));
  const bWords = new Set(b.split(' '));
  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  const tokenScore = intersection / new Set([...aWords, ...bWords]).size;
  return Math.max(editScore, tokenScore);
}

export function similaritySuggestions(query: string, options: NamedOption[], limit = 3) {
  if (normalizedName(query).length < 3) return [];
  return options
    .map((option) => ({ ...option, similarity: nameSimilarity(query, option.name) }))
    .filter((option) => option.similarity >= 0.62)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function captureErrorMessage(code: string | undefined) {
  const messages: Record<string, string> = {
    CAPTURE_NOT_ALLOWED: 'Your account is not linked to an active staff record for data capture.',
    INVALID_CAPTURE: 'The capture could not be read. Start a new draft and try again.',
    INVALID_VISIT: 'The outreach date or activity is invalid.',
    INVALID_OUTCOME: 'Choose a valid outreach outcome.',
    ALTERNATIVE_ACTIVITY_REQUIRED: 'Describe what happened instead.',
    ATTENDANCE_EXCEEDS_ENROLMENT: 'Parents attending cannot exceed parents enrolled.',
    INVALID_COORDINATES: 'The captured location is outside the valid range.',
    CAPTURE_ID_CONFLICT: 'This reference was already used with different details. Start a new draft.',
  };
  return messages[code ?? ''] ?? `The capture was rejected${code ? ` (${code})` : ''}.`;
}
