import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card.jsx';
import ShiftSeats from '../study/ShiftSeats.jsx';

/** The learner's seat, first thing on a study center's student home. */
export default function StudySeatCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'seat'],
    queryFn: () => api.get('/me/seat').then((r) => r.data),
  });

  return (
    <Card data-testid="study-seat-card" className="sm:col-span-2">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {t('studyCenter.mySeat.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <ShiftSeats shifts={data?.shifts ?? []} />
        )}
        <Link to="/me/seat" className="text-xs text-primary hover:underline">
          {t('studyCenter.mySeat.view')}
        </Link>
      </CardContent>
    </Card>
  );
}
