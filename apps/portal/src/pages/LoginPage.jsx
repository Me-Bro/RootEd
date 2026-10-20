import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/useAuth.js';
import { homeRoute } from '@/lib/access.js';
import { Button } from '@/components/ui/Button.jsx';
import { Input } from '@/components/ui/Input.jsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card.jsx';
import { Spinner } from '@/components/ui/Feedback.jsx';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher.jsx';

// Registration, password reset and invites live in the main RootEd app.
const MAIN_APP_URL = (import.meta.env.VITE_MAIN_APP_URL ?? '').replace(/\/$/, '');

export default function LoginPage() {
  const { t } = useTranslation();
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (user) return <Navigate to={homeRoute(user).path} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const me = await login(identifier.trim(), password, needsTotp ? totpCode : undefined);
      navigate(homeRoute(me).path, { replace: true });
    } catch (err) {
      const message = err.response?.data?.error || '';
      if (/totp/i.test(message)) {
        setNeedsTotp(true);
        setError(t('auth.needsTotp'));
      } else {
        setNeedsTotp(false);
        setError(message || t('auth.loginFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="text-center">
        <img src="/favicon.svg" alt="" width="44" height="44" className="mx-auto mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight">{t('portal.brand')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('portal.tagline')}</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h2">{t('auth.signIn')}</CardTitle>
          <CardDescription>{t('auth.intro')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            aria-label={t('auth.signIn')}
            className="flex flex-col gap-4"
          >
            <Input
              label={t('auth.identifier')}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {needsTotp && (
              <Input
                label={t('auth.authenticatorCode')}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t('auth.sixDigitCode')}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                required
              />
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
            {MAIN_APP_URL && (
              <p className="flex justify-between text-xs text-muted-foreground">
                <a className="underline" href={`${MAIN_APP_URL}/forgot-password`}>
                  {t('auth.forgotPassword')}
                </a>
                <a className="underline" href={`${MAIN_APP_URL}/register`}>
                  {t('auth.createAccount')}
                </a>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
