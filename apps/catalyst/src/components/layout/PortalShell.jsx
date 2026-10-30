import { Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Repeat } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth.js';
import { currentCollege, hasPermission } from '@/lib/access.js';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { CrashFallback, Spinner } from '@/components/ui/Feedback.jsx';
import { LanguageSwitcher } from './LanguageSwitcher.jsx';
import { NotificationBell } from './NotificationBell.jsx';

// Every entry says which permission shows it. The route guards in App.jsx check
// the same permission, so a link is never offered that the page would refuse.
const STAFF_LINKS = [
  { to: '/dashboard', key: 'dashboard', permission: 'training:read' },
  { to: '/assignments', key: 'assignments', permission: 'training:read' },
  { to: '/roadmap', key: 'roadmap', permission: 'training:read' },
  { to: '/projects', key: 'projects', permission: 'training:read' },
  { to: '/placement', key: 'placement', permission: 'training:read' },
  { to: '/readiness', key: 'readiness', permission: 'training:read' },
  { to: '/completion', key: 'completion', permission: 'training:read' },
  { to: '/people/students', key: 'students', permission: 'students:read' },
  { to: '/people/team', key: 'team', permission: 'roles:read' },
  { to: '/setup', key: 'setup', permission: 'tenant:admin' },
  { to: '/teaching', key: 'teaching', permission: 'tenant:admin' },
  { to: '/me/progress', key: 'myProgress', permission: 'self:training:read' },
  { to: '/me/roadmap', key: 'myRoadmap', permission: 'self:training:read' },
  { to: '/me/leaderboard', key: 'leaderboard', permission: 'self:training:read' },
];

export default function PortalShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const college = currentCollege(user);

  const links =
    user?.systemRole === 'super_admin'
      ? [
          { to: '/outcomes', key: 'outcomes' },
          { to: '/enquiries', key: 'enquiries' },
        ]
      : STAFF_LINKS.filter((l) => hasPermission(user, l.permission));

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        {t('portal.skipToContent')}
      </a>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-tight">{t('portal.brand')}</p>
            {college && <p className="truncate text-xs text-muted-foreground">{college.name}</p>}
          </div>
          <LanguageSwitcher />
          {/* a super admin has no college, and so no notifications */}
          {user?.systemRole !== 'super_admin' && <NotificationBell />}
          {(user?.orgs ?? []).length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/select-college')}>
              <Repeat className="size-3.5" aria-hidden="true" />
              {t('auth.switchCollege')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="size-3.5" aria-hidden="true" />
            {t('auth.logout')}
          </Button>
        </div>
        <nav aria-label={t('nav.main')} className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {links.map(({ to, key }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'block border-b-2 px-3 py-2 text-sm whitespace-nowrap',
                      isActive
                        ? 'border-primary font-medium text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )
                  }
                >
                  {t(`nav.${key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {/* keyed by route: a crash on one page clears when the user navigates away */}
        <ErrorBoundary key={pathname} fallback={<CrashFallback />}>
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
