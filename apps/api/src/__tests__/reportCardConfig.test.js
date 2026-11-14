import { REPORT_CARD_PRESETS } from '@rooted/shared/constants';
import { reportCardSettingsSchema, reportCardPreviewSchema } from '@rooted/shared/schemas';
import { resolveReportCardConfig, DEFAULT_GRADING_LEGEND } from '../utils/reportCardConfig.js';

describe('REPORT_CARD_PRESETS', () => {
  test('lists the three presets, classic first', () => {
    expect(REPORT_CARD_PRESETS).toEqual(['classic', 'modern', 'compact']);
  });
});

describe('reportCardSettingsSchema', () => {
  test('accepts a full valid config', () => {
    const input = {
      preset: 'modern',
      accentColor: '#1A5C1A',
      schoolName: 'Green Valley School',
      subtitle: 'Affiliated to CBSE',
      footerText: 'Khatima, Uttarakhand',
      signatories: ['Class Teacher', 'Vice Principal', 'Principal'],
      gradingLegend: 'A 90-100 · B 80-89',
      showRank: false,
      showAttendance: true,
    };
    expect(reportCardSettingsSchema.parse(input)).toEqual(input);
  });

  test('accepts a partial config (every key is optional)', () => {
    expect(reportCardSettingsSchema.parse({ accentColor: '#000000' })).toEqual({
      accentColor: '#000000',
    });
    expect(reportCardSettingsSchema.parse({})).toEqual({});
  });

  test('is strict: unknown keys are rejected', () => {
    expect(() => reportCardSettingsSchema.parse({ preset: 'classic', fontSize: 12 })).toThrow();
  });

  test('logoKey cannot be set through the settings schema', () => {
    expect(() => reportCardSettingsSchema.parse({ logoKey: 'branding/x/evil.png' })).toThrow();
  });

  test('preset must be one of the three', () => {
    expect(() => reportCardSettingsSchema.parse({ preset: 'fancy' })).toThrow();
    for (const preset of ['classic', 'modern', 'compact']) {
      expect(reportCardSettingsSchema.parse({ preset }).preset).toBe(preset);
    }
  });

  test('accentColor must be a six-digit hex', () => {
    for (const bad of ['red', '#fff', '#12345', '#GGGGGG', '1A5C1A', '#1A5C1A00', 'url(x)']) {
      expect(() => reportCardSettingsSchema.parse({ accentColor: bad })).toThrow();
    }
    expect(reportCardSettingsSchema.parse({ accentColor: '#abcdef' }).accentColor).toBe('#abcdef');
  });

  test('signatories has 1 to 3 non-empty entries, trimmed', () => {
    expect(() => reportCardSettingsSchema.parse({ signatories: [] })).toThrow();
    expect(() => reportCardSettingsSchema.parse({ signatories: ['a', 'b', 'c', 'd'] })).toThrow();
    expect(() => reportCardSettingsSchema.parse({ signatories: ['Principal', '   '] })).toThrow();
    expect(reportCardSettingsSchema.parse({ signatories: ['  Principal  '] }).signatories).toEqual([
      'Principal',
    ]);
  });

  test('every string respects its length cap', () => {
    const cases = {
      schoolName: 80,
      subtitle: 120,
      footerText: 200,
      gradingLegend: 160,
    };
    for (const [key, max] of Object.entries(cases)) {
      expect(reportCardSettingsSchema.parse({ [key]: 'x'.repeat(max) })[key]).toHaveLength(max);
      expect(() => reportCardSettingsSchema.parse({ [key]: 'x'.repeat(max + 1) })).toThrow();
    }
    expect(() => reportCardSettingsSchema.parse({ signatories: ['x'.repeat(41)] })).toThrow();
  });

  test('strings are trimmed', () => {
    expect(reportCardSettingsSchema.parse({ schoolName: '  Green Valley  ' }).schoolName).toBe(
      'Green Valley'
    );
  });

  test('showRank and showAttendance must be booleans', () => {
    expect(() => reportCardSettingsSchema.parse({ showRank: 'yes' })).toThrow();
    expect(() => reportCardSettingsSchema.parse({ showAttendance: 0 })).toThrow();
  });
});

