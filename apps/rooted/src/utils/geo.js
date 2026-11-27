/** `granted` | `prompt` | `denied` | `unknown` (no Permissions API, e.g. older Safari). */
export async function locationState() {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return 'unknown';
  }
}

const getPosition = (options) =>
  new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ coords: position.coords }),
      (err) => resolve({ error: err.code === 1 ? 'denied' : 'unavailable' }),
      { maximumAge: 0, ...options }
    );
  });

/**
 * The phone's position as `{ coords }`, or `{ error: 'denied' | 'unavailable' }`; it
 * never rejects. Precise GPS first. Indoors it often times out, so a coarser fix
 * (wifi / cell) is tried once before giving up; the server still refuses one that is
 * too vague. Call it from a tap so the browser's permission prompt is allowed to show.
 */
export async function requestLocation() {
  if (!navigator.geolocation) return { error: 'unavailable' };
  const precise = await getPosition({ enableHighAccuracy: true, timeout: 10000 });
  if (precise.coords || precise.error === 'denied') return precise;
  return getPosition({ enableHighAccuracy: false, timeout: 20000 });
}
