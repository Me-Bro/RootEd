import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

const MIN_PASSWORD_LENGTH = 8;

// Backs both /accept-invite and /reset-password. Both links carry the same
// single-use token and both post to POST /auth/reset-password — only the
// wording differs, since accepting an invite is just setting a password on an
// account that was provisioned with a random one.
export default function SetPasswordPage({ mode = 'reset' }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const isInvite = mode === 'invite';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('auth.passwordTooShort', { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || t('auth.setPasswordFailed'));
    } finally {
      setSaving(false);
    }
  }

  const title = done
    ? t('auth.passwordSetTitle')
    : isInvite
      ? t('auth.acceptInviteTitle')
      : t('auth.resetPasswordTitle');
  const description = done
    ? t('auth.passwordSetDescription')
    : isInvite
      ? t('auth.acceptInviteDescription')
      : t('auth.resetPasswordDescription');

  return (
    <AuthShell title={title} description={description}>
      {done ? (
        <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
          {t('auth.signIn')}
        </Button>
      ) : !token ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-destructive">{t('auth.missingToken')}</p>
          <Button variant="outline" size="lg" className="w-full" onClick={() => navigate('/login')}>
            {t('auth.backToSignIn')}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          aria-label={t('auth.setPassword')}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('auth.newPassword')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
          <Input
            label={t('auth.confirmPassword')}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving} size="lg" className="mt-1 w-full">
            {saving ? t('auth.saving') : t('auth.savePassword')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
