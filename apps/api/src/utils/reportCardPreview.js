// Fixed sample grades so a preview shows what each preset does with a full table,
// a midterm label, a remark, and a failing grade.
const SAMPLE_SUBJECTS = [
  ['Mathematics', 92, 'A', 'Excellent work'],
  ['English', 84, 'B', null],
  ['Hindi', 78, 'C', null],
  ['Science', 88, 'B', 'Good practical work'],
  ['Social Studies', 71, 'C', null],
  ['Computer Science', 95, 'A', null],
];

const SAMPLE_STUDENT = { firstName: 'Sample', lastName: 'Student', admissionNo: 'ADM-0001' };

// Input for renderReportCardPdf: one card. `student` is a real student's name and
// admission number when the caller has one; everything else is sample data.
export function buildPreviewInput({ student, sectionLabel, config, logo }) {
  const card = { _id: { toString: () => 'preview' }, ...(student ?? SAMPLE_STUDENT) };
  return {
    students: [card],
    sectionLabel: sectionLabel ?? 'Class 5 - A',
    termLabel: 'Preview',
    gradesByStudent: {
      preview: SAMPLE_SUBJECTS.map(([name, score, letterGrade, remarks], i) => ({
        subjectId: { name },
        assessmentType: i === 1 ? 'midterm' : 'final',
        score,
        letterGrade,
        remarks: remarks ?? undefined,
      })),
    },
    gradeStatsByStudent: { preview: { score: 84.7, letterGrade: 'B', rank: 4 } },
    attendanceByStudent: { preview: { pct: 92 } },
    rankedCount: 30,
    config,
    logo,
  };
}
