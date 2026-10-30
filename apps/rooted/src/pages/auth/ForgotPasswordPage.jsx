import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } catch {
      // Swallowed on purpose. The endpoint already answers "if that email
      // exists…" either way; surfacing a failure here would tell an attacker
      // which addresses are registered.
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title={t('auth.checkEmailTitle')} description={t('auth.resetRequested')}>
        <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
          {t('auth.backToSignIn')}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.forgotPasswordTitle')}
      description={t('auth.forgotPasswordDescription')}
    >
      <form
        onSubmit={handleSubmit}
        aria-label={t('auth.forgotPasswordTitle')}
        className="flex flex-col gap-4"
      >
        <Input
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
          {busy ? t('auth.sending') : t('auth.sendResetLink')}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => navigate('/login')}>
          {t('auth.backToSignIn')}
        </Button>
      </form>
    </AuthShell>
  );
}
