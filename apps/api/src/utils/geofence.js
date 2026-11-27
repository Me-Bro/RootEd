const EARTH_M = 6371000;
// A phone's GPS fix is a circle of `accuracy` metres. Forgive some of it so an honest
// learner at the door is not refused, but cap it so a vague fix cannot pass from afar.
const MAX_TOLERANCE_M = 20;
// Beyond this the fix is too vague to say where anyone is (e.g. IP-based location).
const MAX_ACCURACY_M = 150;

const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** `{ ok, distanceM, vague }`: is the phone within the centre's radius. */
export function checkGeofence({ lat, lng, accuracy }, centre) {
  const d = distanceM({ lat, lng }, centre);
  if (accuracy > MAX_ACCURACY_M) return { ok: false, distanceM: d, vague: true };
  return {
    ok: d - Math.min(accuracy, MAX_TOLERANCE_M) <= centre.radiusM,
    distanceM: d,
    vague: false,
  };
}
