import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Bell, CheckCircle2 } from 'lucide-react';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu.jsx';
import ProgressRing from '../../components/report-cards/ProgressRing.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { useAuth } from '../../contexts/useAuth.js';

const EMPTY_ARRAY = [];
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes — same safety net as before, just not the primary signal
const RESUME_KEY_PREFIX = 'rooted:report-card-job:';

// A locked/backgrounded phone can get its tab fully discarded and reloaded by the
// OS — that used to wipe all knowledge of a job that kept generating server-side
// the whole time (docs/mobile-ui/PLAN.md P12: "phone screen locks → poll dies →
// user has no idea if 25 PDFs were built"). Stashing {jobId} per section+term in
// localStorage lets a fresh mount pick the polling back up instead of losing it.
function resumeKey(sectionId, termId) {
  return `${RESUME_KEY_PREFIX}${sectionId}:${termId}`;
}

function readResumableJob(sectionId, termId) {
  if (!sectionId || !termId) return null;
  try {
    const raw = window.localStorage.getItem(resumeKey(sectionId, termId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistResumableJob(sectionId, termId, jobId) {
  try {
    window.localStorage.setItem(
      resumeKey(sectionId, termId),
      JSON.stringify({ jobId, startedAt: Date.now() })
    );
  } catch {
    // best-effort only — private browsing / storage quota shouldn't block generation
  }
}

function clearResumableJob(sectionId, termId) {
  try {
    window.localStorage.removeItem(resumeKey(sectionId, termId));
  } catch {
    // noop
  }
}

function statusBadgeVariant(status) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  return 'warning';
}

// Same chip-trigger pattern as GradeReportPage.jsx — a picker is a pill button + chevron,
// never a raw multi-option <select> (mobile-ui rule, fixes P9 for this screen).
function Chip({ children, ...props }) {
  return (
    <DropdownMenuTrigger
      className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium"
      {...props}
    >
      {children}
      <ChevronDown size={14} />
    </DropdownMenuTrigger>
  );
}

export default function ReportCardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canGenerate = (user?.permissions ?? []).includes('grades:publish');
  const [searchParams] = useSearchParams();

  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState(() => searchParams.get('sectionId') || '');
  const [termId, setTermId] = useState(() => searchParams.get('termId') || '');
  const [jobId, setJobId] = useState(null);
  const [jobState, setJobState] = useState(null);
  const [progress, setProgress] = useState(null); // { completed, total } | null
  const [resultUrl, setResultUrl] = useState(null);
  const [pollError, setPollError] = useState('');
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [reusedJob, setReusedJob] = useState(false);
  const [resumedJob, setResumedJob] = useState(false);
  const pollAttempts = useRef(0);
  const doneRef = useRef(false);

  const { classes } = useClassSections();
  const currentSection = classes
    .flatMap((c) => (c.sections || []).map((s) => ({ ...s, className: c.name })))
    .find((s) => s._id === sectionId);

  // Active academic year, same pattern as MySchedulePage.jsx / GradeReportPage.jsx.
  const { data: years = EMPTY_ARRAY } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });
  const activeYearId = years.find((y) => y.isActive)?._id ?? '';

  // Fixes P10: without ?yearId, tenants with >1 academic year get duplicate term
  // names ("Term 1, Term 2, Term 1, Term 2...") in the term chip below.
  const { data: terms = EMPTY_ARRAY } = useQuery({
    queryKey: ['terms', activeYearId],
    queryFn: () =>
      api
        .get(`/academic/terms${activeYearId ? `?yearId=${activeYearId}` : ''}`)
        .then((r) => r.data),
  });
  const currentTerm = terms.find((t) => t._id === termId);

  const historyQuery = useQuery({
    queryKey: ['report-card-history', sectionId, termId],
    queryFn: () =>
      api
        .get(`/academic/report-card/history?sectionId=${sectionId}&termId=${termId}`)
        .then((r) => r.data),
    enabled: Boolean(sectionId && termId),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post('/academic/report-card/generate', { sectionId, termId }).then((r) => r.data),
    onSuccess: (data) => {
      pollAttempts.current = 0;
      setJobId(data.jobId);
      setJobState('waiting');
      setProgress(null);
      setResultUrl(null);
      setPollError('');
      setPollTimedOut(false);
      setReusedJob(Boolean(data.existing));
      setResumedJob(false);
      persistResumableJob(sectionId, termId, data.jobId);
    },
    onError: (err) =>
      setPollError(err.response?.data?.error || t('academic.reportCards.startFailed')),
  });

  // Adjust job-tracking state when the picked section/term changes, following React's
  // "adjusting state when a prop changes" pattern (setState during render, not inside
  // an effect) rather than a useEffect — see https://react.dev/learn/you-might-not-need-an-effect.
  // A scope change always drops whatever generation card was showing (its jobId is
  // still safely persisted in localStorage for that *other* scope, so switching back
  // picks it up again), then immediately checks localStorage for a job already in
  // flight for the *new* scope — the resilience path this screen exists for (see the
  // resumeKey comment above): a locked/backgrounded phone can get its tab fully
  // discarded and reloaded by the OS, and this is what lets a fresh mount notice "there's
  // still a job running for this section/term" instead of losing track of it.
  // Sentinel (not [sectionId, termId]) so this also runs once on the very first
  // render/mount — the "remount after a possible tab discard" moment we care about.
  const [trackedScope, setTrackedScope] = useState(() => [undefined, undefined]);
  if (trackedScope[0] !== sectionId || trackedScope[1] !== termId) {
    setTrackedScope([sectionId, termId]);
    const resumable = readResumableJob(sectionId, termId);
    setJobId(resumable?.jobId ?? null);
    setJobState(resumable?.jobId ? 'active' : null);
    setProgress(null);
    setResultUrl(null);
    setPollError('');
    setPollTimedOut(false);
    setReusedJob(false);
    setResumedJob(Boolean(resumable?.jobId));
  }

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/academic/report-card/status/${jobId}`);
      setJobState(data.state);
      if (data.progress && typeof data.progress === 'object') {
        setProgress(data.progress);
      }
      if (data.state === 'completed' && data.result?.url) {
        setResultUrl(data.result.url);
        clearResumableJob(sectionId, termId);
        queryClient.invalidateQueries({ queryKey: ['report-card-history', sectionId, termId] });
      }
      if (data.state === 'failed') {
        setPollError(t('academic.reportCards.generationFailedShort'));
        clearResumableJob(sectionId, termId);
        queryClient.invalidateQueries({ queryKey: ['report-card-history', sectionId, termId] });
      }
    } catch (err) {
      if (err.response?.status === 404) {
        // The job's gone (e.g. cleaned up long after we last checked) — don't poll
        // a ghost forever, let the person start a fresh generation instead.
        clearResumableJob(sectionId, termId);
        setJobId(null);
        setJobState(null);
        setPollError(t('academic.reportCards.jobNotFound'));
        return;
      }
      setPollError(t('academic.reportCards.checkStatusFailed'));
    }
  }, [jobId, sectionId, termId, queryClient, t]);

  // Ref indirection so the interval/visibility handlers below always call the latest
  // checkStatus without needing it in their effect's dependency array. Refs must only
  // be written outside of render, so this runs as its own (dep-less) effect.
  const checkStatusRef = useRef(checkStatus);
  useEffect(() => {
    checkStatusRef.current = checkStatus;
  });

  useEffect(() => {
    doneRef.current = jobState === 'completed' || jobState === 'failed';
  }, [jobState]);

  useEffect(() => {
    if (!jobId) return undefined;
    doneRef.current = false;
    pollAttempts.current = 0;
    checkStatusRef.current();

    const interval = setInterval(() => {
      if (doneRef.current) {
        clearInterval(interval);
        return;
      }
      pollAttempts.current += 1;
      if (pollAttempts.current > MAX_POLL_ATTEMPTS) {
        setPollTimedOut(true);
        clearInterval(interval);
        return;
      }
      checkStatusRef.current();
    }, POLL_INTERVAL_MS);

    // Timers are throttled/suspended while the tab is backgrounded — the phone-
    // screen-lock failure mode — so catch up immediately once it's visible again
    // instead of waiting for the next tick.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && !doneRef.current) {
        checkStatusRef.current();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [jobId]);

  const isGenerating = Boolean(jobId) && jobState !== 'completed' && jobState !== 'failed';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('academic.reportCards.title')}</h1>
        {currentSection && currentTerm && (
          <p className="text-sm text-muted-foreground">
            {currentSection.className} - {currentSection.name} · {currentTerm.name}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <Chip>
              {currentSection
                ? `${currentSection.className}-${currentSection.name}`
                : t('academic.grades.selectSection')}
            </Chip>
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
            <Chip>{currentTerm ? currentTerm.name : t('academic.reportCards.selectTerm')}</Chip>
            <DropdownMenuContent align="start">
              {terms.map((term) => (
                <DropdownMenuItem key={term._id} onClick={() => setTermId(term._id)}>
                  {term.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {canGenerate && (
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!sectionId || !termId || generateMutation.isPending || isGenerating}
          >
            {generateMutation.isPending
              ? t('academic.reportCards.starting')
              : isGenerating
                ? t('academic.reportCards.generating')
                : t('academic.reportCards.generateButton')}
          </Button>
        )}
      </div>

      {!canGenerate && (
        <p className="text-sm text-muted-foreground">
          {t('academic.reportCards.noPermission')}{' '}
          <code className="font-mono text-xs">grades:publish</code>{' '}
          {t('academic.reportCards.noPermissionSuffix')}
        </p>
      )}

      {jobId && (
        <Card className="items-center px-4 py-6 text-center" aria-live="polite">
          {isGenerating && (
            <div className="flex flex-col items-center gap-4">
              <ProgressRing completed={progress?.completed ?? 0} total={progress?.total ?? 0} />
              <div>
                <p className="text-sm font-semibold">{t('academic.reportCards.buildingPdfs')}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {t('academic.reportCards.jobIdLabel', { jobId })}
                </p>
              </div>

              {resumedJob && (
                <p className="text-xs text-muted-foreground">
                  {t('academic.reportCards.resumedNotice')}
                </p>
              )}
              {reusedJob && (
                <p className="text-xs text-muted-foreground">
                  {t('academic.reportCards.reusedNotice')}
                </p>
              )}

              <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-left text-xs text-muted-foreground">
                <Bell size={14} className="mt-0.5 shrink-0" />
                <span>{t('academic.reportCards.leaveScreenNotice')}</span>
              </div>

              {pollTimedOut && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {t('academic.reportCards.timedOutNotice')}
                </p>
              )}
            </div>
          )}

          {jobState === 'completed' && resultUrl && (
            <div className="flex flex-col items-center gap-3">
              <div className="grid h-[110px] w-[110px] place-items-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 size={40} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-semibold">{t('academic.reportCards.readyTitle')}</p>
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                {t('academic.reportCards.downloadPdf')}
              </a>
            </div>
          )}

          {jobState === 'failed' && (
            <p className="text-sm text-destructive">{t('academic.reportCards.generationFailed')}</p>
          )}

          {pollError && <p className="text-sm text-destructive">{pollError}</p>}
        </Card>
      )}

      {sectionId && termId && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">{t('academic.reportCards.historyTitle')}</h2>
          {historyQuery.isLoading && (
            <p className="text-sm text-muted-foreground">
              {t('academic.reportCards.loadingHistory')}
            </p>
          )}
          {historyQuery.data?.length === 0 && (
            <EmptyState title={t('academic.reportCards.noHistoryEmpty')} />
          )}
          {historyQuery.data?.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      {t('academic.reportCards.columnGenerated')}
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      {t('common.status')}
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      {t('academic.reportCards.download')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyQuery.data.map((b) => (
                    <tr key={b._id} className="bg-card">
                      <td className="px-4 py-3">{new Date(b.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadgeVariant(b.status)}>{b.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {b.url ? (
                          <a
                            href={b.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t('academic.reportCards.download')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
