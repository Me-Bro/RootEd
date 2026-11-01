import { useTranslation } from 'react-i18next';
import { formatShiftHours } from '../../utils/studyCenter.js';

/**
 * A learner's shifts, each with the seat they hold in it. Used by the My seat page
 * and the home card, so both say the same thing the same way.
 */
export default function ShiftSeats({ shifts }) {
  const { t } = useTranslation();

  if (shifts.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('studyCenter.mySeat.noShifts')}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {shifts.map((shift) => (
        <li key={shift.sectionId} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">{shift.sectionName}</p>
            <p className="text-xs text-muted-foreground">
              {formatShiftHours(shift.startTime, shift.endTime)}
            </p>
          </div>
          {shift.seat ? (
            <p className="text-right text-sm">
              <span className="font-semibold">
                {t('studyCenter.mySeat.seatLabel', { label: shift.seat.label })}
              </span>
              {shift.seat.zone && (
                <span className="block text-xs text-muted-foreground">{shift.seat.zone}</span>
              )}
            </p>
          ) : (
            <p className="text-right text-sm text-muted-foreground">
              {t('studyCenter.mySeat.noSeat')}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
