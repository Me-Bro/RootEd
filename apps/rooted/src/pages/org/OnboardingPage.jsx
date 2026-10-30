import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Button } from '../../components/ui/Button.jsx';

/**
 * Where a verified account with no organization lands.
 *
 * Without this the first thing a new user saw was /dashboard fetching
 * /tenant/settings, resolveTenant() 404ing for lack of a tenantId claim, and a
 * broken card with no explanation.
 */
export default function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // A join request approved while this tab sat here doesn't push any update
  // to it (no real-time notifications) — but the next /auth/me this tab does
  // fetch (e.g. a reload) does carry the new org, and PortalRoute doesn't
  // otherwise route someone with orgs back out of here.
  if ((user?.orgs ?? []).length > 0) {
    return <Navigate to="/dashboard" replace />;
  }

  const pending = (user?.pendingOrgs ?? []).length;

  return (
    <AuthShell title={t('org.onboardingTitle')} description={t('org.onboardingDescription')}>
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          className="w-full justify-start gap-2"
          onClick={() => navigate('/orgs/join')}
        >
          <Building2 size={16} />
          {t('org.joinOrganization')}
        </Button>
        <p className="px-1 text-xs text-muted-foreground">{t('org.joinHint')}</p>

        <Button
          variant="outline"
          size="lg"
          className="mt-2 w-full justify-start gap-2"
          onClick={() => navigate('/orgs/new')}
        >
          <Plus size={16} />
          {t('org.createOrganization')}
        </Button>
        <p className="px-1 text-xs text-muted-foreground">{t('org.createHint')}</p>

        {pending > 0 && (
          <p
            role="status"
            className="mt-2 rounded-lg border border-border p-3 text-sm text-muted-foreground"
          >
            {t('org.pendingRequests', { count: pending })}
          </p>
        )}
      </div>
    </AuthShell>
  );
}
