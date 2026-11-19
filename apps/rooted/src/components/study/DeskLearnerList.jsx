import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { cn } from '../../lib/utils.js';
import { formatTime } from '../../utils/intl.js';
import { formatDuration } from '../../utils/duration.js';
import { DESK_FILTERS } from '@rooted/shared/constants';
import { minutesSince } from '../../utils/deskView.js';

const WARN_VARIANT = 'warning';
const needsWarning = (entitlement) => entitlement && entitlement.status !== 'valid';

/**
 * Everyone the desk can act on: search, filter chips and one row per learner. A row
 * shows where they are (or their usual seat) and one button, Check in or Check out.
 * Picking a row selects the learner, so a free seat on the map can check them in.
 */
export default function DeskLearnerList({
  learners,
  truncated,
  isLoading,
  search,
  onSearch,
  filter,
  onFilter,
  selectedId,
  onSelect,
  onCheckIn,
  onCheckOut,
  busy,
  now,
  onNewWalkIn,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3" data-testid="desk-list">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            id="desk-search"
            label={t('studyCenter.desk.findLearner')}
            placeholder={t('studyCenter.desk.findPlaceholder')}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={onNewWalkIn}>
          {t('studyCenter.desk.newWalkIn')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('studyCenter.desk.filters')}>
        {DESK_FILTERS.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? 'default' : 'outline'}
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
          >
            {t(`studyCenter.desk.filter_${key}`)}
          </Button>
        ))}
      </div>

      {!isLoading && learners.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('studyCenter.desk.noLearners')}</p>
      )}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {learners.map((l) => {
          const selected = l._id === selectedId;
          const status = l.entitlement?.status;
          return (
            <li
              key={l._id}
              data-testid={`learner-${l.name}`}
              className={cn('flex flex-col gap-1 p-3', selected && 'bg-muted/60')}
            >
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? null : l)}
                >
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {l.name}
                    {l.kind === 'walk_in' && (
                      <Badge variant="secondary">{t('studyCenter.sell.walkIn')}</Badge>
                    )}
                    {needsWarning(l.entitlement) && (
                      <Badge variant={WARN_VARIANT}>{t(`studyCenter.desk.badge_${status}`)}</Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {l.inside
                      ? t('studyCenter.desk.insideSince', {
                          seat: l.inside.seatLabel ?? '—',
                          time: formatTime(l.inside.inAt),
                          duration: formatDuration(minutesSince(l.inside.inAt, now)),
                        })
                      : l.ownSeat
                        ? t('studyCenter.desk.usualSeat', { seat: l.ownSeat.label ?? '—' })
                        : t('studyCenter.desk.noSeat')}
                  </span>
                </button>
                {l.inside ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onCheckOut(l.inside.visitId)}
                  >
                    {t('studyCenter.desk.checkOut')}
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy} onClick={() => onCheckIn(l)}>
                    {t('studyCenter.desk.checkIn')}
                  </Button>
                )}
              </div>
              {selected && status && (
                <p
                  className={cn(
                    'text-xs',
                    needsWarning(l.entitlement) ? 'text-yellow-700' : 'text-muted-foreground'
                  )}
                  data-testid="desk-entitlement"
                >
                  {t(`studyCenter.desk.entitlement_${status}`)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {truncated && (
        <p className="text-xs text-muted-foreground">{t('studyCenter.desk.listTruncated')}</p>
      )}
    </div>
  );
}
