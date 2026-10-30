import { useState } from 'react';
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
import { Input, Textarea } from '@/components/ui/Input.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton } from '@/components/ui/Feedback.jsx';

function NewProjectForm({ batch, roster, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [members, setMembers] = useState([]);

  const create = useMutation({
    mutationFn: () =>
      api.post('/training/projects', {
        sectionId: batch.sectionId,
        termId: batch.termId,
        name,
        ...(repoUrl ? { repoUrl } : {}),
        memberIds: members,
      }),
    onSuccess: () => {
      setName('');
      setRepoUrl('');
      setMembers([]);
      onCreated();
    },
  });

  const toggle = (id) =>
    setMembers((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id]
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('training.projects.new')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t('training.projects.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label={t('training.projects.repo')}
              type="url"
              placeholder="https://github.com/…"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t('training.projects.team')}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {roster.map(({ student }) => (
                <label key={student._id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={members.includes(student._id)}
                    onChange={() => toggle(student._id)}
                  />
                  {fullName(student)}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Button type="submit" disabled={create.isPending}>
              {t('training.projects.create')}
            </Button>
          </div>
        </form>
        {create.error && <ErrorNote error={create.error} />}
      </CardContent>
    </Card>
  );
}

function ProjectCard({ project, roster, canWrite, onChanged }) {
  const { t, i18n } = useTranslation();
  const [score, setScore] = useState(project.reviewScore ?? '');
  const [notes, setNotes] = useState(project.reviewNotes ?? '');
  const [milestone, setMilestone] = useState('');

  const patch = useMutation({
    mutationFn: (body) => api.patch(`/training/projects/${project._id}`, body),
    onSuccess: onChanged,
  });

  const names = project.memberIds
    .map((id) => roster.find((r) => r.student._id === id)?.student)
    .filter(Boolean)
    .map(fullName);

  // The API stores milestones as one list, so every edit sends the whole list.
  const withMilestones = (next) =>
    patch.mutate({
      milestones: next.map((m) => ({
        title: m.title,
        ...(m.dueDate ? { dueDate: m.dueDate } : {}),
        ...(m.doneAt ? { doneAt: m.doneAt } : {}),
      })),
    });

  const toggleDone = (index) =>
    withMilestones(
      project.milestones.map((m, i) =>
        i === index ? { ...m, doneAt: m.doneAt ? null : new Date().toISOString() } : m
      )
    );

  return (
    <Card data-testid={`project-${project.name}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h3">{project.name}</CardTitle>
          {project.reviewScore !== null && project.reviewScore !== undefined ? (
            <Badge variant="success">
              {t('training.projects.reviewed', { score: project.reviewScore })}
            </Badge>
          ) : (
            <Badge>{t('training.projects.notReviewed')}</Badge>
          )}
        </div>
        {project.repoUrl && (
          <a
            className="w-fit text-xs text-primary underline"
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {project.repoUrl}
          </a>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">
          <span className="text-muted-foreground">{t('training.projects.team')}: </span>
          {names.length ? names.join(', ') : '—'}
        </p>
        {project.demoDate && (
          <p className="text-sm text-muted-foreground">
            {t('training.projects.demo', { date: fmtDate(project.demoDate, i18n.language) })}
          </p>
        )}

        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t('training.projects.milestones')}
          </h4>
          {project.milestones.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('training.projects.noMilestones')}</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {project.milestones.map((m, index) => (
              <li key={`${m.title}-${index}`} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(m.doneAt)}
                    disabled={!canWrite || patch.isPending}
                    onChange={() => toggleDone(index)}
                  />
                  <span className={m.doneAt ? 'line-through' : ''}>{m.title}</span>
                </label>
                {m.dueDate && (
                  <span className="text-xs text-muted-foreground">
                    {t('training.projects.due', { date: fmtDate(m.dueDate, i18n.language) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canWrite && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!milestone.trim()) return;
                withMilestones([...project.milestones, { title: milestone.trim() }]);
                setMilestone('');
              }}
            >
              <input
                aria-label={t('training.projects.addMilestone')}
                placeholder={t('training.projects.addMilestone')}
                className="h-8 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
                value={milestone}
                onChange={(e) => setMilestone(e.target.value)}
              />
              <Button size="sm" variant="outline" type="submit">
                {t('training.projects.add')}
              </Button>
            </form>
          )}
        </div>

        {canWrite && (
          <form
            className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              patch.mutate({
                reviewScore: score === '' ? null : Number(score),
                reviewNotes: notes,
              });
            }}
          >
            <Input
              label={t('training.projects.reviewScore')}
              type="number"
              min="0"
              max="100"
              step="any"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
            <Textarea
              label={t('training.projects.reviewNotes')}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex items-end">
              <Button type="submit" variant="outline" disabled={patch.isPending}>
                {t('training.projects.saveReview')}
              </Button>
            </div>
          </form>
        )}
        {patch.error && <ErrorNote error={patch.error} />}
        {!canWrite && project.reviewNotes && (
          <p className="text-sm text-muted-foreground">{project.reviewNotes}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'training:write');
  const batch = useBatch();
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ['training-projects', batch.sectionId, batch.termId],
    queryFn: () =>
      api
        .get('/training/projects', { params: { sectionId: batch.sectionId, termId: batch.termId } })
        .then((r) => r.data),
    enabled: batch.ready,
  });
  const rosterQuery = useQuery({
    queryKey: ['training-roster', batch.sectionId],
    queryFn: () =>
      api
        .get('/training/enrollments', { params: { sectionId: batch.sectionId } })
        .then((r) => r.data),
    enabled: batch.ready,
  });
  const roster = (rosterQuery.data ?? []).filter((r) => r.status !== 'dropped');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['training-projects'] });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('training.projects.title')}
        description={t('training.projects.description')}
      />
      <BatchGate batch={batch}>
        <BatchPicker batch={batch} />
        {canWrite && <NewProjectForm batch={batch} roster={roster} onCreated={refresh} />}
        {projectsQuery.isLoading && <ListSkeleton />}
        {projectsQuery.error && (
          <ErrorNote error={projectsQuery.error} onRetry={projectsQuery.refetch} />
        )}
        {projectsQuery.data?.length === 0 && (
          <EmptyState
            title={t('training.projects.none')}
            description={t('training.projects.noneHint')}
          />
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {projectsQuery.data?.map((project) => (
            <ProjectCard
              key={project._id}
              project={project}
              roster={rosterQuery.data ?? []}
              canWrite={canWrite}
              onChanged={refresh}
            />
          ))}
        </div>
      </BatchGate>
    </div>
  );
}
