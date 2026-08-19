import type { Capability } from '../features/auth/capabilities';

export const ROUTE_ACCESS = {
  capture: { path: '/capture', capability: 'submit_capture' },
  myWork: { path: '/my-work', capability: 'manage_own_work' },
  planning: { path: '/outreach-planning', capability: 'manage_plans' },
  training: { path: '/training', capability: 'manage_training' },
  users: { path: '/users', capability: 'manage_users' },
  deleted: { path: '/deleted', capability: 'restore_records' },
  quality: { path: '/data-quality', capability: 'view_quality' },
  audit: { path: '/audit', capability: 'view_quality' },
  koboMonitor: { path: '/kobo-monitor', capability: 'reprocess_kobo' },
} as const satisfies Record<string, { path: string; capability: Capability }>;
