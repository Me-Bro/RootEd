import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/useAuth.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog.jsx';
import LandingView from '../../components/marketing/LandingView.jsx';
import LoginForm from '../../components/auth/LoginForm.jsx';
import { LanguageSwitcherTrigger } from '../../components/ui/LanguageSwitcher.jsx';

/**
 * `/login` — the approved landing page UI (see components/marketing/
 * LandingView.jsx) with the actual sign-in form in a dialog opened by any of
 * its "Log in" CTAs.
 *
 * Deliberately still the `/login` route and nothing else: every existing
 * entry point already funnels here (ProtectedRoute's redirect in App.jsx,
 * AuthContext.logout(), SelectTenantPage's and ImpersonateCallbackPage's
 * fallbacks), so replacing what this route renders gives the landing page to
 * all of them without touching the router.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const { accessToken, loading: authLoading } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  // Mirrors ProtectedRoute's own guard (App.jsx) — render nothing while
  // AuthContext's mount-time refresh is in flight, so an already-logged-in
  // visitor never sees a flash of the landing page before /dashboard.
  if (authLoading) return null;

  if (accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      {/* No role="main" wrapper here — LandingView renders its own
          nav/main/footer landmarks, and nesting them inside another main
          breaks the banner/contentinfo landmarks (axe). */}
      <LandingView
        onLoginClick={() => setLoginOpen(true)}
        languageSwitcher={<LanguageSwitcherTrigger />}
      />

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('auth.signIn')}</DialogTitle>
            <DialogDescription>{t('auth.enterCredentials')}</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so every open is a fresh form — a
              failed attempt's error/values don't linger if the dialog is
              closed and reopened without submitting. */}
          {loginOpen && <LoginForm />}
        </DialogContent>
      </Dialog>
    </>
  );
}
