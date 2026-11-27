import { describe, expect, test } from '@jest/globals';
import { checkGeofence, distanceM } from '../utils/geofence.js';

const centre = { lat: 28.6139, lng: 77.209, radiusM: 50 };
// 0.0001 degrees of latitude is about 11.1 m.
const north = (metres) => ({ lat: centre.lat + metres / 111195, lng: centre.lng });

describe('distanceM', () => {
  test('same point is zero, 1 degree of latitude is about 111 km', () => {
    expect(distanceM(centre, centre)).toBe(0);
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(111000);
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(111400);
  });
});

describe('checkGeofence', () => {
  test('inside the radius passes', () => {
    expect(checkGeofence({ ...north(30), accuracy: 5 }, centre).ok).toBe(true);
  });

  test('outside the radius fails and reports the distance', () => {
    const r = checkGeofence({ ...north(200), accuracy: 5 }, centre);
    expect(r.ok).toBe(false);
    expect(Math.round(r.distanceM)).toBeCloseTo(200, -1);
  });

  test('forgives some GPS error, but only up to a cap', () => {
    // 65 m away with a 20 m fix: 45 m after forgiveness, inside 50.
    expect(checkGeofence({ ...north(65), accuracy: 20 }, centre).ok).toBe(true);
    // 100 m away claiming 100 m accuracy: forgiveness is capped at 20 m, still out.
    expect(checkGeofence({ ...north(100), accuracy: 100 }, centre).ok).toBe(false);
  });

  test('a fix too vague to trust is refused even at the centre', () => {
    const r = checkGeofence({ ...centre, accuracy: 5000 }, centre);
    expect(r).toMatchObject({ ok: false, vague: true });
  });
});
