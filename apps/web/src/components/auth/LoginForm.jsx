import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/useAuth.js';
import { Input } from '../ui/Input.jsx';
import { Button } from '../ui/Button.jsx';
import GoogleSignInButton from './GoogleSignInButton.jsx';

export default function LoginForm() {
  const { t } = useTranslation();
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);
  // Set only while retrying a Google sign-in that hit the super_admin MFA
  // gate — the password form has nothing to resubmit in that case, so the
  // TOTP retry re-sends this cached token instead of email/password.
  const [pendingGoogleToken, setPendingGoogleToken] = useState(null);

  function goToDestination(data) {
    navigate(data.tenants?.length > 1 ? '/select-tenant' : '/dashboard');
  }

  function handleAuthError(err) {
    const msg = err.response?.data?.error || err.message || t('auth.loginFailed');
    if (msg.toLowerCase().includes('totp')) {
      setNeedsTotp(true);
      setError(t('auth.needsTotp'));
    } else {
      setError(msg);
      setNeedsTotp(false);
      setPendingGoogleToken(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = pendingGoogleToken
        ? await loginWithGoogle(pendingGoogleToken, totpCode)
        : await login(email, password, needsTotp ? totpCode : undefined);
      goToDestination(data);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleCredential(idToken) {
    setError('');
    setLoading(true);
    try {
      const data = await loginWithGoogle(idToken);
      goToDestination(data);
    } catch (err) {
      setPendingGoogleToken(idToken);
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  }

  if (needsTotp && pendingGoogleToken) {
    return (
      <form onSubmit={handleSubmit} aria-label="Login form" className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('auth.needsTotp')}</p>
        <Input
          label={t('auth.authenticatorCode')}
          type="text"
          inputMode="numeric"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
          placeholder={t('auth.sixDigitCode')}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} size="lg" className="w-full mt-1">
          {loading ? t('auth.signingIn') : t('auth.verifyCode')}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GoogleSignInButton onCredential={handleGoogleCredential} />
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
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              {t('auth.forgotPassword')}
            </button>
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
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="text-primary hover:underline"
          >
            {t('auth.createAccount')}
          </button>
        </p>
      </form>
    </div>
  );
}
