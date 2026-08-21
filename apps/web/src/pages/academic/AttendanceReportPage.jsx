import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';

const EMPTY_ARRAY = [];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return isoDate(d);
}

function downloadCsv(report) {
  const header = ['Admission No', 'Student', 'Present', 'Total', '%', 'Defaulter'];
  const rows = report.students.map((s) => [
    s.admissionNo ?? '',
    `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
    s.presentCount,
    s.totalCount,
    s.pct ?? '',
    s.isDefaulter ? 'Yes' : 'No',
  ]);
  const csv = [header, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-report-${report.from.slice(0, 10)}-to-${report.to.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceReportPage() {
  const [searchParams] = useSearchParams();
  const [sectionId, setSectionId] = useState(searchParams.get('sectionId') || '');
  const [subjectId, setSubjectId] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => isoDate(new Date()));

  const { classes } = useClassSections();
  const classId = classes.find((c) => (c.sections || []).some((s) => s._id === sectionId))?._id;

  const { data: subjects = EMPTY_ARRAY } = useQuery({
    queryKey: ['subjects', classId],
    queryFn: () => api.get(`/academic/subjects?classId=${classId}`).then((r) => r.data),
    enabled: Boolean(classId),
  });

  const {
    data: report,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['attendance-report', sectionId, subjectId, from, to],
    queryFn: () =>
      api
        .get(
          `/academic/attendance/report?sectionId=${sectionId}&from=${from}&to=${to}` +
            (subjectId ? `&subjectId=${subjectId}` : '')
        )
        .then((r) => r.data),
    enabled: Boolean(sectionId && from && to),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Attendance Report</h1>

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
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Subject (optional)
          </label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={!sectionId}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— All subjects —</option>
            {subjects.map((sub) => (
              <option key={sub._id} value={sub._id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        {report && report.students.length > 0 && (
          <Button variant="outline" onClick={() => downloadCsv(report)}>
            Export CSV
          </Button>
        )}
      </div>

      {!sectionId && <p className="text-gray-400 text-sm">Select a section to view the report</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading report…</p>}
      {isError && <p className="text-sm text-red-500">Failed to load attendance report</p>}

      {report && (
        <>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Class average:{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {report.classAveragePct === null ? 'No records yet' : `${report.classAveragePct}%`}
              </span>
              {' · '}Defaulter threshold: {report.thresholdPct}%
            </p>
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
                      Present / Total
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">%</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {report.students.map((s) => (
                    <tr key={s.studentId} className="bg-white dark:bg-gray-900">
                      <td className="px-4 py-3">
                        {s.firstName} {s.lastName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.admissionNo}</td>
                      <td className="px-4 py-3">
                        {s.presentCount}/{s.totalCount}
                      </td>
                      <td className="px-4 py-3">{s.pct === null ? '—' : `${s.pct}%`}</td>
                      <td className="px-4 py-3">
                        {s.isDefaulter && <Badge variant="danger">Defaulter</Badge>}
                      </td>
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
