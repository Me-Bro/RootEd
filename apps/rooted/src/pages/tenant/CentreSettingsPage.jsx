import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { apiError } from '../../utils/studyCenter.js';

const POLICIES = ['owner', 'desk', 'staff'];

const numberOrUndefined = (v) => (v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

// Opening hours and who may give a discount, for a study center. The API fills in
// defaults, so an unsaved value is never blank here.
export default function CentreSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Edits layered over the server's answer (see JoinPolicyPage): a refetch must
  // neither revert what was typed nor be hidden by it.
  const [edits, setEdits] = useState({});
  // The token a "create/replace" just returned, shown before the refetch lands.
  const [qrOverride, setQrOverride] = useState(null);

  const settings = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
  });

  const current = { ...(settings.data?.centre ?? {}), ...edits };
  const change = (patch) => {
    setSaved(false);
    setEdits((e) => ({ ...e, ...patch }));
  };

  const save = useMutation({
    mutationFn: () => api.patch('/tenant/settings', { centre: current }),
    onSuccess: () => {
      setError('');
      setSaved(true);
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
    onError: (err) => {
      setSaved(false);
      setError(apiError(err, t('centre.saveFailed')));
    },
  });

  const [locating, setLocating] = useState(false);
  const locateMe = () => {
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        change({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => {
        setLocating(false);
        setError(t('centre.locationFailed'));
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const qrToken = qrOverride ?? settings.data?.centreQrToken;
  const makeQr = useMutation({
    mutationFn: () => api.post('/tenant/centre/qr').then((r) => r.data),
    onSuccess: (data) => {
      setError('');
      setQrOverride(data.qrToken);
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
    onError: (err) => setError(apiError(err, t('centre.qrFailed'))),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('centre.title')} description={t('centre.description')} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('centre.saved')}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">{t('centre.hours')}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(current.open24h)}
                onChange={(e) => change({ open24h: e.target.checked })}
              />
              {t('centre.open24h')}
            </label>
            {!current.open24h && (
              <div className="grid max-w-md grid-cols-2 gap-3">
                <Input
                  type="time"
                  id="centre-open-time"
                  label={t('centre.openTime')}
                  value={current.openTime ?? ''}
                  onChange={(e) => change({ openTime: e.target.value })}
                />
                <Input
                  type="time"
                  id="centre-close-time"
                  label={t('centre.closeTime')}
                  value={current.closeTime ?? ''}
                  onChange={(e) => change({ closeTime: e.target.value })}
                />
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('centre.discountPolicy')}</legend>
            {POLICIES.map((value) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="discount-policy"
                  value={value}
                  checked={current.discountPolicy === value}
                  onChange={() => change({ discountPolicy: value })}
                  className="mt-1"
                />
                <span>
                  {t(`centre.policy_${value}`)}
                  <span className="block text-xs text-muted-foreground">
                    {t(`centre.policyHint_${value}`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">{t('centre.location')}</legend>
            <p className="text-xs text-muted-foreground">{t('centre.locationHint')}</p>
            <div className="grid max-w-md grid-cols-2 gap-3">
              <Input
                type="number"
                step="any"
                id="centre-lat"
                label={t('centre.latitude')}
                value={current.lat ?? ''}
                onChange={(e) => change({ lat: numberOrUndefined(e.target.value) })}
              />
              <Input
                type="number"
                step="any"
                id="centre-lng"
                label={t('centre.longitude')}
                value={current.lng ?? ''}
                onChange={(e) => change({ lng: numberOrUndefined(e.target.value) })}
              />
              <Input
                type="number"
                id="centre-radius"
                label={t('centre.radius')}
                value={current.radiusM ?? ''}
                onChange={(e) => change({ radiusM: numberOrUndefined(e.target.value) })}
              />
            </div>
            <div>
              <Button type="button" variant="outline" disabled={locating} onClick={locateMe}>
                {locating ? t('centre.locating') : t('centre.useMyLocation')}
              </Button>
            </div>
          </fieldset>

          <div>
            <Button disabled={save.isPending || settings.isLoading} onClick={() => save.mutate()}>
              {save.isPending ? t('auth.saving') : t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <h2 className="text-sm font-medium">{t('centre.qrTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('centre.qrHint')}</p>
          {qrToken && (
            <div
              data-testid="centre-qr"
              className="flex w-fit flex-col gap-2 rounded-md border bg-white p-3 print:border-0"
            >
              <QRCodeSVG
                value={`${window.location.origin}/me/scan?t=${encodeURIComponent(qrToken)}`}
                size={208}
                marginSize={2}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              type="button"
              variant={qrToken ? 'outline' : 'default'}
              disabled={makeQr.isPending}
              onClick={() => makeQr.mutate()}
            >
              {qrToken ? t('centre.qrRegenerate') : t('centre.qrGenerate')}
            </Button>
            {qrToken && (
              <Button type="button" variant="outline" onClick={() => window.print()}>
                {t('centre.qrPrint')}
              </Button>
            )}
          </div>
          {qrToken && (
            <p className="text-xs text-muted-foreground print:hidden">
              {t('centre.qrRegenerateHint')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
