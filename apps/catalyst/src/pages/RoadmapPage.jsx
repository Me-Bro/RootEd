import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import api from '@/lib/api.js';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission } from '@/lib/access.js';
import { SCHEDULE_MODES, TYPE_VARIANT, scheduleLabel } from '@/lib/roadmap.js';
import { useBatch } from '@/hooks/useBatch.js';
import { BatchGate, BatchPicker } from '@/components/BatchPicker.jsx';
import { RoadmapItemForm } from '@/components/roadmap/RoadmapItemForm.jsx';
import { RoadmapProgressTable } from '@/components/roadmap/RoadmapProgressTable.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Input, Select, Textarea } from '@/components/ui/Input.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton, Spinner } from '@/components/ui/Feedback.jsx';

function NewRoadmapForm({ batch, onCreated }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleMode, setScheduleMode] = useState('weekly');

  const create = useMutation({
    mutationFn: () =>
      api
        .post('/training/roadmaps', {
          sectionId: batch.sectionId,
          termId: batch.termId,
          title,
          scheduleMode,
          ...(description.trim() ? { description } : {}),
        })
        .then((r) => r.data),
    onSuccess: (roadmap) => {
      setTitle('');
      setDescription('');
      onCreated(roadmap);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('roadmap.newRoadmap')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            label={t('roadmap.titleLabel')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
          <Select
            label={t('roadmap.mode')}
            value={scheduleMode}
            onChange={(e) => setScheduleMode(e.target.value)}
          >
            {SCHEDULE_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`roadmap.modes.${m}`)}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Textarea
              label={t('roadmap.descriptionLabel')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {t('roadmap.create')}
            </Button>
          </div>
        </form>
        {create.error && <ErrorNote error={create.error} />}
      </CardContent>
    </Card>
  );
}

function ItemRow({ item, index, items, roadmap, canWrite, onMove, onEdit, onRemove }) {
  const { t, i18n } = useTranslation();
  const titleOf = (id) => items.find((i) => String(i._id) === String(id))?.title ?? '?';
  const when = scheduleLabel(item, roadmap.scheduleMode, t, i18n.language);

  return (
    <li
      className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-3"
      data-testid={`item-${item.title}`}
    >
      <span className="w-6 pt-0.5 text-sm text-muted-foreground">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={TYPE_VARIANT[item.type]}>{t(`roadmap.types.${item.type}`)}</Badge>
          <span className="font-medium">{item.title}</span>
          {when && <span className="text-xs text-muted-foreground">{when}</span>}
          {item.locked && <Badge variant="warning">{t('roadmap.lockedBadge')}</Badge>}
        </div>
        {item.locked && (
          <p className="mt-1 text-xs text-muted-foreground">
            {item.unlockAfter?.length
              ? t('roadmap.waitsFor', { titles: item.unlockAfter.map(titleOf).join(', ') })
              : t('roadmap.heldByMentor')}
          </p>
        )}
      </div>
      {canWrite && (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={index === 0}
            aria-label={t('roadmap.moveUp', { title: item.title })}
            onClick={() => onMove(index, -1)}
          >
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={index === items.length - 1}
            aria-label={t('roadmap.moveDown', { title: item.title })}
            onClick={() => onMove(index, 1)}
          >
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={t('roadmap.editFor', { title: item.title })}
            onClick={() => onEdit(item)}
          >
            {t('roadmap.edit')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            aria-label={t('roadmap.removeFor', { title: item.title })}
            onClick={() => onRemove(item)}
          >
            {t('roadmap.remove')}
          </Button>
        </div>
      )}
    </li>
  );
}

function RoadmapEditor({ roadmapId, canWrite, onDeleted }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // `null` = closed, `{}` = adding, an item = editing it.
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('items');

  const query = useQuery({
    queryKey: ['roadmap', roadmapId],
    queryFn: () => api.get(`/training/roadmaps/${roadmapId}`).then((r) => r.data),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['roadmap', roadmapId] });
    queryClient.invalidateQueries({ queryKey: ['roadmaps'] });
  };

  const publish = useMutation({
    mutationFn: (published) => api.patch(`/training/roadmaps/${roadmapId}`, { published }),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (itemIds) => api.put(`/training/roadmaps/${roadmapId}/items/order`, { itemIds }),
    onSuccess: refresh,
  });
  const removeItem = useMutation({
    mutationFn: (item) => api.delete(`/training/roadmaps/${roadmapId}/items/${item._id}`),
    onSuccess: refresh,
  });
  const removeRoadmap = useMutation({
    mutationFn: () => api.delete(`/training/roadmaps/${roadmapId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmaps'] });
      onDeleted();
    },
  });

  if (query.isLoading) return <Spinner />;
  if (query.error) return <ErrorNote error={query.error} onRetry={query.refetch} />;

  const roadmap = query.data;
  const items = roadmap.items;
  const move = (index, delta) => {
    const ids = items.map((i) => i._id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    reorder.mutate(ids);
  };
  const done = () => {
    setEditing(null);
    refresh();
  };
  const mutationError = publish.error || reorder.error || removeItem.error || removeRoadmap.error;

  return (
    <Card data-testid="roadmap-editor">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h2">{roadmap.title}</CardTitle>
          <Badge>{t(`roadmap.modes.${roadmap.scheduleMode}`)}</Badge>
          <Badge variant={roadmap.published ? 'success' : 'default'} data-testid="roadmap-state">
            {roadmap.published ? t('roadmap.published') : t('roadmap.draft')}
          </Badge>
          {canWrite && (
            <span className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={publish.isPending}
                onClick={() => publish.mutate(!roadmap.published)}
              >
                {roadmap.published ? t('roadmap.unpublish') : t('roadmap.publish')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => window.confirm(t('roadmap.confirmDelete')) && removeRoadmap.mutate()}
              >
                {t('roadmap.delete')}
              </Button>
            </span>
          )}
        </div>
        {roadmap.description && (
          <p className="text-sm text-muted-foreground">{roadmap.description}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mutationError && <ErrorNote error={mutationError} />}
        <div className="flex gap-2">
          {['items', 'progress'].map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'default' : 'outline'}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {t(v === 'items' ? 'roadmap.viewItems' : 'roadmap.viewProgress')}
            </Button>
          ))}
        </div>
        {view === 'progress' && <RoadmapProgressTable roadmapId={roadmapId} />}
        {view === 'items' && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t('roadmap.items')}</h3>
              {canWrite && !editing && (
                <Button size="sm" onClick={() => setEditing({})}>
                  {t('roadmap.addItem')}
                </Button>
              )}
            </div>
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('roadmap.noItems')}</p>
            )}
            {items.length > 0 && (
              <ol className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <ItemRow
                    key={item._id}
                    item={item}
                    index={index}
                    items={items}
                    roadmap={roadmap}
                    canWrite={canWrite}
                    onMove={move}
                    onEdit={setEditing}
                    onRemove={(i) =>
                      window.confirm(t('roadmap.confirmRemove')) && removeItem.mutate(i)
                    }
                  />
                ))}
              </ol>
            )}
            {editing && (
              <RoadmapItemForm
                key={editing._id ?? 'new'}
                roadmap={roadmap}
                item={editing._id ? editing : null}
                others={items.filter((i) => i._id !== editing._id)}
                onDone={done}
                onCancel={() => setEditing(null)}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function RoadmapPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'training:write');
  const batch = useBatch();
  const queryClient = useQueryClient();
  const [pickedId, setPickedId] = useState(null);

  const listQuery = useQuery({
    queryKey: ['roadmaps', batch.sectionId, batch.termId],
    queryFn: () =>
      api
        .get('/training/roadmaps', { params: { sectionId: batch.sectionId, termId: batch.termId } })
        .then((r) => r.data),
    enabled: batch.ready,
  });

  const roadmaps = listQuery.data ?? [];
  const selected = roadmaps.find((r) => r._id === pickedId) ?? roadmaps[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('roadmap.title')} description={t('roadmap.description')} />
      <BatchGate batch={batch}>
        <BatchPicker batch={batch} />
        {canWrite && (
          <NewRoadmapForm
            batch={batch}
            onCreated={(r) => {
              queryClient.invalidateQueries({ queryKey: ['roadmaps'] });
              setPickedId(r._id);
            }}
          />
        )}

        {listQuery.isLoading && <ListSkeleton rows={3} />}
        {listQuery.error && <ErrorNote error={listQuery.error} onRetry={listQuery.refetch} />}
        {listQuery.data && roadmaps.length === 0 && (
          <EmptyState title={t('roadmap.none')} description={t('roadmap.noneHint')} />
        )}
        {roadmaps.length > 1 && (
          <div className="max-w-sm">
            <Select
              label={t('roadmap.pick')}
              value={selected?._id ?? ''}
              onChange={(e) => setPickedId(e.target.value)}
            >
              {roadmaps.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.title}
                </option>
              ))}
            </Select>
          </div>
        )}
        {selected && (
          <RoadmapEditor
            key={selected._id}
            roadmapId={selected._id}
            canWrite={canWrite}
            onDeleted={() => setPickedId(null)}
          />
        )}
      </BatchGate>
    </div>
  );
}
