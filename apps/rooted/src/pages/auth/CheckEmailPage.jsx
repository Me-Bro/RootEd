import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Button } from '../../components/ui/Button.jsx';

export default function CheckEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await api.post('/auth/resend-verification', { email });
    } catch {
      // The endpoint answers the same way whether or not the address needs
      // verifying, so there is nothing here worth telling the user apart.
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={t('auth.checkEmailTitle')}
      description={email ? t('auth.checkEmailTo', { email }) : t('auth.checkEmailDescription')}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('auth.checkEmailBody')}</p>

        {sent ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('auth.verificationResent')}
          </p>
        ) : (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={busy || !email}
            onClick={resend}
          >
            {busy ? t('auth.sending') : t('auth.resendVerification')}
          </Button>
        )}

        <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
          {t('auth.backToSignIn')}
        </Button>
      </div>
    </AuthShell>
  );
}