describe('resolveReportCardConfig', () => {
  const defaults = {
    preset: 'classic',
    accentColor: '#000000',
    logoKey: null,
    schoolName: 'Green Valley School',
    subtitle: null,
    footerText: null,
    signatories: ['Class Teacher', 'Principal'],
    gradingLegend: DEFAULT_GRADING_LEGEND,
    showRank: true,
    showAttendance: true,
  };

  test('an unconfigured tenant gets every default, school name from the tenant', () => {
    expect(resolveReportCardConfig({ name: 'Green Valley School' })).toEqual(defaults);
    expect(resolveReportCardConfig({ name: 'Green Valley School', settings: {} })).toEqual(
      defaults
    );
  });

  test("the default legend is today's hardcoded one", () => {
    expect(DEFAULT_GRADING_LEGEND).toBe(
      'Grading Scale:  A 90-100  ·  B 80-89  ·  C 70-79  ·  D 60-69  ·  F Below 60'
    );
  });

  test('saved keys win, the rest keep their defaults', () => {
    const tenant = {
      name: 'Green Valley School',
      settings: { reportCard: { preset: 'compact', accentColor: '#1a5c1a', showRank: false } },
    };
    expect(resolveReportCardConfig(tenant)).toEqual({
      ...defaults,
      preset: 'compact',
      accentColor: '#1a5c1a',
      showRank: false,
    });
  });

  test('schoolName override beats tenant.name; a blank one falls back', () => {
    expect(
      resolveReportCardConfig({ name: 'A', settings: { reportCard: { schoolName: 'B' } } })
        .schoolName
    ).toBe('B');
    expect(
      resolveReportCardConfig({ name: 'A', settings: { reportCard: { schoolName: '' } } })
        .schoolName
    ).toBe('A');
  });

  test('logoKey is passed through', () => {
    const tenant = { settings: { reportCard: { logoKey: 'branding/t1/logo.png' } } };
    expect(resolveReportCardConfig(tenant).logoKey).toBe('branding/t1/logo.png');
  });

  test('false booleans are kept, not replaced by the default true', () => {
    const tenant = { settings: { reportCard: { showRank: false, showAttendance: false } } };
    const cfg = resolveReportCardConfig(tenant);
    expect(cfg.showRank).toBe(false);
    expect(cfg.showAttendance).toBe(false);
  });

  test('a missing tenant or settings object does not throw', () => {
    expect(resolveReportCardConfig(undefined).preset).toBe('classic');
    expect(resolveReportCardConfig({}).schoolName).toBe('Report Card');
    expect(resolveReportCardConfig({ settings: { reportCard: null } }).signatories).toEqual([
      'Class Teacher',
      'Principal',
    ]);
  });

  test('returned signatories is a copy, so callers cannot mutate the default', () => {
    const a = resolveReportCardConfig({});
    a.signatories.push('Hacker');
    expect(resolveReportCardConfig({}).signatories).toEqual(['Class Teacher', 'Principal']);
  });
});

describe('reportCardPreviewSchema', () => {
  test('accepts nothing, a section, a draft, or both', () => {
    const id = 'a'.repeat(24);
    expect(reportCardPreviewSchema.parse({})).toEqual({});
    expect(reportCardPreviewSchema.parse({ sectionId: id })).toEqual({ sectionId: id });
    expect(reportCardPreviewSchema.parse({ config: { preset: 'compact' } })).toEqual({
      config: { preset: 'compact' },
    });
  });

  test('rejects a bad id, a bad draft, and unknown keys', () => {
    expect(() => reportCardPreviewSchema.parse({ sectionId: 'nope' })).toThrow();
    expect(() => reportCardPreviewSchema.parse({ config: { accentColor: 'red' } })).toThrow();
    expect(() => reportCardPreviewSchema.parse({ config: { logoKey: 'x' } })).toThrow();
    expect(() => reportCardPreviewSchema.parse({ termId: 'a'.repeat(24) })).toThrow();
  });
});
