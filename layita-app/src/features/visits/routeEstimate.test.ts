import { describe, expect, it } from 'vitest';
import { estimateRoute, straightLineKm } from './routeEstimate';
describe('day route estimates', () => { it('calculates ordered straight-line distance and cost', () => { const km = straightLineKm({ latitude: -33.92, longitude: 18.42 }, { latitude: -33.93, longitude: 18.43 }); expect(km).toBeGreaterThan(1); expect(estimateRoute([{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }], 2).cost).toBeGreaterThan(200); }); });
