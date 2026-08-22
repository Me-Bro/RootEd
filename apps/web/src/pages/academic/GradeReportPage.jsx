import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { ASSESSMENT_TYPES } from '@rooted/shared/constants';
import api from '../../lib/api.js';
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
import DistributionBars from '../../components/grade-report/DistributionBars.jsx';

const EMPTY_ARRAY = [];

function Chip({ children, disabled, ...props }) {
  return (
    <DropdownMenuTrigger
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-40"
      {...props}
    >
      {children}
      <ChevronDown size={14} />
    </DropdownMenuTrigger>
  );
}

function AverageRing({ score }) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div
      className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundImage: `conic-gradient(var(--primary) ${pct}%, var(--muted) 0)` }}
    >
      <div className="absolute inset-[6px] rounded-full bg-card" />
      <span className="relative text-sm font-semibold">{score ?? '—'}</span>
    </div>
  );
}

export default function GradeReportPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [sectionId, setSectionId] = useState(() => searchParams.get('sectionId') || '');
  const [subjectId, setSubjectId] = useState(() => searchParams.get('subjectId') || '');
  const [termId, setTermId] = useState(() => searchParams.get('termId') || '');
  const [assessmentType, setAssessmentType] = useState(
    () => searchParams.get('assessmentType') || ''
  );
  const [bandFilter, setBandFilter] = useState(null); // 'A'|'B'|'C'|'D'|'F'|null

  const { classes } = useClassSections();
  const classId = classes.find((c) => (c.sections || []).some((s) => s._id === sectionId))?._id;
  const currentClass = classes.find((c) => c._id === classId);
  const currentSection = currentClass?.sections?.find((s) => s._id === sectionId);

  const { data: subjects = EMPTY_ARRAY } = useQuery({
    queryKey: ['subjects', classId],
    queryFn: () => api.get(`/academic/subjects?classId=${classId}`).then((r) => r.data),
    enabled: Boolean(classId),
  });
  const currentSubject = subjects.find((s) => s._id === subjectId);

  // Active academic year, same pattern as MySchedulePage.jsx — years.find(isActive).
  const { data: years = EMPTY_ARRAY } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });
  const activeYearId = years.find((y) => y.isActive)?._id ?? '';

  // Fixes P10: without ?yearId, tenants with >1 academic year get duplicate
  // term names ("Term 1, Term 2, Term 1, Term 2...") in the dropdown below.
  const { data: terms = EMPTY_ARRAY } = useQuery({
    queryKey: ['terms', activeYearId],
    queryFn: () =>
      api
        .get(`/academic/terms${activeYearId ? `?yearId=${activeYearId}` : ''}`)
        .then((r) => r.data),
  });
  const currentTerm = terms.find((t) => t._id === termId);

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

  const scoredCount = report?.rankedCount ?? 0;
  const passRate =
    report && scoredCount > 0
      ? Math.round(((scoredCount - (report.distribution.F ?? 0)) / scoredCount) * 100)
      : null;

  const allStudents = report?.students ?? EMPTY_ARRAY;
  const filteredStudents = bandFilter
    ? allStudents.filter((s) => s.letterGrade === bandFilter)
    : allStudents;

  function selectSection(id) {
    setSectionId(id);
    setSubjectId('');
    setBandFilter(null);
  }
  function selectSubject(id) {
    setSubjectId(id);
    setBandFilter(null);
  }
  function selectTerm(id) {
    setTermId(id);
    setBandFilter(null);
  }
  function selectAssessmentType(type) {
    setAssessmentType(type);
    setBandFilter(null);
  }
  function selectBand(letter) {
    setBandFilter((prev) => (prev === letter ? null : letter));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('academic.gradeReport.title')}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <Chip>
            {currentSection
              ? `${currentSection.className}-${currentSection.name}`
              : t('academic.students.section')}
          </Chip>
          <DropdownMenuContent align="start">
            {classes.map((c) => (
              <DropdownMenuGroup key={c._id}>
                <DropdownMenuLabel>{c.name}</DropdownMenuLabel>
                {(c.sections || []).map((s) => (
                  <DropdownMenuItem key={s._id} onClick={() => selectSection(s._id)}>
                    {c.name} - {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Chip disabled={!sectionId}>{currentSubject?.name ?? t('common.subject')}</Chip>
          <DropdownMenuContent align="start">
            {subjects.map((sub) => (
              <DropdownMenuItem key={sub._id} onClick={() => selectSubject(sub._id)}>
                {sub.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Chip>{currentTerm?.name ?? t('academic.grades.term')}</Chip>
          <DropdownMenuContent align="start">
            {terms.map((term) => (
              <DropdownMenuItem key={term._id} onClick={() => selectTerm(term._id)}>
                {term.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Chip>
            {assessmentType
              ? t(`academic.assessmentTypes.${assessmentType}`)
              : t('academic.gradeReport.allTypes')}
          </Chip>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => selectAssessmentType('')}>
              {t('academic.gradeReport.allBlended')}
            </DropdownMenuItem>
            {ASSESSMENT_TYPES.map((type) => (
              <DropdownMenuItem key={type} onClick={() => selectAssessmentType(type)}>
                {t(`academic.assessmentTypes.${type}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!ready && <EmptyState title={t('academic.gradeReport.selectToView')} />}
      {isLoading && (
        <p className="text-sm text-muted-foreground">
          {t('academic.attendanceReport.loadingReport')}
        </p>
      )}
      {isError && (
        <p className="text-sm text-destructive">{t('academic.gradeReport.loadFailed')}</p>
      )}

      {report && (
        <>
          <div
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-3"
            aria-label={`Class average ${report.classAverageScore ?? 'not available'}${
              passRate === null ? '' : `, pass rate ${passRate} percent`
            }`}
          >
            <AverageRing score={report.classAverageScore} />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {t('academic.gradeReport.classAverage')}
              </p>
              <p>
                {passRate === null
                  ? t('academic.gradeReport.noScoresYet')
                  : t('academic.gradeReport.passRate', { pct: passRate })}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <DistributionBars
              distribution={report.distribution}
              activeFilter={bandFilter}
              onSelectBand={selectBand}
            />
          </div>

          <p className="text-sm font-medium text-muted-foreground">
            {bandFilter
              ? t('academic.gradeReport.gradeBandCount', {
                  band: bandFilter,
                  count: filteredStudents.length,
                })
              : t('academic.gradeReport.allStudentsCount', { count: filteredStudents.length })}
          </p>

          {report.students.length === 0 ? (
            <EmptyState title={t('academic.attendanceReport.noActiveStudents')} />
          ) : scoredCount === 0 ? (
            <EmptyState
              title={t('academic.gradeReport.noScoresYet')}
              description={t('academic.gradeReport.enterMarksDescription')}
            />
          ) : filteredStudents.length === 0 ? (
            <EmptyState
              title={t('academic.gradeReport.noStudentsWithGrade', { band: bandFilter })}
            />
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {filteredStudents.map((s) => (
                <div key={s.studentId} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.firstName} {s.lastName}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{s.admissionNo}</p>
                  </div>
                  <span className="text-sm font-semibold">{s.score ?? '—'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
