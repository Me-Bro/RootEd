import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Lock } from 'lucide-react';
import api from '@/lib/api.js';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission } from '@/lib/access.js';
import { TYPE_VARIANT, nextUp, scheduleLabel } from '@/lib/roadmap.js';
import { ProgressSummary } from '@/components/roadmap/ProgressSummary.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Input, Textarea } from '@/components/ui/Input.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton } from '@/components/ui/Feedback.jsx';

// A link is only ever rendered as an anchor when it is plain http(s); the API
// refuses anything else, this is the second lock on the same door.
const isWebLink = (url) => /^https?:\/\//i.test(url ?? '');

function MyItem({ item, mode, canWrite }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState(item.answer ?? '');
  const [linkUrl, setLinkUrl] = useState(item.linkUrl ?? '');

  const send = useMutation({
    mutationFn: (body) => api.put(`/me/roadmap/items/${item._id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-roadmap'] }),
  });

  const when = scheduleLabel(item, mode, t, i18n.language);
  const closed = !item.open;

  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
      data-testid={`my-item-${item.title}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={TYPE_VARIANT[item.type]}>{t(`roadmap.types.${item.type}`)}</Badge>
        <h3 className="font-medium">{item.title}</h3>
        {when && <span className="text-xs text-muted-foreground">{when}</span>}
        {closed && (
          <Badge variant="warning">
            <Lock className="mr-1 size-3" aria-hidden="true" />
            {t('roadmap.lockedBadge')}
          </Badge>
        )}
        <span className="ml-auto">
          {canWrite && (
            <Button
              size="sm"
              variant={item.completed ? 'default' : 'outline'}
              aria-pressed={item.completed}
              aria-label={t('myRoadmap.completeFor', { title: item.title })}
              disabled={send.isPending || (closed && !item.completed)}
              onClick={() => send.mutate({ completed: !item.completed })}
            >
              {item.completed && <Check className="size-3.5" aria-hidden="true" />}
              {item.completed ? t('myRoadmap.done') : t('myRoadmap.markComplete')}
            </Button>
          )}
          {!canWrite && item.completed && <Badge variant="success">{t('myRoadmap.done')}</Badge>}
        </span>
      </div>

      {closed && (
        <p className="text-sm text-muted-foreground" data-testid="locked-reason">
          {item.waitingOn.length
            ? t('myRoadmap.unlockWhen', { titles: item.waitingOn.join(', ') })
            : t('roadmap.heldByMentor')}
        </p>
      )}

      {item.open && (
        <>
          {item.body && <p className="text-sm whitespace-pre-wrap">{item.body}</p>}
          {isWebLink(item.resourceUrl) && (
            <a
              className="w-fit text-sm text-primary underline"
              href={item.resourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('myRoadmap.openResource')}
            </a>
          )}
          {canWrite && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate({
                  answer,
                  ...(item.type === 'assignment' ? { linkUrl: linkUrl.trim() || null } : {}),
                });
              }}
            >
              <Textarea
                label={item.prompt || t('myRoadmap.answerLabel')}
                value={answer}
                maxLength={5000}
                onChange={(e) => setAnswer(e.target.value)}
              />
              {item.type === 'assignment' && (
                <Input
                  label={t('myRoadmap.linkLabel')}
                  type="url"
                  placeholder="https://"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
              )}
              <div>
                <Button type="submit" size="sm" variant="outline" disabled={send.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          )}
          {!canWrite && item.answer && <p className="text-sm whitespace-pre-wrap">{item.answer}</p>}
        </>
      )}
      {send.error && <ErrorNote error={send.error} />}
    </li>
  );
}

export default function MyRoadmapPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'self:training:write');

  const query = useQuery({
    queryKey: ['my-roadmap'],
    queryFn: () => api.get('/me/roadmap').then((r) => r.data),
  });

  if (query.isLoading) return <ListSkeleton />;
  if (query.error) {
    return query.error.response?.status === 404 ? (
      <EmptyState title={t('me.noRecord')} description={t('me.noRecordHint')} />
    ) : (
      <ErrorNote error={query.error} onRetry={query.refetch} />
    );
  }

  const { roadmaps, summary } = query.data;
  const next = nextUp(roadmaps);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('myRoadmap.title')} description={t('myRoadmap.description')} />
      {roadmaps.length > 0 && <ProgressSummary summary={summary} />}
      {next && (
        <p className="rounded-lg bg-primary/10 p-3 text-sm font-medium" data-testid="next-up">
          {t('myRoadmap.nextUp', { title: next.item.title })}
        </p>
      )}
      {!next && summary.total > 0 && summary.completed === summary.total && (
        <p className="rounded-lg bg-success/15 p-3 text-sm font-medium" data-testid="all-done">
          {t('myRoadmap.allDone')}
        </p>
      )}
      {roadmaps.length === 0 && (
        <EmptyState title={t('myRoadmap.none')} description={t('myRoadmap.noneHint')} />
      )}
      {roadmaps.map((roadmap) => (
        <Card key={roadmap._id} data-testid={`my-roadmap-${roadmap.title}`}>
          <CardHeader>
            <CardTitle as="h2">{roadmap.title}</CardTitle>
            {roadmap.description && (
              <p className="text-sm text-muted-foreground">{roadmap.description}</p>
            )}
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {roadmap.items.map((item) => (
                <MyItem
                  key={item._id}
                  item={item}
                  mode={roadmap.scheduleMode}
                  canWrite={canWrite}
                />
              ))}
            </ol>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
