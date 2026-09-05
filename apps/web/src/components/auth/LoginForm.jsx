import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/useAuth.js';
import { Input } from '../ui/Input.jsx';
import { Button } from '../ui/Button.jsx';

export default function LoginForm() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);

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
  );
}
