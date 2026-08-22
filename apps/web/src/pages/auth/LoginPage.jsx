import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/useAuth.js';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { LanguageSwitcherTrigger } from '../../components/ui/LanguageSwitcher.jsx';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, accessToken, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);

  if (!authLoading && accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password, needsTotp ? totpCode : undefined);
      navigate(data.tenants?.length > 1 ? '/select-tenant' : '/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || t('auth.loginFailed');
      if (msg.toLowerCase().includes('totp')) {
        setNeedsTotp(true);
        setError(t('auth.needsTotp'));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="main"
      className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden"
    >
      {/* brand glow backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.488 0.243 264.376 / 0.18) 0%, transparent 70%)',
        }}
      />

      <div className="absolute right-4 top-4 z-20">
        <LanguageSwitcherTrigger />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        {/* logo */}
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="RootEd logo" width={36} height={34} />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">RootEd</h1>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t('auth.signIn')}</CardTitle>
            <CardDescription>{t('auth.enterCredentials')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} aria-label="Login form" className="flex flex-col gap-4">
              <Input
                label={t('auth.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <div className="flex flex-col gap-1">
                <Input
                  label={t('auth.password')}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <div className="flex justify-end">
                  <a
                    href="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {t('auth.forgotPassword')}
                  </a>
                </div>
              </div>
              {needsTotp && (
                <Input
                  label={t('auth.authenticatorCode')}
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder={t('auth.sixDigitCode')}
                />
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} size="lg" className="w-full mt-1">
                {loading ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
