import { describe, expect, it } from 'vitest';
import { canonicalOutreachOutcome, canonicalOutreachType, safeCsvCell } from './reporting';
describe('outreach reporting normalization', () => {
  it('maps legacy outreach types to stable reporting categories', () => { expect(canonicalOutreachType('training')).toBe('caregiver_training'); expect(canonicalOutreachType('Update ECDC Details')).toBeNull(); });
  it('does not mistake empty Kobo alternatives for not-as-planned', () => { expect(canonicalOutreachOutcome('no', 'not applicable')).toBe('did_not_happen'); expect(canonicalOutreachOutcome('no', 'home visit')).toBe('not_as_planned'); });
  it('neutralizes spreadsheet formulas in CSV exports', () => { expect(safeCsvCell('=2+2')).toBe("\"'=2+2\""); });
});
