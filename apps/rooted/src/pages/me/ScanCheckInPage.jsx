import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { apiError } from '../../utils/studyCenter.js';
import { requestLocation } from '../../utils/geo.js';

// Opened by the phone camera from the centre's QR code (/me/scan?t=<token>). Reads
// the phone's position and asks the API to check the learner in, or out if inside.
// The learner sees the outcome; nothing here decides anything.
export default function ScanCheckInPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const token = useSearchParams()[0].get('t');
  const [geoError, setGeoError] = useState(null); // null | 'denied' | 'unavailable'

  const scan = useMutation({
    mutationFn: (body) => api.post('/me/visits/scan', body).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'seat'] }),
  });

  const locate = () => {
    setGeoError(null);
    scan.reset();
    requestLocation().then((r) => {
      if (r.error) return setGeoError(r.error);
      scan.mutate({
        token,
        lat: r.coords.latitude,
        lng: r.coords.longitude,
        accuracy: r.coords.accuracy,
      });
    });
  };

  // One scan per page open: a re-render must never toggle the learner back out.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = scan.data;
  let message = null;
  if (!token) message = t('scan.noToken');
  else if (geoError === 'denied') message = t('scan.locationDenied');
  else if (geoError) message = t('scan.noLocation');
  else if (scan.isError) message = apiError(scan.error, t('scan.failed'));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('scan.title')} />
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4 text-sm">
          {message && (
            <p role="alert" className="text-destructive">
              {message}
            </p>
          )}
          {!message && !data && (
            <p role="status" className="text-muted-foreground">
              {t('scan.locating')}
            </p>
          )}
          {data && (
            <p role="status" data-testid="scan-result" className="text-base font-medium">
              {data.action === 'check-out'
                ? t('scan.checkedOut')
                : data.seat
                  ? t('scan.checkedInSeat', { seat: data.seat.label })
                  : t('scan.checkedIn')}
            </p>
          )}
          {data?.warning && (
            <p className="text-muted-foreground">
              {t('scan.warning', { status: data.warning.status })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {token && (geoError || scan.isError) && (
              <Button onClick={locate}>{t('scan.retry')}</Button>
            )}
            <Link to="/me/seat" className="inline-flex items-center text-sm underline">
              {t('scan.mySeat')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
