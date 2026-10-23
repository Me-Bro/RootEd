import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { passwordSchema } from '@rooted/shared/schemas';
import api from '@/lib/api.js';
import { AuthCard } from '@/components/AuthCard.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Input } from '@/components/ui/Input.jsx';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!passwordSchema.safeParse(password).success) return setError(t('auth.passwordTooShort'));
    if (password !== confirm) return setError(t('auth.passwordsDiffer'));
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || t('auth.resetFailed'));
    } finally {
      setBusy(false);
    }
  }

  const signIn = (
    <p className="mt-4 text-xs">
      <Link className="underline" to="/login">
        {t('auth.backToSignIn')}
      </Link>
    </p>
  );

  if (!token) {
    return (
      <AuthCard title={t('auth.resetTitle')}>
        <p role="alert" className="text-sm text-destructive">
          {t('auth.resetLinkMissing')}
        </p>
        <p className="mt-2 text-sm">
          <Link className="underline" to="/forgot-password">
            {t('auth.forgotTitle')}
          </Link>
        </p>
        {signIn}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.resetTitle')} description={t('auth.resetIntro')}>
      {done ? (
        <p role="status" data-testid="reset-done" className="text-sm">
          {t('auth.resetDone')}
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          aria-label={t('auth.resetTitle')}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('auth.newPassword')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Input
            label={t('auth.confirmPassword')}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t('auth.saving') : t('auth.setPassword')}
          </Button>
        </form>
      )}
      {signIn}
    </AuthCard>
  );
}
