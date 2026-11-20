import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { setAccessToken } from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import QrScanDialog from '../../components/org/QrScanDialog.jsx';
import { canScanQr } from '../../utils/joinScan.js';

export default function JoinOrgPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  // A scanned QR code lands here as /orgs/join?code=…; it only prefills the field, so
  // joining is still an explicit tap.
  const [searchParams] = useSearchParams();
  const [joinCode, setJoinCode] = useState(() => (searchParams.get('code') ?? '').slice(0, 40));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/auth/join-requests', {
        joinCode: joinCode.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });

      // 200 with a token means the organization auto-approves; 202 means it
      // went to an admin queue and there is nothing to enter yet.
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        await refreshUser();
        navigate('/dashboard');
        return;
      }
      await refreshUser();
      setSubmitted(data);
    } catch (err) {
      setError(err.response?.data?.error || t('org.joinFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        title={t('org.requestSentTitle')}
        description={t('org.requestSentDescription', { org: submitted.tenantName })}
      >
        <Button size="lg" className="w-full" onClick={() => navigate('/onboarding')}>
          {t('common.done')}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('org.joinOrganization')} description={t('org.joinOrgDescription')}>
      <form
        onSubmit={handleSubmit}
        aria-label={t('org.joinOrganization')}
        className="flex flex-col gap-4"
      >
        <Input
          label={t('org.joinCode')}
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          required
          placeholder="RTED-XXXXX-XXXXX"
          autoComplete="off"
          // Case, spacing and the prefix are all optional — normalizeJoinCode
          // folds them, along with the I/L-for-1 and O-for-0 misreadings, so a
          // code copied off a whiteboard still works.
          spellCheck={false}
        />

        {canScanQr() && (
          <Button type="button" variant="outline" onClick={() => setScanning(true)}>
            {t('org.scanQr')}
          </Button>
        )}
        <QrScanDialog open={scanning} onOpenChange={setScanning} onCode={setJoinCode} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="join-note" className="text-sm font-medium">
            {t('org.joinNote')}
          </label>
          <textarea
            id="join-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
            placeholder={t('org.joinNotePlaceholder')}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={saving} size="lg" className="mt-1 w-full">
          {saving ? t('org.requesting') : t('org.requestToJoin')}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => navigate(-1)}>
          {t('common.cancel')}
        </Button>
      </form>
    </AuthShell>
  );
}
