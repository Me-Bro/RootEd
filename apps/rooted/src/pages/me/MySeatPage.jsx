import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import ShiftSeats from '../../components/study/ShiftSeats.jsx';
import { formatCurrency, formatDate } from '../../utils/intl.js';

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

      {/* A learner with no plan and nothing owing sees no plan line at all. */}
      {!isLoading && (data?.plan || data?.nextDue) && (
        <Card data-testid="my-plan">
          <CardContent className="flex flex-col gap-1 pt-4 text-sm">
            <h2 className="text-sm font-semibold">{t('studyCenter.mySeat.planLabel')}</h2>
            {data.plan && (
              <>
                <p>{data.plan.name}</p>
                <p className="text-muted-foreground">
                  {new Date(data.plan.coversTo) >= new Date()
                    ? t('studyCenter.mySeat.validUntil', { date: formatDate(data.plan.coversTo) })
                    : t('studyCenter.mySeat.planEnded', { date: formatDate(data.plan.coversTo) })}
                </p>
              </>
            )}
            {data.nextDue && (
              <p className="font-medium">
                {t('studyCenter.mySeat.amountDue', { amount: formatCurrency(data.nextDue.amount) })}
                {data.nextDue.dueDate && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    ({t('studyCenter.mySeat.dueOn', { date: formatDate(data.nextDue.dueDate) })})
                  </span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
