// Report card layouts render to a PDF buffer with pdfkit alone: no Redis, no Mongo.
import { jest } from '@jest/globals';
import PDFDocument from 'pdfkit';
import { resolveReportCardConfig } from '../utils/reportCardConfig.js';
import {
  renderReportCardPdf,
  signatureSlots,
  tint,
  readableOn,
} from '../utils/reportCardLayouts.js';

// A real 1x1 PNG, so pdfkit can decode it.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const LEGEND = 'Grading Scale:  A 90-100  ·  B 80-89  ·  C 70-79  ·  D 60-69  ·  F Below 60';

function student(id, first, last, admissionNo) {
  return { _id: { toString: () => id }, firstName: first, lastName: last, admissionNo };
}

function grade(name, score, letterGrade, extra = {}) {
  return {
    subjectId: { name },
    assessmentType: 'final',
    score,
    letterGrade,
    ...extra,
  };
}

function input(overrides = {}) {
  const students = overrides.students ?? [
    student('s1', 'Asha', 'Rao', 'A001'),
    student('s2', 'Ravi', 'Kumar', 'A002'),
  ];
  const gradesByStudent = overrides.gradesByStudent ?? {
    s1: [
      grade('Maths', 92, 'A', { remarks: 'Good' }),
      grade('English', 78, 'C', { assessmentType: 'midterm' }),
    ],
    s2: [grade('Maths', 60, 'D')],
  };
  const gradeStatsByStudent = overrides.gradeStatsByStudent ?? {
    s1: { score: 85, letterGrade: 'B', rank: 1 },
    s2: { score: 60, letterGrade: 'D', rank: 2 },
  };
  const attendanceByStudent = overrides.attendanceByStudent ?? { s1: { pct: 90 } };
  return {
    students,
    sectionLabel: 'Class 5 - A',
    termLabel: 'Term 1',
    gradesByStudent,
    gradeStatsByStudent,
    attendanceByStudent,
    rankedCount: 2,
    config: resolveReportCardConfig({ name: 'Green Valley School' }),
    logo: null,
    ...overrides,
  };
}

const withConfig = (config, rest = {}) =>
  input({
    config: resolveReportCardConfig({
      name: 'Green Valley School',
      settings: { reportCard: config },
    }),
    ...rest,
  });

let textSpy;
let imageSpy;
const texts = () => textSpy.mock.calls.map((c) => String(c[0]));
const pageCount = (buf) => (buf.toString('latin1').match(/\/Type \/Page(?![s\w])/g) ?? []).length;

beforeEach(() => {
  textSpy = jest.spyOn(PDFDocument.prototype, 'text');
  imageSpy = jest.spyOn(PDFDocument.prototype, 'image');
});
afterEach(() => jest.restoreAllMocks());

describe('classic preset (the original look)', () => {
  test('draws the same text, in the same order, as the original worker', async () => {
    await renderReportCardPdf(input({ students: [student('s1', 'Asha', 'Rao', 'A001')] }));
    expect(texts()).toEqual([
      'Green Valley School',
      'Report Card',
      'Class 5 - A  ·  Term 1',
      'Asha Rao',
      'Admission No: A001',
      'Subject',
      'Score',
      'Grade',
      'Remarks',
      'Maths',
      '92',
      'A',
      'Good',
      'English (Midterm)',
      '78',
      'C',
      '—',
      'Weighted Average: 85   Overall Grade: B',
      'Class Rank: 1 of 2',
      'Attendance: 90%',
      'Class Teacher',
      'Principal',
      LEGEND,
      'Page 1 of 1',
    ]);
  });

  test('one page per student, numbered', async () => {
    const buf = await renderReportCardPdf(input());
    expect(pageCount(buf)).toBe(2);
    expect(texts()).toContain('Page 1 of 2');
    expect(texts()).toContain('Page 2 of 2');
  });

  test('an unranked student and a missing attendance record show the fallbacks', async () => {
    await renderReportCardPdf(
      input({
        students: [student('s9', 'No', 'Scores', 'A009')],
        gradesByStudent: {},
        gradeStatsByStudent: {},
        attendanceByStudent: {},
      })
    );
    expect(texts()).toContain('Weighted Average: —   Overall Grade: —');
    expect(texts()).toContain('Class Rank: Not ranked (no scored subjects)');
    expect(texts()).toContain('Attendance: No records');
  });

  test('an empty section says so', async () => {
    await renderReportCardPdf(input({ students: [] }));
    expect(texts()).toContain('No active students in this section.');
  });

  test('an unknown preset falls back to classic', async () => {
    const cfg = { ...resolveReportCardConfig({ name: 'X' }), preset: 'nonsense' };
    const buf = await renderReportCardPdf(input({ config: cfg }));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(texts()).toContain('Class Rank: 1 of 2');
  });
});

