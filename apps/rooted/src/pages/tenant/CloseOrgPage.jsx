import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';

export default function CloseOrgPage() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');

  const settings = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
  });
  const orgName = settings.data?.name ?? '';

  const archive = useMutation({
    mutationFn: () => api.post('/tenant/archive', { confirmName: confirmName.trim() }),
    // The org stops resolving the moment it is archived and the token is
    // blocked, so the only sensible next step is to sign out.
    onSuccess: () => logout(),
    onError: (err) => setError(err.response?.data?.error || err.message),
  });

  const matches = orgName !== '' && confirmName.trim() === orgName;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('closeOrg.title')} description={t('closeOrg.description')} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>{t('closeOrg.effectAccess')}</li>
            <li>{t('closeOrg.effectData')}</li>
            <li>{t('closeOrg.effectRestore')}</li>
          </ul>

          <label className="flex flex-col gap-1.5 text-sm">
            <span>{t('closeOrg.confirmLabel', { name: orgName })}</span>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              className="rounded-md border px-3 py-2"
            />
          </label>

          <div>
            <Button
              variant="destructive"
              disabled={!matches || archive.isPending}
              onClick={() => {
                setError('');
                archive.mutate();
              }}
            >
              {archive.isPending ? t('closeOrg.closing') : t('closeOrg.button')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
