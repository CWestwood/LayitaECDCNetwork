import type { Capability } from '../features/auth/capabilities';

export const ROUTE_ACCESS = {
  myWork: { path: '/my-work', capability: 'manage_own_work' },
  planning: { path: '/outreach-planning', capability: 'manage_plans' },
  users: { path: '/users', capability: 'manage_users' },
  deleted: { path: '/deleted', capability: 'restore_records' },
  quality: { path: '/data-quality', capability: 'view_quality' },
  audit: { path: '/audit', capability: 'view_quality' },
  koboMonitor: { path: '/kobo-monitor', capability: 'reprocess_kobo' },
} as const satisfies Record<string, { path: string; capability: Capability }>;