describe.each(['classic', 'modern', 'compact'])('%s preset', (preset) => {
  const cfg = (extra = {}) => ({ preset, ...extra });

  test('renders a PDF for a normal section', async () => {
    const buf = await renderReportCardPdf(withConfig(cfg({ accentColor: '#1a5c1a' })));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(buf)).toBe(2);
  });

  test('renders with no grades, no stats and no attendance', async () => {
    const buf = await renderReportCardPdf(
      withConfig(cfg(), { gradesByStudent: {}, gradeStatsByStudent: {}, attendanceByStudent: {} })
    );
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('12 and 20 grade rows stay on one page', async () => {
    for (const rows of [12, 20]) {
      const many = Array.from({ length: rows }, (_, i) => grade(`Subject ${i + 1}`, 70 + i, 'C'));
      const buf = await renderReportCardPdf(
        withConfig(cfg(), {
          students: [student('s1', 'Asha', 'Rao', 'A001')],
          gradesByStudent: { s1: many },
        })
      );
      expect(pageCount(buf)).toBe(1);
    }
  });

  test('draws every grade row it is given', async () => {
    const many = Array.from({ length: 12 }, (_, i) => grade(`Subject ${i + 1}`, 70 + i, 'C'));
    await renderReportCardPdf(
      withConfig(cfg(), {
        students: [student('s1', 'Asha', 'Rao', 'A001')],
        gradesByStudent: { s1: many },
      })
    );
    for (let i = 1; i <= 12; i++) expect(texts()).toContain(`Subject ${i}`);
  });

  test('showRank: false drops every rank mention', async () => {
    await renderReportCardPdf(withConfig(cfg({ showRank: false })));
    expect(texts().some((t) => /rank/i.test(t))).toBe(false);
  });

  test('showAttendance: false drops every attendance mention', async () => {
    await renderReportCardPdf(withConfig(cfg({ showAttendance: false })));
    expect(texts().some((t) => /attendance/i.test(t))).toBe(false);
  });

  test('the school name, subtitle, footer text and legend override come through', async () => {
    await renderReportCardPdf(
      withConfig(
        cfg({
          schoolName: 'Sunrise Public School',
          subtitle: 'Affiliated to CBSE',
          footerText: 'Khatima, Uttarakhand',
          gradingLegend: 'A = Excellent',
        })
      )
    );
    expect(texts()).toContain('Sunrise Public School');
    expect(texts()).toContain('Affiliated to CBSE');
    expect(texts()).toContain('Khatima, Uttarakhand');
    expect(texts()).toContain('A = Excellent');
    expect(texts()).not.toContain(LEGEND);
  });

  test.each([
    [['Principal']],
    [['Class Teacher', 'Principal']],
    [['Class Teacher', 'Vice Principal', 'Principal']],
  ])('signatories %j are all drawn', async (signatories) => {
    await renderReportCardPdf(
      withConfig(cfg({ signatories }), { students: [student('s1', 'A', 'B', '1')] })
    );
    for (const label of signatories) expect(texts()).toContain(label);
  });

  test('a logo is drawn once per card, inside a bounded box', async () => {
    await renderReportCardPdf(withConfig(cfg(), { logo: PNG_1X1 }));
    expect(imageSpy).toHaveBeenCalledTimes(2);
    const [, , , options] = imageSpy.mock.calls[0];
    expect(options.fit).toHaveLength(2);
    expect(options.fit[0]).toBeLessThanOrEqual(60);
    expect(options.fit[1]).toBeLessThanOrEqual(60);
  });

  test('no logo means no image call', async () => {
    await renderReportCardPdf(withConfig(cfg()));
    expect(imageSpy).not.toHaveBeenCalled();
  });

  test('an undecodable logo is skipped, the card still renders', async () => {
    const buf = await renderReportCardPdf(withConfig(cfg(), { logo: Buffer.from('not an image') }));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(buf)).toBe(2);
  });

  test('reports progress from 0 to the number of students', async () => {
    const onProgress = jest.fn(async () => {});
    await renderReportCardPdf(withConfig(cfg(), { onProgress }));
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      { completed: 0, total: 2 },
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ]);
  });
});

describe('signatureSlots', () => {
  test('two slots match the original layout', () => {
    expect(signatureSlots(2)).toEqual([
      [80, 220],
      [340, 480],
    ]);
  });

  test.each([1, 2, 3])('%i slots stay inside the margins and never overlap', (n) => {
    const slots = signatureSlots(n);
    expect(slots).toHaveLength(n);
    slots.forEach(([a, b], i) => {
      expect(a).toBeGreaterThanOrEqual(50);
      expect(b).toBeLessThanOrEqual(545);
      expect(b).toBeGreaterThan(a);
      if (i > 0) expect(a).toBeGreaterThan(slots[i - 1][1]);
    });
  });
});

describe('colour helpers', () => {
  test('tint mixes toward white', () => {
    expect(tint('#000000', 1)).toBe('#ffffff');
    expect(tint('#000000', 0)).toBe('#000000');
    expect(tint('#ff0000', 0.5)).toBe('#ff8080');
  });

  test('readableOn picks white on dark accents and black on light ones', () => {
    expect(readableOn('#1a5c1a')).toBe('#ffffff');
    expect(readableOn('#000000')).toBe('#ffffff');
    expect(readableOn('#ffff00')).toBe('#000000');
    expect(readableOn('#ffffff')).toBe('#000000');
  });
});
