import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { LoadError } from '../ui/LoadError.jsx';
import { formatDateTime } from '../../utils/intl.js';
import { HISTORY_TYPES, editChanges, historyMessage } from '../../utils/studentHistory.js';

const PAGE_SIZE = 15;
const prefix = 'studyCenter.studentHistory';

/**
 * Everything done to or for a learner, newest first: edits with what changed, visits,
 * seats, payments and plan changes, each with who did it. Read from the audit log, so
 * a change can take a few seconds to show up.
 */
export default function StudentHistoryTimeline({ studentId }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['student-history', studentId, type, page],
    queryFn: () =>
      api
        .get(`/academic/students/${studentId}/history`, {
          params: { page, limit: PAGE_SIZE, ...(type ? { type } : {}) },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const fieldLabel = (f) => t(`${prefix}.fields.${f}`, { defaultValue: f });
  const labels = {
    field: fieldLabel,
    method: (m) => t(`studyCenter.studentBilling.methods.${m}`, { defaultValue: m ?? '—' }),
    cycle: (c) => t(c === 'weekly' ? 'studyCenter.plan.weekly' : 'studyCenter.plan.monthly'),
  };

  const entries = data?.entries ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {['', ...HISTORY_TYPES].map((value) => (
          <Button
            key={value || 'all'}
            size="sm"
            variant={type === value ? 'default' : 'outline'}
            aria-pressed={type === value}
            onClick={() => {
              setType(value);
              setPage(1);
            }}
          >
            {t(`${prefix}.types.${value || 'all'}`)}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          {t(`${prefix}.refresh`)}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t(`${prefix}.delayNote`)}</p>

      {isError ? (
        <LoadError onRetry={refetch} />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(`${prefix}.none`)}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => {
            const { key, params } = historyMessage(entry, labels);
            const changes = editChanges(entry, fieldLabel);
            return (
              <li key={entry._id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <p>{t(key, params)}</p>
                {changes.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {changes.map((c) => (
                      <li key={c.field}>
                        {t(`${prefix}.change`, {
                          label: c.label,
                          before: c.before,
                          after: c.after,
                        })}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(entry.at)}
                  {' · '}
                  {entry.actor?.name ?? t(`${prefix}.unknownActor`)}
                  {entry.ip ? ` · ${entry.ip}` : ''}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {t('studyCenter.studentVisits.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('studyCenter.studentVisits.pageOfTotal', { page, total: data.pages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.pages}
          >
            {t('studyCenter.studentVisits.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
