import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import QrScanDialog from '../../components/org/QrScanDialog.jsx';
import { canScanQr, checkInTokenFromScan } from '../../utils/joinScan.js';
import { requestLocation } from '../../utils/geo.js';
import ShiftSeats from '../../components/study/ShiftSeats.jsx';
import { formatCurrency, formatDate } from '../../utils/intl.js';
import { splitMinutes } from '../../utils/studyCenter.js';

// The learner's own shifts and seats. Plan validity, amount due and visits join
// this page in later phases; the endpoint's answer only ever concerns the caller.
export default function MySeatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [locationError, setLocationError] = useState(null); // null | 'denied' | 'unavailable'
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'seat'],
    queryFn: () => api.get('/me/seat').then((r) => r.data),
  });

  // Check-in needs the phone's location, so ask for it first, from this tap. If it is
  // blocked the camera is never opened: scanning would only end in an error. Not
  // pre-checked with navigator.permissions: Android WebView (the RootEd app) always
  // reports geolocation as 'denied' there, even when the app would grant it.
  async function startScan() {
    setLocationError(null);
    setChecking(true);
    const result = await requestLocation();
    setChecking(false);
    if (result.error) setLocationError(result.error);
    else setScanning(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('studyCenter.mySeat.title')}
        description={t('studyCenter.mySeat.description')}
      />
      {canScanQr() && (
        <div>
          <Button disabled={checking} onClick={startScan}>
            {checking ? t('studyCenter.mySeat.scanChecking') : t('studyCenter.mySeat.scanButton')}
          </Button>
          {locationError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {locationError === 'denied' ? t('scan.locationDenied') : t('scan.noLocation')}
            </p>
          )}
          <QrScanDialog
            open={scanning}
            onOpenChange={setScanning}
            parse={checkInTokenFromScan}
            onCode={(token) => navigate(`/me/scan?t=${encodeURIComponent(token)}`)}
            title={t('studyCenter.mySeat.scanTitle')}
            hint={t('studyCenter.mySeat.scanHint')}
            notCodeHint={t('studyCenter.mySeat.scanNotCentre')}
          />
        </div>
      )}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <ShiftSeats shifts={data?.shifts ?? []} />
          )}
        </CardContent>
      </Card>

      {!isLoading && data?.visits && (
        <Card data-testid="my-visits">
          <CardContent className="flex flex-col gap-1 pt-4 text-sm">
            <p>
              {t('studyCenter.mySeat.visitsThisMonth', {
                count: data.visits.count,
                time: (() => {
                  const { hours, minutes } = splitMinutes(data.visits.minutes);
                  if (hours && minutes) {
                    return t('studyCenter.reports.hoursMinutes', { hours, minutes });
                  }
                  return hours
                    ? t('studyCenter.reports.hoursOnly', { hours })
                    : t('studyCenter.reports.minutesOnly', { minutes });
                })(),
              })}
            </p>
            {data.centre && (
              <p className="text-muted-foreground" data-testid="my-open-hours">
                {data.centre.open24h
                  ? t('studyCenter.mySeat.open24h')
                  : t('studyCenter.mySeat.openHours', {
                      open: data.centre.openTime,
                      close: data.centre.closeTime,
                    })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* A learner with no plan and nothing owing sees no plan line at all. */}
      {!isLoading && (data?.plan || data?.nextDue) && (
        <Card data-testid="my-plan">
          <CardContent className="flex flex-col gap-1 pt-4 text-sm">
            <h2 className="text-sm font-semibold">{t('studyCenter.mySeat.planLabel')}</h2>
            {data.plan && data.plan.cycle && (
              <>
                <p>{data.plan.name}</p>
                <p className="text-muted-foreground" data-testid="my-plan-state">
                  {t(`studyCenter.mySeat.planCycle_${data.plan.cycle}`)} ·{' '}
                  {t(`studyCenter.mySeat.planState_${data.plan.state}`)}
                </p>
              </>
            )}
            {data.plan && !data.plan.cycle && (
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
