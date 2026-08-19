import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';

const EMPTY_ARRAY = [];

function scoreToLetter(score) {
  const n = Number(score);
  if (isNaN(n)) return '';
  if (n >= 90) return 'A';
  if (n >= 80) return 'B';
  if (n >= 70) return 'C';
  if (n >= 60) return 'D';
  return 'F';
}

export default function GradesPage() {
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [termId, setTermId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [scoreMap, setScoreMap] = useState({});
  const [syncedGrades, setSyncedGrades] = useState(EMPTY_ARRAY);

  const { classes } = useClassSections();

  const { data: terms = EMPTY_ARRAY } = useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get('/academic/terms').then((r) => r.data),
  });

  const { data: subjects = EMPTY_ARRAY } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
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

  const { data: existingGrades = EMPTY_ARRAY } = useQuery({
    queryKey: ['grades', termId, subjectId],
    queryFn: () =>
      termId && subjectId
        ? api.get(`/academic/grades?termId=${termId}&subjectId=${subjectId}`).then((r) => r.data)
        : Promise.resolve(EMPTY_ARRAY),
    enabled: Boolean(termId && subjectId),
  });

  if (existingGrades !== syncedGrades) {
    setSyncedGrades(existingGrades);
    const map = {};
    for (const g of existingGrades) {
      map[g.studentId?._id ?? g.studentId] = g.score ?? '';
    }
    setScoreMap(map);
  }

  const selectedTerm = terms.find((t) => t._id === termId);

  const saveMutation = useMutation({
    mutationFn: (grades) => api.post('/academic/grades', { grades }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grades', termId, subjectId] }),
  });

  function handleSave() {
    const grades = students
      .map((s) => {
        const score = scoreMap[s._id] !== undefined ? Number(scoreMap[s._id]) : undefined;
        return {
          studentId: s._id,
          subjectId,
          termId,
          academicYearId: selectedTerm?.academicYearId,
          score,
          letterGrade: scoreToLetter(score),
        };
      })
      .filter((g) => g.score !== undefined && !isNaN(g.score));

    saveMutation.mutate(grades);
  }

  const ready = sectionId && termId && subjectId && students.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Grades</h1>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Section</label>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select —</option>
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
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Term</label>
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select —</option>
            {terms.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Subject</label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select —</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {ready && (
        <>
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
                    Score (0–100)
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {students.map((s) => {
                  const score = scoreMap[s._id] ?? '';
                  return (
                    <tr key={s._id} className="bg-white dark:bg-gray-900">
                      <td className="px-4 py-3">
                        {s.firstName} {s.lastName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.admissionNo}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={score}
                          onChange={(e) => setScoreMap((m) => ({ ...m, [s._id]: e.target.value }))}
                          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                        {scoreToLetter(score)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 items-center">
            {saveMutation.isSuccess && <span className="text-sm text-green-600">Grades saved</span>}
            {saveMutation.isError && <span className="text-sm text-red-500">Save failed</span>}
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Grades'}
            </Button>
          </div>
        </>
      )}

      {!sectionId && (
        <p className="text-gray-400 text-sm">Select section, term, and subject to enter grades</p>
      )}
    </div>
  );
}
