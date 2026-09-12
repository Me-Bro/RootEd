import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth.js';
import LandingView from '../../components/marketing/LandingView.jsx';
import LoginDialog from '../../components/auth/LoginDialog.jsx';
import { LanguageSwitcherTrigger } from '../../components/ui/LanguageSwitcher.jsx';

/**
 * `/` and `/login` both render this — the public marketing page, reachable
 * whether or not the visitor is logged in. Nothing here auto-redirects: a
 * logged-in visitor just sees "Dashboard"/"Log out" instead of "Log
 * in"/"Get started free" (see LandingView's `isAuthenticated` prop). `/login`
 * stays a distinct route because every existing "you need to log in"
 * redirect (ProtectedRoute in App.jsx, AuthContext.logout(), SelectTenantPage
 * and ImpersonateCallbackPage's fallbacks) already targets it.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const { accessToken, loading: authLoading, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  if (authLoading) return null;

  return (
    <>
      <LandingView
        isAuthenticated={!!accessToken}
        onLoginClick={() => setLoginOpen(true)}
        onDashboardClick={() => navigate('/dashboard')}
        onLogoutClick={logout}
        onGetStartedClick={() => navigate('/register')}
        languageSwitcher={<LanguageSwitcherTrigger />}
      />

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}
