export const REPORT_CARD_PRESETS = ['classic', 'modern', 'compact'];
export const LOGO_MAX_BYTES = 500 * 1024;

// What the form shows for an organization that has saved nothing. Blank text
// means "use the built-in default" (the school's own name, the standard legend).
export const REPORT_CARD_DEFAULTS = {
  preset: 'classic',
  accentColor: '#000000',
  schoolName: '',
  subtitle: '',
  footerText: '',
  signatories: ['Class Teacher', 'Principal'],
  gradingLegend: '',
  showRank: true,
  showAttendance: true,
};

const KEYS = Object.keys(REPORT_CARD_DEFAULTS);

// Defaults, then what the server saved, then what is being typed. logoKey and any
// other saved key are left out: the form neither edits nor sends them.
export function resolveForm(saved, edits) {
  const form = { ...REPORT_CARD_DEFAULTS, signatories: [...REPORT_CARD_DEFAULTS.signatories] };
  for (const key of KEYS) {
    if (saved && saved[key] !== undefined) form[key] = saved[key];
    if (edits && edits[key] !== undefined) form[key] = edits[key];
  }
  form.signatories = [...form.signatories];
  return form;
}

// The PATCH body. At most three signatories survive and blank ones are dropped;
// with none left there is nothing to print under the card, so it cannot be saved.
export function buildPayload(form) {
  const signatories = form.signatories
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (signatories.length === 0) return { ok: false, field: 'signatories' };
  return {
    ok: true,
    payload: {
      preset: form.preset,
      accentColor: form.accentColor,
      schoolName: form.schoolName.trim(),
      subtitle: form.subtitle.trim(),
      footerText: form.footerText.trim(),
      signatories,
      gradingLegend: form.gradingLegend.trim(),
      showRank: Boolean(form.showRank),
      showAttendance: Boolean(form.showAttendance),
    },
  };
}

// Mirrors the server's limits so a bad file is refused before it is sent.
export function checkLogoFile(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) return 'type';
  if (file.size > LOGO_MAX_BYTES) return 'size';
  return null;
}
