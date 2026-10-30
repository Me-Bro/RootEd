export function buildHiEnResource(en, hi) {
  if (en && typeof en === 'object' && !Array.isArray(en)) {
    const out = {};
    for (const key of Object.keys(en)) {
      out[key] = buildHiEnResource(en[key], hi?.[key]);
    }
    return out;
  }
  if (typeof en === 'string' && typeof hi === 'string' && hi.length > 0) {
    return `${hi} / ${en}`;
  }
  return en;
}
