import { unescapeText } from '@rooted/shared/utils';

const ADDRESS_KEYS = ['line1', 'line2', 'city', 'state', 'pincode', 'country'];
const TEXT_KEYS = ['description', 'phone', 'email', 'website', 'registrationNumber'];

export const EMPTY_PROFILE_FORM = Object.fromEntries(
  [...TEXT_KEYS, ...ADDRESS_KEYS].map((k) => [k, ''])
);

/** The edit form's flat state from what GET /tenant/settings returned. */
export function profileToForm(profile) {
  const form = { ...EMPTY_PROFILE_FORM };
  for (const key of TEXT_KEYS) form[key] = unescapeText(profile?.[key] ?? '');
  for (const key of ADDRESS_KEYS) form[key] = unescapeText(profile?.address?.[key] ?? '');
  return form;
}

/**
 * The PATCH body. Every key is sent, '' included: the API writes key by key and
 * treats '' as "clear this", so a field the user emptied really is emptied.
 * The registration number is sent only by someone who was shown it; otherwise
 * saving would blank a value the viewer never saw.
 */
export function formToPayload(form, { admin = true } = {}) {
  const trim = (v) => String(v ?? '').trim();
  const payload = {
    description: trim(form.description),
    phone: trim(form.phone),
    email: trim(form.email),
    website: trim(form.website),
    address: Object.fromEntries(ADDRESS_KEYS.map((k) => [k, trim(form[k])])),
  };
  if (admin) payload.registrationNumber = trim(form.registrationNumber);
  return payload;
}

/** True when there is anything to show: drives the "complete your profile" empty state. */
export function hasProfileContent(profile) {
  if (!profile) return false;
  const { address, ...rest } = profile;
  return (
    Object.values(rest).some((v) => Boolean(v)) ||
    Object.values(address ?? {}).some((v) => Boolean(v))
  );
}
