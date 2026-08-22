import { scoreToLetter } from '@rooted/shared/utils';

const LETTERS = ['A', 'B', 'C', 'D', 'F'];

/**
 * Per-student weighted-average score across every Grade row passed in
 * (mirrors reportCard.worker.js's totalWeightedScore/totalWeight math) —
 * a student with a quiz (weightage 0.3) and a final (weightage 1) in the
 * same subject/term gets one blended score, not two competing rows.
 */
export function computeGradeStats(students, grades) {
  const byStudent = new Map();
  for (const student of students) {
    byStudent.set(String(student._id), []);
  }
  for (const grade of grades) {
    const bucket = byStudent.get(String(grade.studentId));
    if (bucket) bucket.push(grade);
  }

  const studentStats = students.map((student) => {
    const studentId = String(student._id);
    const rows = byStudent.get(studentId);

    let totalWeighted = 0;
    let totalWeight = 0;
    for (const g of rows) {
      totalWeighted += (g.score ?? 0) * (g.weightage ?? 1);
      totalWeight += g.weightage ?? 1;
    }
    const score = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 100) / 100 : null;

    return {
      studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNo: student.admissionNo,
      score,
      letterGrade: score !== null ? scoreToLetter(score) : null,
    };
  });

  const scored = studentStats.filter((s) => s.score !== null);
  const classAverageScore =
    scored.length > 0
      ? Math.round((scored.reduce((sum, s) => sum + s.score, 0) / scored.length) * 100) / 100
      : null;

  const distribution = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  for (const s of scored) {
    if (s.letterGrade in distribution) distribution[s.letterGrade]++;
  }

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  ranked.forEach((s, i) => {
    s.rank = i + 1;
  });
  for (const s of studentStats) {
    if (s.rank === undefined) s.rank = null;
  }

  return {
    students: studentStats,
    classAverageScore,
    distribution,
    rankedCount: scored.length,
    topPerformers: ranked.slice(0, 3),
    bottomPerformers: ranked.slice(-3).reverse(),
  };
}
