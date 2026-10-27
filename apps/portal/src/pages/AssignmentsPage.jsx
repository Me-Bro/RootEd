import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission } from '@/lib/access.js';
import { fmtDate, fullName } from '@/lib/format.js';
import { useBatch } from '@/hooks/useBatch.js';
import { BatchGate, BatchPicker } from '@/components/BatchPicker.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Input, Select } from '@/components/ui/Input.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

const STATUSES = ['pending', 'submitted', 'reviewed'];

function NewAssignmentForm({ batch, subjects, subjectsLoaded, onCreated }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [maxScore, setMaxScore] = useState('10');

  const create = useMutation({
    mutationFn: () =>
      api.post('/training/assignments', {
        sectionId: batch.sectionId,
        termId: batch.termId,
        subjectId: subjectId || subjects[0]?._id,
        title,
        dueDate,
        maxScore: Number(maxScore),
      }),
    onSuccess: () => {
      setTitle('');
      onCreated();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('training.assignments.new')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="lg:col-span-2">
            <Input
              label={t('training.assignments.titleLabel')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <Select
            label={t('training.assignments.subject')}
            value={subjectId || subjects[0]?._id || ''}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input
            label={t('training.assignments.dueDate')}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
          <Input
            label={t('training.assignments.maxScore')}
            type="number"
            min="1"
            step="any"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            required
          />
          <div className="flex items-end sm:col-span-2 lg:col-span-5">
            <Button type="submit" disabled={create.isPending || subjects.length === 0}>
              {t('training.assignments.create')}
            </Button>
          </div>
        </form>
        {create.error && <ErrorNote error={create.error} />}
        {subjectsLoaded && subjects.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t('setup.needSubject')}{' '}
            <Link to="/setup" className="font-medium underline">
              {t('setup.goSetup')}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreRow({ assignment, row, canWrite }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const saved = row.submission;
  const [status, setStatus] = useState(saved?.status ?? 'pending');
  const [score, setScore] = useState(saved?.score ?? '');
  const [feedback, setFeedback] = useState(saved?.feedback ?? '');

  const save = useMutation({
    mutationFn: () =>
      api.put(`/training/assignments/${assignment._id}/submissions/${row.student._id}`, {
        status,
        ...(status === 'reviewed' ? { score: Number(score) } : {}),
        ...(feedback ? { feedback } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-submissions', assignment._id] });
      queryClient.invalidateQueries({ queryKey: ['training-assignments'] });
    },
  });

  const name = fullName(row.student);
  return (
    <TableRow data-testid={`score-row-${row.student.admissionNo}`}>
      <TableCell>
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{row.student.admissionNo}</div>
      </TableCell>
      <TableCell>
        <select
          aria-label={t('training.assignments.statusFor', { name })}
          className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
          value={status}
          disabled={!canWrite}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`training.assignments.status.${s}`)}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <input
          aria-label={t('training.assignments.scoreFor', { name })}
          type="number"
          min="0"
          max={assignment.maxScore}
          step="any"
          className="h-8 w-20 rounded-lg border border-input bg-card px-2 text-sm disabled:opacity-50"
          value={score}
          disabled={!canWrite || status !== 'reviewed'}
          onChange={(e) => setScore(e.target.value)}
        />
        <span className="ml-1 text-xs text-muted-foreground">/ {assignment.maxScore}</span>
      </TableCell>
      <TableCell>
        <input
          aria-label={t('training.assignments.feedbackFor', { name })}
          className="h-8 w-full min-w-40 rounded-lg border border-input bg-card px-2 text-sm"
          value={feedback}
          disabled={!canWrite}
          onChange={(e) => setFeedback(e.target.value)}
        />
        {save.error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {save.error.response?.data?.error ?? t('common.error')}
          </p>
        )}
      </TableCell>
      <TableCell>
        {canWrite && (
          <Button
            size="sm"
            variant="outline"
            disabled={save.isPending || (status === 'reviewed' && score === '')}
            onClick={() => save.mutate()}
            aria-label={t('training.assignments.saveFor', { name })}
          >
            {save.isSuccess && !save.isPending ? t('training.assignments.saved') : t('common.save')}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function ScoringGrid({ assignment, canWrite }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['training-submissions', assignment._id],
    queryFn: () =>
      api.get(`/training/assignments/${assignment._id}/submissions`).then((r) => r.data),
  });

  return (
    <Card data-testid="scoring-grid">
      <CardHeader>
        <CardTitle as="h2">
          {t('training.assignments.scoring', { title: assignment.title })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading && <ListSkeleton />}
        {query.error && <ErrorNote error={query.error} onRetry={query.refetch} />}
        {query.data?.length === 0 && <EmptyState title={t('training.assignments.noStudents')} />}
        {query.data?.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('training.common.student')}</TableHead>
                <TableHead>{t('training.assignments.statusLabel')}</TableHead>
                <TableHead>{t('training.assignments.score')}</TableHead>
                <TableHead>{t('training.assignments.feedback')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('common.save')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((row) => (
                <ScoreRow
                  key={row.student._id}
                  assignment={assignment}
                  row={row}
                  canWrite={canWrite}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function AssignmentsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'training:write');
  const batch = useBatch();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState(null);

  const subjectsQuery = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });
  const subjects = subjectsQuery.data ?? [];
  const subjectName = (id) => subjects.find((s) => s._id === id)?.name ?? '—';

  const teachersQuery = useQuery({
    queryKey: ['subject-teachers', batch.sectionId, batch.termId],
    queryFn: () =>
      api
        .get('/academic/subject-teachers', {
          params: { sectionId: batch.sectionId, termId: batch.termId },
        })
        .then((r) => r.data),
    enabled: batch.ready,
  });
  const teacherName = (subjectId) => {
    const teacher = teachersQuery.data?.find((a) => a.subjectId === subjectId)?.teacher;
    return teacher ? fullName(teacher) || teacher.email : null;
  };

  const listQuery = useQuery({
    queryKey: ['training-assignments', batch.sectionId, batch.termId],
    queryFn: () =>
      api
        .get('/training/assignments', {
          params: { sectionId: batch.sectionId, termId: batch.termId },
        })
        .then((r) => r.data),
    enabled: batch.ready,
  });

  const open = listQuery.data?.find((a) => a._id === openId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('training.assignments.title')}
        description={t('training.assignments.description')}
      />
      <BatchGate batch={batch}>
        <BatchPicker batch={batch} />
        {canWrite && (
          <NewAssignmentForm
            batch={batch}
            subjects={subjects}
            subjectsLoaded={subjectsQuery.isSuccess}
            onCreated={() => queryClient.invalidateQueries({ queryKey: ['training-assignments'] })}
          />
        )}

        {listQuery.isLoading && <ListSkeleton rows={3} />}
        {listQuery.error && <ErrorNote error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.data?.length === 0 && (
          <EmptyState
            title={t('training.assignments.none')}
            description={t('training.assignments.noneHint')}
          />
        )}
        {listQuery.data?.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('training.assignments.titleLabel')}</TableHead>
                    <TableHead>{t('training.assignments.subject')}</TableHead>
                    <TableHead>{t('training.assignments.dueDate')}</TableHead>
                    <TableHead>{t('training.assignments.maxScore')}</TableHead>
                    <TableHead>{t('training.assignments.progress')}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t('training.assignments.open')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((a) => (
                    <TableRow key={a._id} data-testid={`assignment-${a.title}`}>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell>
                        {subjectName(a.subjectId)}
                        {teacherName(a.subjectId) && (
                          <div className="text-xs text-muted-foreground">
                            {teacherName(a.subjectId)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{fmtDate(a.dueDate, i18n.language)}</TableCell>
                      <TableCell>{a.maxScore}</TableCell>
                      <TableCell>
                        <span className="flex gap-1.5">
                          <Badge variant="success">
                            {t('training.assignments.reviewedCount', { count: a.counts.reviewed })}
                          </Badge>
                          <Badge variant="info">
                            {t('training.assignments.submittedCount', {
                              count: a.counts.submitted,
                            })}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={t('training.assignments.openFor', { title: a.title })}
                          onClick={() => setOpenId(a._id === openId ? null : a._id)}
                        >
                          {a._id === openId ? t('common.close') : t('training.assignments.open')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {open && <ScoringGrid assignment={open} canWrite={canWrite} />}
      </BatchGate>
    </div>
  );
}
