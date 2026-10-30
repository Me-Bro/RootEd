import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { ITEM_TYPES } from '@/lib/roadmap.js';
import { Button } from '@/components/ui/Button.jsx';
import { Input, Select, Textarea } from '@/components/ui/Input.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { ErrorNote } from '@/components/ui/Feedback.jsx';

// The one schedule field each timeline mode asks for.
const SCHEDULE = {
  dated: { key: 'dueDate', label: 'roadmap.dueDate', input: { type: 'date' } },
  daily: { key: 'dayNumber', label: 'roadmap.dayNumber', input: { type: 'number', min: 1 } },
  weekly: { key: 'weekNumber', label: 'roadmap.weekNumber', input: { type: 'number', min: 1 } },
};

/** Add (no `item`) or edit one roadmap item. `others` are the roadmap's other items. */
export function RoadmapItemForm({ roadmap, item, others, onDone, onCancel }) {
  const { t } = useTranslation();
  const schedule = SCHEDULE[roadmap.scheduleMode];
  const editing = Boolean(item);

  const [type, setType] = useState(item?.type ?? 'theory');
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [resourceUrl, setResourceUrl] = useState(item?.resourceUrl ?? '');
  const [prompt, setPrompt] = useState(item?.prompt ?? '');
  const [when, setWhen] = useState(
    schedule && item?.[schedule.key] ? String(item[schedule.key]).slice(0, 10) : ''
  );
  const [locked, setLocked] = useState(item?.locked ?? false);
  const [unlockAfter, setUnlockAfter] = useState((item?.unlockAfter ?? []).map(String));

  const save = useMutation({
    mutationFn: () => {
      // On edit an emptied field is sent as null so the server clears it.
      const text = (value) => value.trim() || (editing ? null : undefined);
      const payload = {
        type,
        title,
        body: text(body),
        resourceUrl: text(resourceUrl),
        prompt: text(prompt),
        locked,
        unlockAfter: locked ? unlockAfter : [],
      };
      if (schedule) payload[schedule.key] = schedule.input.type === 'number' ? Number(when) : when;
      return editing
        ? api.patch(`/training/roadmaps/${roadmap._id}/items/${item._id}`, payload)
        : api.post(`/training/roadmaps/${roadmap._id}/items`, payload);
    },
    onSuccess: onDone,
  });

  const toggle = (id) =>
    setUnlockAfter((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Card data-testid="item-form">
      <CardHeader>
        <CardTitle as="h3">{editing ? t('roadmap.editItem') : t('roadmap.addItem')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Select label={t('roadmap.type')} value={type} onChange={(e) => setType(e.target.value)}>
            {ITEM_TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`roadmap.types.${k}`)}
              </option>
            ))}
          </Select>
          <Input
            label={t('roadmap.titleLabel')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
          {schedule && (
            <Input
              label={t(schedule.label)}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
              {...schedule.input}
            />
          )}
          <Input
            label={t('roadmap.resourceUrl')}
            type="url"
            value={resourceUrl}
            onChange={(e) => setResourceUrl(e.target.value)}
            placeholder="https://"
          />
          <div className="sm:col-span-2">
            <Textarea
              label={t('roadmap.body')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={10000}
            />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              label={t('roadmap.prompt')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => setLocked(e.target.checked)}
              />
              {t('roadmap.locked')}
            </label>
            {locked && (
              <fieldset className="flex flex-col gap-1 rounded-lg border border-border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">
                  {t('roadmap.unlockAfter')}
                </legend>
                {others.map((o) => (
                  <label key={o._id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={unlockAfter.includes(String(o._id))}
                      onChange={() => toggle(String(o._id))}
                    />
                    {o.title}
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">{t('roadmap.manualHold')}</p>
              </fieldset>
            )}
          </div>

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {t('roadmap.saveItem')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
        {save.error && <ErrorNote error={save.error} />}
      </CardContent>
    </Card>
  );
}
