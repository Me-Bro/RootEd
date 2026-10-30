import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
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
import DefaulterRing from '../../components/attendance-report/DefaulterRing.jsx';
import CallRow from '../../components/attendance-report/CallRow.jsx';
import ShareSummaryCard from '../../components/attendance-report/ShareSummaryCard.jsx';

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
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [sectionId, setSectionId] = useState(searchParams.get('sectionId') || '');
  const [subjectId, setSubjectId] = useState(searchParams.get('subjectId') || '');
  const [from, setFrom] = useState(searchParams.get('from') || defaultFrom);
  const [to, setTo] = useState(() => searchParams.get('to') || isoDate(new Date()));

  const { classes } = useClassSections();
  const currentSection = classes
    .flatMap((c) => (c.sections || []).map((s) => ({ ...s, className: c.name })))
    .find((s) => s._id === sectionId);
  const classId = classes.find((c) => (c.sections || []).some((s) => s._id === sectionId))?._id;

  const { data: subjects = EMPTY_ARRAY } = useQuery({
    queryKey: ['subjects', classId],
    queryFn: () => api.get(`/academic/subjects?classId=${classId}`).then((r) => r.data),
    enabled: Boolean(classId),
  });
  const currentSubject = subjects.find((s) => s._id === subjectId);

  const {
    data: report,
    isLoading,
    isError,
    refetch,
    isFetching,
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

  const sortedStudents = useMemo(() => {
    if (!report) return EMPTY_ARRAY;
    // Worst attendance first — the whole point of this screen is triage, not
    // an alphabetical roster. Students with no attendance history (pct ===
    // null) sort last, same rule as Attendance's smart sort.
    return [...report.students].sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
  }, [report]);

  const defaulterCount = useMemo(
    () => (report ? report.students.filter((s) => s.isDefaulter).length : 0),
    [report]
  );

  function handleCall(student) {
    window.location.href = `tel:${student.guardianPhone}`;
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader title={t('academic.attendanceReport.title')} />

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium">
            {currentSection
              ? `${currentSection.className} - ${currentSection.name}`
              : t('academic.attendanceReport.selectSection')}
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {classes.map((c) => (
              <DropdownMenuGroup key={c._id}>
                <DropdownMenuLabel>{c.name}</DropdownMenuLabel>
                {(c.sections || []).map((s) => (
                  <DropdownMenuItem
                    key={s._id}
                    onClick={() => {
                      setSectionId(s._id);
                      setSubjectId('');
                    }}
                  >
                    {c.name} - {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={!sectionId}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {currentSubject ? currentSubject.name : t('academic.attendanceReport.allSubjects')}
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSubjectId('')}>
              {t('academic.attendanceReport.allSubjects')}
            </DropdownMenuItem>
            {subjects.map((sub) => (
              <DropdownMenuItem key={sub._id} onClick={() => setSubjectId(sub._id)}>
                {sub.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1">
          <label className="sr-only" htmlFor="attendance-report-from">
            {t('academic.attendanceReport.from')}
          </label>
          <input
            id="attendance-report-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[124px] border-none bg-transparent text-xs outline-none"
          />
          <span className="text-xs text-muted-foreground">
            {t('academic.attendanceReport.toConnector')}
          </span>
          <label className="sr-only" htmlFor="attendance-report-to">
            {t('academic.attendanceReport.to')}
          </label>
          <input
            id="attendance-report-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-[124px] border-none bg-transparent text-xs outline-none"
          />
        </div>
      </div>

      {!sectionId && <EmptyState title={t('academic.attendanceReport.selectSectionEmpty')} />}

      {sectionId && isLoading && (
        <p className="text-sm text-muted-foreground">
          {t('academic.attendanceReport.loadingReport')}
        </p>
      )}

      {sectionId && isError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{t('academic.attendanceReport.loadFailed')}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching
              ? t('academic.attendanceReport.retrying')
              : t('academic.attendanceReport.retry')}
          </Button>
        </div>
      )}

      {report && report.students.length === 0 && (
        <EmptyState title={t('academic.attendanceReport.noActiveStudents')} />
      )}

      {report && report.students.length > 0 && (
        <>
          <DefaulterRing
            classAveragePct={report.classAveragePct}
            thresholdPct={report.thresholdPct}
            defaulterCount={defaulterCount}
          />

          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {sortedStudents.map((s) => (
              <CallRow key={s.studentId} student={s} onCall={handleCall} />
            ))}
          </div>

          <div className="sticky bottom-0 z-10 -mx-6 flex gap-2 border-t border-border bg-card p-3">
            <ShareSummaryCard report={report} />
            <Button variant="outline" onClick={() => downloadCsv(report)}>
              {t('academic.attendanceReport.exportCsv')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
