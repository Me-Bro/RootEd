import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import ShiftSeats from '../../components/study/ShiftSeats.jsx';

// The learner's own shifts and seats. Plan validity, amount due and visits join
// this page in later phases; the endpoint's answer only ever concerns the caller.
export default function MySeatPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'seat'],
    queryFn: () => api.get('/me/seat').then((r) => r.data),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('studyCenter.mySeat.title')}
        description={t('studyCenter.mySeat.description')}
      />
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <ShiftSeats shifts={data?.shifts ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
