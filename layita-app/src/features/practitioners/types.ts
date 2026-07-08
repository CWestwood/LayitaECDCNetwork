// src/features/practitioners/types.ts
// ─── Shared types inferred from the Supabase query shape ─────────────────────

export interface Practitioner {
  id: string;
  name: string | null;
  contact_number1: string | null;
  contact_number2: string | null;
  has_whatsapp: boolean | null;
  dsd_funded: boolean | null;
  dsd_registered: boolean | null;
  group: { group_name: string } | null;
  ecdc: {
    id: string;
    name: string;
    area: string | null;
    chief?: string | null;
    headman?: string | null;
    number_children?: string | null;
    attendance_updated?: string | null;
    created_at?: string | null;
  } | null;
  training: Record<string, boolean> | null;
}

export interface OutreachVisit {
  id: string;
  date: string | null;
  outreach_type: string | null;
  outreach_happened: string | null;
  transport_type: string | null;
  transport_cost: number | null;
  transport_km: number | null;
  parents_trained: number | null;
  children_books: number | null;
  comments: string | null;
}

export interface GlobalVisitStat {
  practitioner_id: string;
  date: string | null;
  outreach_type: string | null;
}

