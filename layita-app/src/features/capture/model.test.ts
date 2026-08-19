import { describe, expect, it } from 'vitest';
import {
  buildCapturePayload,
  CAPTURE_FORM_VERSION,
  emptyCaptureValues,
  nameSimilarity,
  parseStoredDraft,
  similaritySuggestions,
  validateCapture,
} from './model';

describe('canonical website capture model', () => {
  it('enforces conditional outreach fields and attendance bounds', () => {
    const values = {
      ...emptyCaptureValues(),
      outreachType: 'practitioner_support' as const,
      outcome: 'different_to_planned' as const,
      practitionerIds: ['practitioner-1'],
      parentsEnrolled: '4',
      parentsTrained: '5',
    };

    expect(validateCapture(values)).toMatchObject({
      didInstead: expect.any(String),
      transportType: expect.any(String),
      publicTransportAccessible: expect.any(String),
      parentsTrained: expect.any(String),
    });
  });

  it('requires the correct canonical identity for mapping and practitioner work', () => {
    const mapping = { ...emptyCaptureValues(), outreachType: 'ecdc_mapping' as const, outcome: 'happened' as const, transportType: 'walked' as const, publicTransportAccessible: 'yes' as const };
    expect(validateCapture(mapping).ecdcId).toBeTruthy();

    const support = { ...mapping, outreachType: 'practitioner_support' as const, ecdcId: 'ecdc-1' };
    expect(validateCapture(support).practitionerIds).toBeTruthy();
  });

  it('builds a staff-free, multi-practitioner payload with stable retry times', () => {
    const values = {
      ...emptyCaptureValues(),
      outreachType: 'practitioner_support' as const,
      outcome: 'happened' as const,
      practitionerIds: ['primary', 'additional'],
      transportType: 'private' as const,
      transportCost: '45.50',
      transportKm: '22',
      publicTransportAccessible: 'no' as const,
    };
    const payload = buildCapturePayload(values, '2026-08-18T08:00:00.000Z', '2026-08-18T08:10:00.000Z');

    expect(payload).toMatchObject({
      visit: {
        practitioner_id: 'primary',
        transport_cost: 45.5,
        capture_ended_at: '2026-08-18T08:10:00.000Z',
      },
      practitioner_ids: ['primary', 'additional'],
    });
    expect(payload).not.toHaveProperty('staff_id');
  });

  it('rejects stale draft versions and accepts the current version', () => {
    const draft = {
      formVersion: CAPTURE_FORM_VERSION,
      captureId: 'web-fixture',
      startedAt: '2026-08-18T08:00:00.000Z',
      savedAt: '2026-08-18T08:01:00.000Z',
      values: emptyCaptureValues(),
    };
    expect(parseStoredDraft(JSON.stringify(draft))?.captureId).toBe('web-fixture');
    expect(parseStoredDraft(JSON.stringify({ ...draft, formVersion: 'capture-v0' }))).toBeNull();
  });

  it('warns about likely duplicate names without depending on a server round trip', () => {
    expect(nameSimilarity('Masakhane ECDC', 'Masakhane E.C.D.C.')).toBeGreaterThan(.7);
    expect(similaritySuggestions('Masakhne ECDC', [
      { id: '1', name: 'Masakhane ECDC' },
      { id: '2', name: 'Sakhisizwe Centre' },
    ])).toEqual([expect.objectContaining({ id: '1' })]);
  });
});
