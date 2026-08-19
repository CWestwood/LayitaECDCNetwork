import { describe, expect, it } from 'vitest';
import { hasCapability, normalizeRole } from './capabilities';
import { ROUTE_ACCESS } from '../../routes/routeAccess';

describe('role capabilities and protected routes', () => {
  it('normalizes supported roles only', () => {
    expect(normalizeRole(' Administrator ')).toBe('administrator');
    expect(normalizeRole('STAFF')).toBeNull();
    expect(normalizeRole(null)).toBeNull();
  });

  it('keeps administrator-only routes restricted', () => {
    for (const key of ['planning', 'users', 'deleted', 'koboMonitor'] as const) {
      const requirement = ROUTE_ACCESS[key];
      expect(hasCapability('administrator', requirement.capability)).toBe(true);
      expect(hasCapability('manager', requirement.capability)).toBe(false);
      expect(hasCapability('datacapturer', requirement.capability)).toBe(false);
      expect(hasCapability('library', requirement.capability)).toBe(false);
    }
  });

  it('allows managers to review quality and manage their own work', () => {
    expect(hasCapability('manager', ROUTE_ACCESS.quality.capability)).toBe(true);
    expect(hasCapability('manager', ROUTE_ACCESS.audit.capability)).toBe(true);
    expect(hasCapability('manager', ROUTE_ACCESS.myWork.capability)).toBe(true);
    expect(hasCapability('manager', ROUTE_ACCESS.training.capability)).toBe(true);
    expect(hasCapability('datacapturer', ROUTE_ACCESS.training.capability)).toBe(false);
  });

  it('limits data capturers and library users to their intended routes', () => {
    expect(hasCapability('datacapturer', ROUTE_ACCESS.myWork.capability)).toBe(true);
    expect(hasCapability('datacapturer', ROUTE_ACCESS.capture.capability)).toBe(true);
    expect(hasCapability('datacapturer', ROUTE_ACCESS.quality.capability)).toBe(false);
    expect(hasCapability('library', ROUTE_ACCESS.myWork.capability)).toBe(false);
    expect(hasCapability('library', ROUTE_ACCESS.capture.capability)).toBe(false);
  });

  it('allows every capture-authorized operational role into the website form', () => {
    expect(hasCapability('administrator', ROUTE_ACCESS.capture.capability)).toBe(true);
    expect(hasCapability('manager', ROUTE_ACCESS.capture.capability)).toBe(true);
  });
});
