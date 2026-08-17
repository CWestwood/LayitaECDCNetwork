import { describe, expect, it } from 'vitest';
import { canonicalOutreachOutcome, canonicalOutreachType, reportedOutreachType, safeCsvCell } from './reporting';
describe('outreach reporting normalization', () => {
  it('maps legacy outreach types to stable reporting categories', () => { expect(canonicalOutreachType('training')).toBe('caregiver_training'); expect(canonicalOutreachType('ECDC Mapping')).toBe('ecdc_mapping'); expect(canonicalOutreachType('Update ECDC Details')).toBeNull(); });
  it('classifies Kobo alternatives and reports the activity done instead', () => { expect(canonicalOutreachOutcome('no', 'not applicable')).toBe('did_not_happen'); expect(canonicalOutreachOutcome('No, but I did something else', 'Literacy Promotion')).toBe('different_to_planned'); expect(canonicalOutreachOutcome('else', 'support')).toBe('different_to_planned'); expect(reportedOutreachType('caregiver_training', 'else', 'literacy_promotion')).toBe('literacy_promotion'); });
  it('neutralizes spreadsheet formulas in CSV exports', () => { expect(safeCsvCell('=2+2')).toBe("\"'=2+2\""); });
});
