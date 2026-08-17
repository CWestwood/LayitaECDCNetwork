import type { VisitRow } from './api/useVisits';

export const OUTREACH_TYPES = ['caregiver_training', 'literacy_promotion', 'practitioner_support', 'ecdc_mapping', 'other'] as const;
export const OUTREACH_OUTCOMES = ['happened', 'different_to_planned', 'did_not_happen'] as const;
const OUTCOME_LABELS: Record<(typeof OUTREACH_OUTCOMES)[number], string> = {
  happened: 'Happened',
  different_to_planned: 'Different to planned',
  did_not_happen: 'Did not happen',
};

const key = (value: string | null | undefined) => (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
export function canonicalOutreachType(value: string | null | undefined): string | null {
  const normalized = key(value);
  if (['outreach', 'training', 'caregiver_training', 'caregivertraining'].includes(normalized)) return 'caregiver_training';
  if (['literacy', 'literacy_promotion'].includes(normalized)) return 'literacy_promotion';
  if (['support', 'support_visit', 'practitioner_support'].includes(normalized)) return 'practitioner_support';
  if (['mapping', 'ecdc_mapping', 'baseline', 'full_audit'].includes(normalized)) return 'ecdc_mapping';
  return normalized === 'other' ? 'other' : null;
}
export function canonicalOutreachOutcome(happened: string | null | undefined, didInstead: string | null | undefined) {
  const happenedKey = key(happened); const insteadKey = key(didInstead);
  if (['yes', 'true', 'happened', 'completed'].includes(happenedKey)) return 'happened';
  if (['else', 'no_but_i_did_something_else', 'different_to_planned', 'not_as_planned'].includes(happenedKey) || !['', 'none', 'no', 'n_a', 'na', 'not_applicable'].includes(insteadKey)) return 'different_to_planned';
  return 'did_not_happen';
}
export function reportedOutreachType(outreachType: string | null | undefined, happened: string | null | undefined, didInstead: string | null | undefined) {
  if (canonicalOutreachOutcome(happened, didInstead) === 'different_to_planned') {
    return canonicalOutreachType(didInstead) ?? didInstead?.trim() ?? canonicalOutreachType(outreachType);
  }
  return canonicalOutreachType(outreachType);
}
export function outreachOutcomeLabel(happened: string | null | undefined, didInstead: string | null | undefined) {
  return OUTCOME_LABELS[canonicalOutreachOutcome(happened, didInstead)];
}
export function outcomeCodeLabel(code: (typeof OUTREACH_OUTCOMES)[number]) { return OUTCOME_LABELS[code]; }
export function participantNames(visit: VisitRow) {
  const names = visit.participants.map((row) => row.practitioner?.name).filter((name): name is string => Boolean(name));
  return names.length ? names : visit.practitioner?.name ? [visit.practitioner.name] : [];
}
export function safeCsvCell(value: unknown) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function downloadVisitCsv(visits: VisitRow[]) {
  const header = ['Date','Practitioners','ECDC','Area','Staff','Type','Outcome','Parents enrolled','Parents attending','Attendance rate','Children receiving books','Books to children','Books left with practitioner','Transport','Distance km','Cost','Notes'];
  const rows = visits.map((visit) => [visit.date, participantNames(visit).join('; '), visit.practitioner?.ecdc?.name, visit.practitioner?.ecdc?.area, visit.data_capturer?.name, reportedOutreachType(visit.outreach_type, visit.outreach_happened, visit.did_instead), canonicalOutreachOutcome(visit.outreach_happened, visit.did_instead), visit.parents_enrolled, visit.parents_attending, visit.attendance_rate_percent, visit.children_receiving_books, visit.books_distributed_to_children, visit.books_left_with_practitioner, visit.transport_type, visit.transport_km, visit.transport_cost, visit.comments]);
  const blob = new Blob([[header, ...rows].map((row) => row.map(safeCsvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `outreach-report-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
}
