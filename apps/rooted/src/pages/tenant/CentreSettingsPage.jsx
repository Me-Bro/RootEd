import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

const POLICIES = ['owner', 'desk', 'staff'];

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
      const details = err.response?.data?.details;
      setError(
        (details && Object.values(details).flat()[0]) ||
          err.response?.data?.error ||
          t('centre.saveFailed')
      );
    },
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

          <div>
            <Button disabled={save.isPending || settings.isLoading} onClick={() => save.mutate()}>
              {save.isPending ? t('auth.saving') : t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
