import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scoreToLetter } from '@rooted/shared/utils';
import { ASSESSMENT_TYPES } from '@rooted/shared/constants';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { useAuth } from '../../contexts/useAuth.js';

const EMPTY_ARRAY = [];

function assessmentLabel(type) {
  return type[0].toUpperCase() + type.slice(1);
}

export default function GradesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canPublish = permissions.includes('grades:publish');

  const [sectionId, setSectionId] = useState('');
  const [termId, setTermId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [assessmentType, setAssessmentType] = useState('final');
  const [scoreMap, setScoreMap] = useState({});
  const [syncedGrades, setSyncedGrades] = useState(EMPTY_ARRAY);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

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

  const gradesKey = ['grades', sectionId, termId, subjectId, assessmentType];
  const gradesReady = Boolean(sectionId && termId && subjectId);

  const { data: existingGrades = EMPTY_ARRAY } = useQuery({
    queryKey: gradesKey,
    queryFn: () =>
      api
        .get(
          `/academic/grades?sectionId=${sectionId}&termId=${termId}&subjectId=${subjectId}&assessmentType=${assessmentType}`
        )
        .then((r) => r.data),
    enabled: gradesReady,
  });

  const { data: lockStatus } = useQuery({
    queryKey: ['grade-lock', sectionId, subjectId, termId, assessmentType],
    queryFn: () =>
      api
        .get(
          `/academic/grades/lock?sectionId=${sectionId}&subjectId=${subjectId}&termId=${termId}&assessmentType=${assessmentType}`
        )
        .then((r) => r.data),
    enabled: gradesReady,
  });
  const locked = Boolean(lockStatus?.locked);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gradesKey }),
  });

  const lockMutation = useMutation({
    mutationFn: (action) =>
      api
        .post(`/academic/grades/${action}`, { sectionId, subjectId, termId, assessmentType })
        .then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['grade-lock', sectionId, subjectId, termId, assessmentType],
      }),
  });

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sectionId', sectionId);
      fd.append('termId', termId);
      fd.append('subjectId', subjectId);
      fd.append('academicYearId', selectedTerm?.academicYearId ?? '');
      fd.append('assessmentType', assessmentType);
      return api
        .post('/academic/grades/import', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: gradesKey });
      setImportResult(result);
    },
  });

  function handleSave() {
    const grades = students
      .map((s) => {
        const score = scoreMap[s._id] !== undefined ? Number(scoreMap[s._id]) : undefined;
        return {
          studentId: s._id,
          sectionId,
          subjectId,
          termId,
          academicYearId: selectedTerm?.academicYearId,
          assessmentType,
          score,
        };
      })
      .filter((g) => g.score !== undefined && !isNaN(g.score));

    saveMutation.mutate(grades);
  }

  const ready = sectionId && termId && subjectId && students.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Grades</h1>
        <div className="flex items-center gap-4">
          {sectionId && (
            <Link
              to={`/academic/grades/report?sectionId=${sectionId}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View Report →
            </Link>
          )}
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={!gradesReady || locked || importMutation.isPending}
          >
            {importMutation.isPending ? 'Importing…' : 'Import CSV'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) importMutation.mutate(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

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

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assessment</label>
          <select
            value={assessmentType}
            onChange={(e) => setAssessmentType(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {assessmentLabel(t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {importResult && (
        <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
          <span>
            Imported {importResult.saved} grade{importResult.saved === 1 ? '' : 's'}
            {importResult.errors?.length > 0 && `, ${importResult.errors.length} error(s)`}
          </span>
          <button
            type="button"
            onClick={() => setImportResult(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      )}

      {locked && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Grades are locked for this selection. {canPublish ? 'Unlock to make changes.' : ''}
        </p>
      )}

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
                          disabled={locked}
                          onChange={(e) => setScoreMap((m) => ({ ...m, [s._id]: e.target.value }))}
                          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
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
            {canPublish && (
              <Button
                variant="outline"
                onClick={() => lockMutation.mutate(locked ? 'unlock' : 'lock')}
                disabled={lockMutation.isPending}
              >
                {locked ? 'Unlock' : 'Lock'} Grades
              </Button>
            )}
            <Button onClick={handleSave} disabled={saveMutation.isPending || locked}>
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
