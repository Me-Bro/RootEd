import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Bell, LogOut, Menu, X } from 'lucide-react';

import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../ui/Button.jsx';
import { ThemeConfiguratorTrigger } from '../ui/ThemeConfigurator.jsx';
import { LanguageSwitcherTrigger } from '../ui/LanguageSwitcher.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet.jsx';
import NavList from './NavList.jsx';
import { visibleNavGroups } from './navigation.js';
import MobileBottomBar from './MobileBottomBar.jsx';
import { cn } from '../../lib/utils.js';
import api from '../../lib/api.js';
import OrgSwitcher from './OrgSwitcher.jsx';
import HelpDrawer from '../help/HelpDrawer.jsx';
import { RouteStatus } from './RouteStatus.jsx';

function subscribeOnline(callback) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const ref = useRef(null);

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/tenant/notifications');
      setNotifications(data);
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAllRead() {
    await Promise.all(notifications.map((n) => api.patch(`/tenant/notifications/${n._id}/read`)));
    setNotifications([]);
    setOpen(false);
  }

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-muted text-muted-foreground"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-16 z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-border">
            {notifications.slice(0, 10).map((n) => (
              <li key={n._id} className="px-4 py-3 hover:bg-muted">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </li>
            ))}
            {notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No new notifications
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const isSuperAdmin = user?.systemRole === 'super_admin';
  const isImpersonating = Boolean(user?.impersonatedTenantId);
  const navGroups = visibleNavGroups(t, user);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          'hidden h-full shrink-0 flex-col border-r border-border bg-card transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <img src="/favicon.svg" alt="RootEd" width={24} height={23} className="shrink-0" />
          {!collapsed && <span className="text-base font-semibold text-foreground">RootEd</span>}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        <NavList navGroups={navGroups} collapsed={collapsed} />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto md:hidden">
          <SheetHeader>
            <SheetTitle>{t('nav.menu')}</SheetTitle>
          </SheetHeader>
          <NavList navGroups={navGroups} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex h-full min-w-0 min-h-0 flex-1 flex-col">
        {!online && (
          <div
            role="status"
            className="bg-amber-500/15 px-6 py-2 text-sm text-amber-800 dark:text-amber-300"
          >
            {t('common.offline')}
          </div>
        )}
        {isImpersonating && (
          <div className="flex items-center justify-between gap-3 bg-amber-500/15 px-6 py-2 text-sm text-amber-800 dark:text-amber-300">
            <span>{t('auth.impersonating')}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="border-amber-600 text-amber-700 dark:text-amber-300"
            >
              {t('auth.exitImpersonation')}
            </Button>
          </div>
        )}
        <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card md:px-6">
          <OrgSwitcher />
          <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
            {user?.email ?? ''}
          </span>
          <span className="flex-1 sm:hidden" />
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <HelpDrawer />
            <LanguageSwitcherTrigger />
            <ThemeConfiguratorTrigger />
            {(!isSuperAdmin || isImpersonating) && <NotificationBell />}
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              aria-label={t('auth.logout')}
              className="gap-1.5 px-2 sm:px-2.5"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">{t('auth.logout')}</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 pb-20 md:pb-6">
          {/* Keyed by path so navigating away from a crashed page recovers. */}
          <Sentry.ErrorBoundary key={pathname} fallback={<RouteStatus kind="crash" />}>
            <Outlet />
          </Sentry.ErrorBoundary>
        </main>
      </div>

      <MobileBottomBar navGroups={navGroups} onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}
