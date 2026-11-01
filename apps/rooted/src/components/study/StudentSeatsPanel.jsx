import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';

/** A learner's seat in each shift they hold one, on the learner's detail page. */
export default function StudentSeatsPanel({ studentId }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useQuery({
    queryKey: ['seat-allocations', studentId],
    queryFn: () =>
      api.get('/academic/seat-allocations', { params: { studentId } }).then((r) => r.data),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  return (
    <div className="flex flex-col gap-2">
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('studyCenter.studentSeats.none')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.map((a) => (
            <li key={a._id} className="text-sm">
              {t('studyCenter.studentSeats.row', {
                shift: a.sectionId?.name ?? '—',
                label: a.seatId?.label ?? '—',
              })}
            </li>
          ))}
        </ul>
      )}
      <Link to="/academic/seat-map" className="text-xs text-primary hover:underline">
        {t('studyCenter.studentSeats.openMap')}
      </Link>
    </div>
  );
}
