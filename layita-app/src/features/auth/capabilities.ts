export type AppRole = 'administrator' | 'manager' | 'datacapturer' | 'library';

export type Capability =
  | 'manage_own_work'
  | 'submit_capture'
  | 'view_quality'
  | 'reprocess_kobo'
  | 'manage_plans'
  | 'manage_training'
  | 'restore_records'
  | 'manage_users';

const ROLE_CAPABILITIES: Record<AppRole, ReadonlySet<Capability>> = {
  administrator: new Set([
    'submit_capture',
    'view_quality',
    'reprocess_kobo',
    'manage_plans',
    'manage_training',
    'restore_records',
    'manage_users',
  ]),
  manager: new Set(['manage_own_work', 'submit_capture', 'view_quality', 'manage_training']),
  datacapturer: new Set(['manage_own_work', 'submit_capture']),
  library: new Set(),
};

export function normalizeRole(value: string | null | undefined): AppRole | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'administrator'
    || normalized === 'manager'
    || normalized === 'datacapturer'
    || normalized === 'library'
  ) {
    return normalized;
  }
  return null;
}

export function hasCapability(
  role: AppRole | null | undefined,
  capability: Capability,
): boolean {
  return role ? ROLE_CAPABILITIES[role].has(capability) : false;
}
