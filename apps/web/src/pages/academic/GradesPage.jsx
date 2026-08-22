import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Lock } from 'lucide-react';
import { scoreToLetter } from '@rooted/shared/utils';
import { ASSESSMENT_TYPES } from '@rooted/shared/constants';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { useAuth } from '../../contexts/useAuth.js';
import DockedKeypad from '../../components/grades/DockedKeypad.jsx';
import MarkRow from '../../components/grades/MarkRow.jsx';

const EMPTY_ARRAY = [];

const CHIP_TRIGGER_CLASS =
  'flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium';

// Roster order, first student with no entry in scoreMap at all (undefined —
// as opposed to `null`, which means "marked AB").
function firstUnmarkedId(students, map) {
  return students.find((s) => !(s._id in map))?._id ?? null;
}

// Circular scan starting just after `afterId` so entry naturally proceeds
// top-to-bottom and wraps back around to catch anything skipped earlier.
// Returns null once every student has an entry — the docked keypad then
// gives way to the plain Save/Lock action row.
function nextUnmarkedId(students, map, afterId) {
  const n = students.length;
  if (n === 0) return null;
  const idx = students.findIndex((s) => s._id === afterId);
  for (let i = 1; i <= n; i++) {
    const candidate = students[(idx + i) % n];
    if (!(candidate._id in map)) return candidate._id;
  }
  return null;
}

