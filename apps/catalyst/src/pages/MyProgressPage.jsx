import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { fmtDate, fmtNum, fmtPct } from '@/lib/format.js';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton, Meter } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

const STATUS_VARIANT = { completed: 'success', active: 'info', dropped: 'danger' };
const STAGE_VARIANT = {
  applied: 'default',
  interviewed: 'info',
  offered: 'warning',
  joined: 'success',
  rejected: 'danger',
  withdrawn: 'danger',
};

function Stat({ id, label, value, hint, meter }) {
  return (
    <Card data-testid={`stat-${id}`}>
      <CardHeader>
        <CardTitle as="h3" className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-3xl font-semibold tracking-tight" data-testid={`stat-${id}-value`}>
          {value}
        </p>
        {meter !== undefined && <Meter value={meter} label={label} />}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function MyProgressPage() {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: ['my-progress'],
    queryFn: () => api.get('/me/progress').then((r) => r.data),
  });

  if (query.isLoading) return <ListSkeleton />;
  if (query.error) {
    const missing = query.error.response?.status === 404;
    return missing ? (
      <EmptyState title={t('me.noRecord')} description={t('me.noRecordHint')} />
    ) : (
      <ErrorNote error={query.error} onRetry={query.refetch} />
    );
  }

  const p = query.data;
  if (!p.term) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('me.progressTitle')} />
        <EmptyState title={t('me.noTerm')} description={t('me.noTermHint')} />
      </div>
    );
  }

  const { summary } = p;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('me.progressTitle')}
        description={p.term.name}
        action={
          <Badge variant={STATUS_VARIANT[p.status]} data-testid="my-status">
            {t(`training.status.${p.status}`)}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          id="attendance"
          label={t('me.attendance')}
          value={fmtPct(p.attendance.pct)}
          meter={p.attendance.pct}
          hint={t('me.attendanceHint', {
            present: p.attendance.present + p.attendance.late,
            absent: p.attendance.absent,
          })}
        />
        <Stat
          id="assignments"
          label={t('me.assignments')}
          value={fmtPct(summary.assignmentsPct)}
          meter={summary.assignmentsPct}
          hint={t('me.assignmentsHint')}
        />
        <Stat id="final" label={t('me.finalScore')} value={fmtNum(summary.finalAvg)} />
        <Stat
          id="improvement"
          label={t('me.improvement')}
          value={summary.delta === null ? '—' : t('me.marksGained', { count: summary.delta })}
          hint={t('me.improvementHint')}
        />
        <Stat id="mock" label={t('me.mock')} value={fmtNum(summary.mockScore)} />
        <Stat id="project" label={t('me.project')} value={fmtNum(summary.projectScore)} />
      </div>

      <Card data-testid="readiness-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle as="h2">{t('me.readiness')}</CardTitle>
            <Badge variant="warning">{t('common.provisional')}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight" data-testid="readiness-value">
            {fmtNum(summary.readiness.score)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('me.readinessHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('me.assignmentsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {p.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('me.noAssignments')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('me.assignmentName')}</TableHead>
                  <TableHead>{t('training.assignments.dueDate')}</TableHead>
                  <TableHead>{t('training.common.status')}</TableHead>
                  <TableHead>{t('training.assignments.score')}</TableHead>
                  <TableHead>{t('training.assignments.feedback')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.assignments.map((a) => (
                  <TableRow key={a._id} data-testid={`my-assignment-${a.title}`}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{fmtDate(a.dueDate, i18n.language)}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === 'reviewed' ? 'success' : 'default'}>
                        {t(`training.assignments.status.${a.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid="my-assignment-score">
                      {a.score === null ? '—' : `${a.score} / ${a.maxScore}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.feedback ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('me.gradesTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {p.grades.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('me.noGrades')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('me.subject')}</TableHead>
                  <TableHead>{t('me.assessment')}</TableHead>
                  <TableHead>{t('training.assignments.score')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.grades.map((g) => (
                  <TableRow key={`${g.subject?.code}-${g.assessmentType}`}>
                    <TableCell>{g.subject?.name ?? '—'}</TableCell>
                    <TableCell>{t(`me.assessmentTypes.${g.assessmentType}`)}</TableCell>
                    <TableCell>{g.score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {p.project && (
        <Card data-testid="my-project">
          <CardHeader>
            <CardTitle as="h2">{t('me.projectTitle', { name: p.project.name })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {p.project.repoUrl && (
              <a
                className="w-fit text-primary underline"
                href={p.project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {p.project.repoUrl}
              </a>
            )}
            <ul className="flex flex-col gap-1">
              {p.project.milestones.map((m) => (
                <li key={m.title} className="flex items-center gap-2">
                  <Badge variant={m.doneAt ? 'success' : 'default'}>
                    {m.doneAt ? t('me.milestoneDone') : t('me.milestoneOpen')}
                  </Badge>
                  {m.title}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('me.placementTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {p.placements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('me.noPlacements')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {p.placements.map((a) => (
                <li key={a._id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.employer}</span>
                  <span className="text-muted-foreground">{a.role}</span>
                  <Badge variant={STAGE_VARIANT[a.stage]}>{t(`training.stage.${a.stage}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t('me.placementDisclaimer')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
