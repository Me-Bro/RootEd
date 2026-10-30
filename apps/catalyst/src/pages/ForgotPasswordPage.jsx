import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { AuthCard } from '@/components/AuthCard.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Input } from '@/components/ui/Input.jsx';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim(), app: 'portal' });
      // The same answer whether or not the address has an account.
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || t('auth.resetRequestFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t('auth.forgotTitle')} description={t('auth.forgotIntro')}>
      {sent ? (
        <p role="status" data-testid="reset-sent" className="text-sm">
          {t('auth.resetSent')}
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          aria-label={t('auth.forgotTitle')}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t('auth.sending') : t('auth.sendResetLink')}
          </Button>
        </form>
      )}
      <p className="mt-4 text-xs">
        <Link className="underline" to="/login">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </AuthCard>
  );
}
