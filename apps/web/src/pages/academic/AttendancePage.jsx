import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';

const STATUS_OPTIONS = ['present', 'absent', 'late', 'excused'];
const EMPTY_ARRAY = [];

const statusColors = {
  present: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200',
  absent: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200',
  late: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200',
  excused: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200',
  '': 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400',
};

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sectionId, setSectionId] = useState(() => searchParams.get('sectionId') || '');
  const [subjectId, setSubjectId] = useState(() => searchParams.get('subjectId') || '');
  const [attendanceMap, setAttendanceMap] = useState({});
  const [syncedRecords, setSyncedRecords] = useState(EMPTY_ARRAY);

  const { classes } = useClassSections();
  const classId = classes.find((c) => (c.sections || []).some((s) => s._id === sectionId))?._id;

  const { data: subjects = EMPTY_ARRAY } = useQuery({
    queryKey: ['subjects', classId],
    queryFn: () => api.get(`/academic/subjects?classId=${classId}`).then((r) => r.data),
    enabled: Boolean(classId),
  });

  const { data: students = EMPTY_ARRAY } = useQuery({
    queryKey: ['students-list', sectionId],
    queryFn: () =>
      sectionId
        ? api
            .get(`/academic/students?sectionId=${sectionId}&limit=100`)
            .then((r) => r.data.students)
        : Promise.resolve(EMPTY_ARRAY),
    enabled: Boolean(sectionId),
  });

  const { data: existingRecords = EMPTY_ARRAY } = useQuery({
    queryKey: ['attendance', sectionId, date, subjectId],
    queryFn: () =>
      sectionId && date
        ? api
            .get(
              `/academic/attendance?sectionId=${sectionId}&date=${date}` +
                (subjectId ? `&subjectId=${subjectId}` : '')
            )
            .then((r) => r.data)
        : Promise.resolve(EMPTY_ARRAY),
    enabled: Boolean(sectionId && date),
  });

  if (existingRecords !== syncedRecords) {
    setSyncedRecords(existingRecords);
    const map = {};
    for (const r of existingRecords) {
      map[r.entityId] = r.status;
    }
    setAttendanceMap(map);
  }

  const saveMutation = useMutation({
    mutationFn: (records) =>
      api
        .post('/academic/attendance', {
          date,
          sectionId,
          subjectId: subjectId || null,
          records,
        })
        .then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['attendance', sectionId, date, subjectId] }),
  });

  function toggleStatus(studentId, current) {
    const idx = STATUS_OPTIONS.indexOf(current);
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    setAttendanceMap((m) => ({ ...m, [studentId]: next }));
  }

  function markAll(status) {
    setAttendanceMap(() => Object.fromEntries(students.map((s) => [s._id, status])));
  }

  function handleSave() {
    const records = students.map((s) => ({
      entityId: s._id,
      status: attendanceMap[s._id] || 'absent',
    }));
    saveMutation.mutate(records);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        {sectionId && (
          <Link
            to={`/academic/attendance/report?sectionId=${sectionId}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            View Report →
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
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
            <option value="">— Daily (no subject) —</option>
            {subjects.map((sub) => (
              <option key={sub._id} value={sub._id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sectionId && students.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-gray-400">
              Click a status to cycle: present → absent → late → excused
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => markAll('present')}>
                Mark all Present
              </Button>
              <Button variant="outline" size="sm" onClick={() => markAll('absent')}>
                Mark all Absent
              </Button>
            </div>
          </div>
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
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {students.map((s) => {
                  const status = attendanceMap[s._id] || '';
                  return (
                    <tr key={s._id} className="bg-white dark:bg-gray-900">
                      <td className="px-4 py-3">
                        {s.firstName} {s.lastName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.admissionNo}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleStatus(s._id, status)}
                          className={[
                            'rounded border px-3 py-1 text-xs font-medium capitalize transition-colors',
                            statusColors[status],
                          ].join(' ')}
                        >
                          {status || 'not marked'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Attendance'}
            </Button>
          </div>

          {saveMutation.isSuccess && (
            <p className="text-sm text-green-600 text-right">Attendance saved successfully</p>
          )}
          {saveMutation.isError && (
            <p className="text-sm text-red-500 text-right">Failed to save attendance</p>
          )}
        </>
      )}

      {sectionId && students.length === 0 && (
        <p className="text-gray-400 text-sm">No students in this section</p>
      )}

      {!sectionId && <p className="text-gray-400 text-sm">Select a section to mark attendance</p>}
    </div>
  );
}
