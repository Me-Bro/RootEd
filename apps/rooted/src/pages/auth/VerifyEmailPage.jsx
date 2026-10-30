import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Button } from '../../components/ui/Button.jsx';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState(token ? 'verifying' : 'missing');
  const [error, setError] = useState('');
  // Verification consumes the token, so React 18's double-invoked effect in
  // development would spend it and then report the retry as invalid.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    api
      .post('/auth/verify-email', { token })
      .then(() => setState('done'))
      .catch((err) => {
        setError(err.response?.data?.error || t('auth.verifyFailed'));
        setState('failed');
      });
  }, [token, t]);

  const title = {
    verifying: t('auth.verifyingTitle'),
    done: t('auth.verifiedTitle'),
    failed: t('auth.verifyFailedTitle'),
    missing: t('auth.verifyFailedTitle'),
  }[state];

  const description = {
    verifying: t('auth.verifyingDescription'),
    done: t('auth.verifiedDescription'),
    failed: error,
    missing: t('auth.missingToken'),
  }[state];

  return (
    <AuthShell title={title} description={description}>
      <div className="flex flex-col gap-4">
        {state === 'done' && (
          <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
            {t('auth.signIn')}
          </Button>
        )}
        {(state === 'failed' || state === 'missing') && (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => navigate('/check-email')}
          >
            {t('auth.resendVerification')}
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
