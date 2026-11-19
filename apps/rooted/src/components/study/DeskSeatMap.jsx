import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';
import { formatTime } from '../../utils/intl.js';
import { groupByZone } from '../../utils/deskView.js';

const STATE_STYLE = {
  free: 'border-dashed border-border bg-background hover:bg-muted',
  held: 'border-border bg-muted/40 hover:bg-muted',
  occupied: 'border-primary/40 bg-primary/10 hover:bg-primary/20',
};

/**
 * Every active seat, live. Free seats are open, held seats belong to a member who is
 * not on them right now, occupied seats show who is sitting there. Tapping a tile is
 * handled by the page (check in the picked learner, or offer check-out).
 */
export default function DeskSeatMap({ seats, selectedSeatId, onTile }) {
  const { t } = useTranslation();

  if (seats.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('studyCenter.desk.noSeats')}</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="desk-seat-map">
      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-hidden="true">
        {['free', 'held', 'occupied'].map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn('inline-block size-3 rounded border', STATE_STYLE[s])} />
            {t(`studyCenter.desk.legend_${s}`)}
          </li>
        ))}
      </ul>

      {groupByZone(seats).map((group) => (
        <section key={group.zone ?? 'none'} className="flex flex-col gap-2">
          {group.zone && <h3 className="text-xs font-semibold uppercase">{group.zone}</h3>}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {group.seats.map((seat) => {
              const who = seat.occupant?.name ?? seat.holder?.name;
              return (
                <li key={seat.seatId}>
                  <button
                    type="button"
                    data-testid={`desk-seat-${seat.label}`}
                    data-state={seat.state}
                    aria-label={t(`studyCenter.desk.seatLabel_${seat.state}`, {
                      seat: seat.label,
                      name: who ?? '',
                    })}
                    aria-pressed={selectedSeatId === seat.seatId}
                    onClick={() => onTile(seat)}
                    className={cn(
                      'flex w-full flex-col gap-1 rounded-lg border p-2 text-left text-xs transition-colors',
                      STATE_STYLE[seat.state],
                      selectedSeatId === seat.seatId && 'ring-2 ring-ring'
                    )}
                  >
                    <span className="text-sm font-semibold">{seat.label}</span>
                    <span className="truncate text-muted-foreground">
                      {seat.state === 'occupied'
                        ? `${who ?? '—'} · ${formatTime(seat.occupant.since)}`
                        : seat.state === 'held'
                          ? t('studyCenter.desk.heldBy', { name: who ?? '—' })
                          : seat.pool
                            ? t('studyCenter.desk.poolSeat')
                            : t('studyCenter.desk.legend_free')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
