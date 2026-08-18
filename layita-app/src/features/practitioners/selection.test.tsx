import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import Practitioners from './index';
import type { Practitioner } from './types';

const practitioners: Practitioner[] = [
  {
    id: 'practitioner-1',
    name: 'Alice Example',
    contact_number1: '0710000001',
    contact_number2: null,
    has_whatsapp: true,
    status: 'active',
    mapping_comments: null,
    dsd_funded: false,
    dsd_registered: true,
    group: { id: 'group-1', group_name: 'Group One' },
    ecdc: { id: 'ecdc-1', name: 'Centre One', area: 'Area One' },
    training: null,
  },
  {
    id: 'practitioner-2',
    name: 'Brenda Example',
    contact_number1: null,
    contact_number2: null,
    has_whatsapp: false,
    status: 'active',
    mapping_comments: null,
    dsd_funded: false,
    dsd_registered: false,
    group: { id: 'group-2', group_name: 'Group Two' },
    ecdc: { id: 'ecdc-2', name: 'Centre Two', area: 'Area Two' },
    training: null,
  },
];

vi.mock('./api/usePractitioners', () => ({
  usePractitioners: () => ({ data: practitioners, isLoading: false }),
  useGlobalVisitStats: () => ({
    data: [{ practitioner_id: 'practitioner-1', date: '2026-08-01', outreach_type: 'support' }],
    isLoading: false,
  }),
}));

vi.mock('./DetailPanel', () => ({
  DetailPanel: () => <div>Practitioner details</div>,
  DetailEmpty: () => <div>No practitioner selected</div>,
}));

describe('practitioner bulk selection', () => {
  it('selects the current filtered results and exposes Excel and PDF reports', () => {
    render(
      <MemoryRouter initialEntries={['/practitioners']}>
        <Practitioners />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('dialog', { name: 'Selected practitioner export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close export report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.change(screen.getByPlaceholderText(/Search name, ECDC, group/), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select all (1)' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});