export default function GradesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canPublish = permissions.includes('grades:publish');

  const [searchParams] = useSearchParams();
  const [sectionId, setSectionId] = useState(() => searchParams.get('sectionId') || '');
  const [termId, setTermId] = useState(() => searchParams.get('termId') || '');
  const [subjectId, setSubjectId] = useState(() => searchParams.get('subjectId') || '');
  const [assessmentType, setAssessmentType] = useState(
    () => searchParams.get('assessmentType') || 'final'
  );

  const [scoreMap, setScoreMap] = useState({}); // studentId -> number | null (AB)
  const [focusedId, setFocusedId] = useState(null);
  const [draft, setDraft] = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const { classes } = useClassSections();
  const currentSection = classes
    .flatMap((c) => (c.sections || []).map((s) => ({ ...s, className: c.name })))
    .find((s) => s._id === sectionId);

  // Active academic year — same pattern as MySchedulePage/AcademicYearsPage —
  // so the terms request below can be scoped to it. Without this, GET
  // /academic/terms returns every term across every seeded year (fixed here;
  // see docs/mobile-ui/05-grades-approved.html §0).
  const { data: years = EMPTY_ARRAY } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });
  const activeYearId = years.find((y) => y.isActive)?._id ?? '';

  const { data: terms = EMPTY_ARRAY } = useQuery({
    queryKey: ['terms', activeYearId],
    queryFn: () => api.get(`/academic/terms?yearId=${activeYearId}`).then((r) => r.data),
    enabled: Boolean(activeYearId),
  });

  const { data: subjects = EMPTY_ARRAY } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });

  const {
    data: students = EMPTY_ARRAY,
    isLoading: studentsLoading,
    isFetched: studentsFetched,
  } = useQuery({
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

  const {
    data: existingGrades = EMPTY_ARRAY,
    isLoading: gradesLoading,
    isFetched: gradesFetched,
  } = useQuery({
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

  // Seed scoreMap + focus from the server exactly once per (section, term,
  // subject, assessment) combo, the moment both the roster and the existing
  // grades for that combo have loaded — mirrors useAttendanceRoster's
  // initializedKeyRef pattern so a later local edit or background refetch
  // never clobbers in-progress marking.
  const scopeKey = gradesReady ? `${sectionId}:${termId}:${subjectId}:${assessmentType}` : null;
  const initializedKeyRef = useRef(null);

  useEffect(() => {
    if (!scopeKey) return;
    if (studentsLoading || gradesLoading || !studentsFetched || !gradesFetched) return;
    if (initializedKeyRef.current === scopeKey) return;

    const map = {};
    for (const g of existingGrades) {
      const sid = g.studentId?._id ?? g.studentId;
      if (typeof g.score === 'number') map[sid] = g.score;
    }
    setScoreMap(map);
    setFocusedId(firstUnmarkedId(students, map));
    setDraft('');
    initializedKeyRef.current = scopeKey;
  }, [
    scopeKey,
    studentsLoading,
    gradesLoading,
    studentsFetched,
    gradesFetched,
    students,
    existingGrades,
  ]);

  const selectedTerm = terms.find((t) => t._id === termId);
  const selectedSubject = subjects.find((s) => s._id === subjectId);

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
      // Force the seed effect above to re-sync from the server on the next
      // existingGrades refetch — an import can change scores the current
      // in-memory scoreMap doesn't know about.
      initializedKeyRef.current = null;
      queryClient.invalidateQueries({ queryKey: gradesKey });
      setImportResult(result);
    },
  });

  function keypadPress(key) {
    if (locked || !focusedId) return;
    if (key === '⌫') {
      setDraft((d) => d.slice(0, -1));
      return;
    }
    if (key === 'AB') {
      commitAndAdvance(null);
      return;
    }
    setDraft((d) => {
      const next = d + key;
      return Number(next) <= 100 ? next : d;
    });
  }

  function commitAndAdvance(score) {
    if (!focusedId) return;
    const newMap = { ...scoreMap, [focusedId]: score };
    setScoreMap(newMap);
    setDraft('');
    setFocusedId(nextUnmarkedId(students, newMap, focusedId));
  }

  function commitDraftAndAdvance() {
    if (!draft) return;
    commitAndAdvance(Number(draft));
  }

  function selectRow(studentId) {
    if (locked) return;
    setFocusedId(studentId);
    setDraft('');
  }

  function handleSave() {
    const grades = students
      .map((s) => ({
        studentId: s._id,
        sectionId,
        subjectId,
        termId,
        academicYearId: selectedTerm?.academicYearId,
        assessmentType,
        score: scoreMap[s._id],
      }))
      // "AB" (score === null) isn't a persistable value — the Grade model has
      // no absent flag and this UI-only spec leaves the API contract
      // unchanged, so an AB mark stays a client-side-only skip rather than a
      // saved row. See report for the fuller note.
      .filter((g) => typeof g.score === 'number');

    saveMutation.mutate(grades);
  }

  const ready = gradesReady && students.length > 0;
  const enteredCount = Object.keys(scoreMap).length;
  const numericScores = Object.values(scoreMap).filter((v) => typeof v === 'number');
  const liveAverage = numericScores.length
    ? Math.round(numericScores.reduce((a, b) => a + b, 0) / numericScores.length)
    : null;

  const scopeLabel = [
    currentSection && `${currentSection.className}-${currentSection.name}`,
    selectedSubject?.name,
    selectedTerm?.name,
    gradesReady && t(`academic.assessmentTypes.${assessmentType}`),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('academic.grades.title')}</h1>
          {scopeLabel && <p className="text-sm text-muted-foreground">{scopeLabel}</p>}
        </div>
        <div className="flex items-center gap-4">
          {sectionId && (
            <Link
              to={`/academic/grades/report?sectionId=${sectionId}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('academic.grades.viewReport')}
            </Link>
          )}
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={!gradesReady || locked || importMutation.isPending}
          >
            {importMutation.isPending
              ? t('academic.students.importing')
              : t('academic.students.importCsv')}
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

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP_TRIGGER_CLASS}>
            {currentSection
              ? `${currentSection.className}-${currentSection.name}`
              : t('academic.grades.selectSection')}
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {classes.map((c) => (
              <DropdownMenuGroup key={c._id}>
                <DropdownMenuLabel>{c.name}</DropdownMenuLabel>
                {(c.sections || []).map((s) => (
                  <DropdownMenuItem key={s._id} onClick={() => setSectionId(s._id)}>
                    {c.name} - {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP_TRIGGER_CLASS}>
            {selectedTerm ? selectedTerm.name : t('academic.grades.term')}
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {terms.map((term) => (
              <DropdownMenuItem key={term._id} onClick={() => setTermId(term._id)}>
                {term.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP_TRIGGER_CLASS}>
            {selectedSubject ? selectedSubject.name : t('common.subject')}
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {subjects.map((s) => (
              <DropdownMenuItem key={s._id} onClick={() => setSubjectId(s._id)}>
                {s.name} ({s.code})
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP_TRIGGER_CLASS}>
            {t(`academic.assessmentTypes.${assessmentType}`)}
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ASSESSMENT_TYPES.map((type) => (
              <DropdownMenuItem key={type} onClick={() => setAssessmentType(type)}>
                {t(`academic.assessmentTypes.${type}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {students.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('academic.attendance.studentsCount', { count: students.length })}
          </span>
        )}
      </div>

      {importResult && (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted px-4 py-2 text-sm">
          <span>
            {t('academic.grades.importedCount', { count: importResult.saved })}
            {importResult.errors?.length > 0 &&
              t('academic.grades.importedErrorsSuffix', { count: importResult.errors.length })}
          </span>
          <button
            type="button"
            onClick={() => setImportResult(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {!sectionId && <EmptyState title={t('academic.grades.selectToEnter')} />}

      {sectionId && !studentsLoading && gradesReady && students.length === 0 && (
        <EmptyState title={t('academic.grades.noActiveStudents')} />
      )}

      {gradesReady && locked && (
        <div className="sticky top-0 z-10 -mx-6 -mt-6 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Lock size={16} className="shrink-0" />
          <span>
            {t('academic.grades.lockedNotice')} {canPublish ? t('academic.grades.unlockHint') : ''}
          </span>
        </div>
      )}

      {ready && (
        <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
          <span className="font-semibold">
            {t('academic.grades.enteredOfTotal', { entered: enteredCount, total: students.length })}
          </span>
          {liveAverage != null && (
            <span className="text-muted-foreground">
              {' '}
              {t('academic.grades.classAvgSoFar', { avg: liveAverage })}
            </span>
          )}
        </div>
      )}

      {ready && (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {students.map((s) => {
            const isFocused = focusedId === s._id;
            return (
              <MarkRow
                key={s._id}
                student={s}
                score={isFocused ? draft : scoreMap[s._id]}
                letterGrade={
                  typeof scoreMap[s._id] === 'number' ? scoreToLetter(scoreMap[s._id]) : ''
                }
                focused={isFocused}
                onSelect={locked ? undefined : () => selectRow(s._id)}
              />
            );
          })}
        </div>
      )}

      {ready && (
        <div className="sticky bottom-0 z-10 -mx-6 flex flex-col gap-2 border-t border-border bg-card p-3">
          {saveMutation.isSuccess && (
            <p className="text-center text-sm text-green-600">{t('academic.grades.gradesSaved')}</p>
          )}
          {saveMutation.isError && (
            <p className="text-center text-sm text-destructive">
              {t('academic.grades.saveFailed')}
            </p>
          )}

          {locked && <DockedKeypad value="" onKey={() => {}} onNext={() => {}} disabled />}
          {!locked && focusedId && (
            <DockedKeypad value={draft} onKey={keypadPress} onNext={commitDraftAndAdvance} />
          )}
          {!locked && !focusedId && (
            <p className="text-center text-sm text-muted-foreground">
              {t('academic.grades.allStudentsMarked')}
            </p>
          )}

          <div className="flex gap-2">
            {canPublish && (
              <Button
                variant="outline"
                onClick={() => lockMutation.mutate(locked ? 'unlock' : 'lock')}
                disabled={lockMutation.isPending}
              >
                {locked ? t('academic.grades.unlockGrades') : t('academic.grades.lockGrades')}
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saveMutation.isPending || locked}
            >
              {saveMutation.isPending ? t('common.saving') : t('academic.grades.saveGrades')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
