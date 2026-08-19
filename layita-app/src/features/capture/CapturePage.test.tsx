import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_FORM_VERSION, emptyCaptureValues } from './model';
import CapturePage from './index';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'fixture-user' } } as unknown as Session | null,
  submit: vi.fn(),
  review: vi.fn(),
}));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'fixture-user', name: 'Fixture', role: 'datacapturer', layitaStaffId: 'staff-1' },
    session: mocks.session,
  }),
}));

vi.mock('./api', () => ({
  useCaptureOptions: () => ({
    data: {
      ecdcs: [{ id: 'ecdc-1', name: 'Masakhane ECDC', detail: 'Village A' }],
      practitioners: [{ id: 'practitioner-1', name: 'Jane Doe', detail: 'Masakhane ECDC' }],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSubmitCapture: () => ({ mutateAsync: mocks.submit }),
  useRequestIdentityReview: () => ({ mutateAsync: mocks.review }),
}));

function storeDraft(overrides: Partial<ReturnType<typeof emptyCaptureValues>> = {}) {
  const values = {
    ...emptyCaptureValues(),
    outreachType: 'practitioner_support' as const,
    outcome: 'happened' as const,
    practitionerIds: ['practitioner-1'],
    transportType: 'walked' as const,
    publicTransportAccessible: 'yes' as const,
    ...overrides,
  };
  localStorage.setItem('layita-capture-draft:fixture-user', JSON.stringify({
    formVersion: CAPTURE_FORM_VERSION,
    captureId: 'web-fixed-reference',
    startedAt: '2026-08-18T08:00:00.000Z',
    completedAt: '2026-08-18T08:10:00.000Z',
    savedAt: '2026-08-18T08:05:00.000Z',
    values,
    state: 'draft',
  }));
}

describe('authenticated website capture page', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.session = { user: { id: 'fixture-user' } } as unknown as Session;
    mocks.submit.mockReset().mockResolvedValue({ success: true, duplicate: false, visit_id: 'visit-1' });
    mocks.review.mockReset().mockResolvedValue('review-1');
  });

  it('recovers a versioned browser draft with its immutable reference', () => {
    storeDraft({ comments: 'Recovered note' });
    render(<CapturePage />);
    expect(screen.getByText('Recovered the draft saved on this device.')).toBeInTheDocument();
    expect(screen.getByText('web-fixed-reference')).toBeInTheDocument();
    expect(screen.getByLabelText('Comments')).toHaveValue('Recovered note');
  });

  it('shows conditional validation with labelled, focusable fields', async () => {
    render(<CapturePage />);
    fireEvent.change(screen.getByLabelText('Activity *'), { target: { value: 'practitioner_support' } });
    expect(screen.getByText('Did it happen as planned? *')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit outreach' }));
    expect(await screen.findByText('Choose what happened.')).toBeInTheDocument();
    expect(screen.getByLabelText('Activity *')).toHaveAttribute('aria-invalid', 'false');
  });

  it('prevents double submission and reports the canonical visit', async () => {
    storeDraft();
    let finish: ((value: unknown) => void) | undefined;
    mocks.submit.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<CapturePage />);
    const submit = screen.getByRole('button', { name: 'Submit outreach' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    finish?.({ success: true, duplicate: false, visit_id: 'visit-1' });
    expect(await screen.findByText('Outreach submitted')).toBeInTheDocument();
    expect(screen.getByText('visit-1')).toBeInTheDocument();
  });

  it('keeps the draft safe when the session has expired', async () => {
    storeDraft();
    mocks.session = null;
    render(<CapturePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit outreach' }));
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(localStorage.getItem('layita-capture-draft:fixture-user')).toBeTruthy();
  });

  it('stores an unknown identity as an actionable review request', async () => {
    storeDraft({ reviewKind: 'practitioner', reviewName: 'Unknown Person' });
    render(<CapturePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({
      captureId: 'web-fixed-reference',
      kind: 'practitioner',
      name: 'Unknown Person',
    })));
    expect(await screen.findByText('Identity review requested')).toBeInTheDocument();
    expect(screen.getByText('review-1')).toBeInTheDocument();
  });
});
