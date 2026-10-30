import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/useAuth.js';
import { currentCollege, homeRoute } from '@/lib/access.js';
import { Button } from '@/components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';

/** Shown when someone is signed in but has nothing to open: never a blank screen or a redirect loop. */
export default function NoAccessPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { path, reason } = homeRoute(user);

  // Someone who does have access landed here by hand: send them home.
  if (path !== '/no-access') return <Navigate to={path} replace />;

  const college = currentCollege(user)?.name ?? t('noAccess.noCollegeName');
  const message = {
    'no-college': t('noAccess.noCollege'),
    module: t('noAccess.module', { college }),
    role: t('noAccess.role', { college }),
  }[reason];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('portal.brand')}</h1>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('noAccess.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p data-testid="no-access-message">{message}</p>
          <div className="flex gap-2">
            {(user?.orgs ?? []).length > 1 && (
              <Link
                to="/select-college"
                className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted"
              >
                {t('auth.switchCollege')}
              </Link>
            )}
            <Button variant="outline" onClick={logout}>
              {t('auth.logout')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
