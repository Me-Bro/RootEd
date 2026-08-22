import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ASSESSMENT_TYPES } from '@rooted/shared/constants';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';

const EMPTY_ARRAY = [];

export default function GradeReportPage() {
  const [searchParams] = useSearchParams();
  const [sectionId, setSectionId] = useState(searchParams.get('sectionId') || '');
  const [subjectId, setSubjectId] = useState('');
  const [termId, setTermId] = useState('');
  const [assessmentType, setAssessmentType] = useState('');

  const { classes } = useClassSections();
  const classId = classes.find((c) => (c.sections || []).some((s) => s._id === sectionId))?._id;

  const { data: subjects = EMPTY_ARRAY } = useQuery({
    queryKey: ['subjects', classId],
    queryFn: () => api.get(`/academic/subjects?classId=${classId}`).then((r) => r.data),
    enabled: Boolean(classId),
  });

  const { data: terms = EMPTY_ARRAY } = useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get('/academic/terms').then((r) => r.data),
  });

  const ready = Boolean(sectionId && subjectId && termId);

  const {
    data: report,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['grade-report', sectionId, subjectId, termId, assessmentType],
    queryFn: () =>
      api
        .get(
          `/academic/grades/report?sectionId=${sectionId}&subjectId=${subjectId}&termId=${termId}` +
            (assessmentType ? `&assessmentType=${assessmentType}` : '')
        )
        .then((r) => r.data),
    enabled: ready,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Grade Report</h1>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Section</label>
          <select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setSubjectId('');
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select section —</option>
            {classes.map((c) => (
              <optgroup key={c._id} label={c.name}>
                {(c.sections || []).map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Subject</label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={!sectionId}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select subject —</option>
            {subjects.map((sub) => (
              <option key={sub._id} value={sub._id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Term</label>
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select term —</option>
            {terms.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Assessment (optional)
          </label>
          <select
            value={assessmentType}
            onChange={(e) => setAssessmentType(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— All (blended) —</option>
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!ready && (
        <p className="text-gray-400 text-sm">
          Select section, subject, and term to view the report
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading report…</p>}
      {isError && <p className="text-sm text-red-500">Failed to load grade report</p>}

      {report && (
        <>
          <div className="flex flex-wrap gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Class average:{' '}
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {report.classAverageScore === null ? 'No records yet' : report.classAverageScore}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Grade distribution</p>
              <div className="flex gap-3 text-sm">
                {Object.entries(report.distribution).map(([letter, count]) => (
                  <span key={letter}>
                    {letter}: <span className="font-semibold">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <p className="text-sm font-medium mb-2">Top performers</p>
              {report.topPerformers.length === 0 && (
                <p className="text-sm text-gray-400">No scored students yet</p>
              )}
              {report.topPerformers.map((s) => (
                <div key={s.studentId} className="flex justify-between text-sm py-1">
                  <span>
                    {s.firstName} {s.lastName}
                  </span>
                  <Badge variant="success">{s.score}</Badge>
                </div>
              ))}
            </div>
            <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <p className="text-sm font-medium mb-2">Needs attention</p>
              {report.bottomPerformers.length === 0 && (
                <p className="text-sm text-gray-400">No scored students yet</p>
              )}
              {report.bottomPerformers.map((s) => (
                <div key={s.studentId} className="flex justify-between text-sm py-1">
                  <span>
                    {s.firstName} {s.lastName}
                  </span>
                  <Badge variant="danger">{s.score}</Badge>
                </div>
              ))}
            </div>
          </div>

          {report.students.length === 0 ? (
            <p className="text-gray-400 text-sm">No active students in this section</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      Student
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      Admission No
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      Score
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      Grade
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {report.students.map((s) => (
                    <tr key={s.studentId} className="bg-white dark:bg-gray-900">
                      <td className="px-4 py-3">
                        {s.firstName} {s.lastName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.admissionNo}</td>
                      <td className="px-4 py-3">{s.score ?? '—'}</td>
                      <td className="px-4 py-3">{s.letterGrade ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
