// The legend the report card has always printed; kept as the default so a school
// that never opens the settings page sees no change.
export const DEFAULT_GRADING_LEGEND =
  'Grading Scale:  A 90-100  ·  B 80-89  ·  C 70-79  ·  D 60-69  ·  F Below 60';

// Report card settings with every default filled in, so the worker never has to
// know what an unsaved value means. Blank text falls back to the default.
export function resolveReportCardConfig(tenant) {
  const saved = tenant?.settings?.reportCard ?? {};
  return {
    preset: saved.preset ?? 'classic',
    accentColor: saved.accentColor ?? '#000000',
    logoKey: saved.logoKey ?? null,
    schoolName: saved.schoolName || tenant?.name || 'Report Card',
    subtitle: saved.subtitle || null,
    footerText: saved.footerText || null,
    signatories: [
      ...(saved.signatories?.length ? saved.signatories : ['Class Teacher', 'Principal']),
    ],
    gradingLegend: saved.gradingLegend || DEFAULT_GRADING_LEGEND,
    showRank: saved.showRank ?? true,
    showAttendance: saved.showAttendance ?? true,
  };
}
