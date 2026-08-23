import { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import {
  LayoutDashboard,
  Building2,
  ScrollText,
  Activity,
  ToggleLeft,
  LogOut,
  Menu,
  X,
  CalendarDays,
  Users,
  ClipboardList,
  BookOpen,
  Briefcase,
  CalendarCheck,
  Wallet,
  DollarSign,
  PieChart,
  CreditCard,
  Settings2,
  Archive,
  BarChart2,
  Bell,
  Grid,
  FileText,
} from 'lucide-react';

import { isModuleEnabled, resolveOrgTerm } from '@rooted/shared/utils';
import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../ui/Button.jsx';
import { ThemeConfiguratorTrigger } from '../ui/ThemeConfigurator.jsx';
import { LanguageSwitcherTrigger } from '../ui/LanguageSwitcher.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet.jsx';
import NavList from './NavList.jsx';
import MobileBottomBar from './MobileBottomBar.jsx';
import { cn } from '../../lib/utils.js';
import api from '../../lib/api.js';

function getNavGroups(t, orgType) {
  // Only override the translated label for org types whose terminology actually
  // diverges — school (the default) keeps the plain t() call so Hindi/hi_en
  // coverage stays intact for the common case.
  const studentLabel =
    orgType && orgType !== 'school' ? resolveOrgTerm(orgType, 'student') : t('nav.students');

  return [
    {
      label: null,
      items: [{ to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard }],
    },
    {
      label: null,
      superAdminOnly: true,
      items: [
        { to: '/tenants', label: t('nav.tenants'), icon: Building2 },
        { to: '/audit', label: t('nav.audit'), icon: ScrollText },
        { to: '/request-logs', label: t('nav.requestLogs'), icon: Activity },
        { to: '/flags', label: t('nav.flags'), icon: ToggleLeft },
      ],
    },
    {
      label: t('nav.academic'),
      module: 'academic',
      items: [
        {
          to: '/academic/years',
          label: t('nav.academicYears'),
          icon: CalendarDays,
          permission: 'students:read',
        },
        {
          to: '/academic/students',
          label: studentLabel,
          icon: Users,
          permission: 'students:read',
        },
        {
          to: '/academic/attendance',
          label: t('nav.attendance'),
          icon: ClipboardList,
          permission: 'attendance:read',
        },
        {
          to: '/academic/attendance/report',
          label: t('nav.attendanceReport'),
          icon: BarChart2,
          permission: 'attendance:read',
        },
        {
          to: '/academic/grades',
          label: t('nav.grades'),
          icon: BookOpen,
          permission: 'grades:read',
        },
        {
          to: '/academic/grades/report',
          label: t('nav.gradeReport'),
          icon: BarChart2,
          permission: 'grades:read',
        },
        {
          to: '/academic/timetable',
          label: t('nav.timetable'),
          icon: Grid,
          permission: 'students:read',
        },
        {
          to: '/academic/my-timetable',
          label: t('nav.mySchedule'),
          icon: CalendarDays,
          permission: 'students:read',
        },
        {
          to: '/academic/report-cards',
          label: t('nav.reportCards'),
          icon: FileText,
          permission: 'grades:read',
        },
      ],
    },
    {
      label: t('nav.staff'),
      module: 'staff',
      items: [
        { to: '/staff', label: t('nav.staffDirectory'), icon: Briefcase, permission: 'staff:read' },
        {
          to: '/staff/leaves',
          label: t('nav.leaves'),
          icon: CalendarCheck,
          permission: 'leave:read',
        },
        { to: '/staff/salary', label: t('nav.salary'), icon: Wallet, permission: 'payroll:read' },
        {
          to: '/staff/salary-structures',
          label: t('nav.salaryStructures'),
          icon: Settings2,
          permission: 'payroll:read',
        },
      ],
    },
    {
      label: t('nav.expenses'),
      module: 'expense',
      items: [
        { to: '/expense', label: t('nav.expenses'), icon: DollarSign, permission: 'expense:read' },
        {
          to: '/expense/budgets',
          label: t('nav.budgets'),
          icon: PieChart,
          permission: 'expense:read',
        },
      ],
    },
    {
      label: t('nav.fees'),
      module: 'fee',
      items: [
        {
          to: '/fee/structures',
          label: t('nav.feeStructures'),
          icon: CreditCard,
          permission: 'fees:read',
        },
        { to: '/fee', label: t('nav.feeCollection'), icon: Wallet, permission: 'fees:read' },
      ],
    },
    {
      label: t('nav.inventory'),
      module: 'inventory',
      items: [
        {
          to: '/inventory',
          label: t('nav.inventory'),
          icon: Archive,
          permission: 'inventory:read',
        },
        {
          to: '/inventory/depreciation',
          label: t('nav.depreciation'),
          icon: BarChart2,
          permission: 'inventory:read',
        },
      ],
    },
  ];
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
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg z-50">
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
  const isSuperAdmin = user?.systemRole === 'super_admin';
  const isImpersonating = Boolean(user?.impersonatedTenantId);
  const permissions = user?.permissions ?? [];
  // Tenant module nav is gated on actual permissions (already tenant_admin-equivalent
  // while impersonating, per GET /auth/me) — a bare super_admin token grants none.
  const hasPermission = (permission) => !permission || permissions.includes(permission);

  const navGroups = getNavGroups(t, user?.orgType)
    .filter((g) => !g.superAdminOnly || (isSuperAdmin && !isImpersonating))
    // A super_admin with no active impersonation has no tenant context — hide
    // tenant modules (Academic/Staff/Expense/Fees/Inventory) entirely rather
    // than showing links that 404 against /tenant/* endpoints. Once impersonating
    // a tenant, treat them like any tenant_admin and let the permission filter below decide.
    .filter((g) => !isSuperAdmin || isImpersonating || g.label === null)
    .filter((g) => !g.module || isModuleEnabled(user?.orgType, g.module))
    .map((g) => ({ ...g, items: g.items.filter((item) => hasPermission(item.permission)) }))
    .filter((g) => g.items.length > 0);

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
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card md:px-6">
          <span className="text-sm text-muted-foreground">{user?.email ?? ''}</span>
          <div className="flex items-center gap-2">
            <LanguageSwitcherTrigger />
            <ThemeConfiguratorTrigger />
            {(!isSuperAdmin || isImpersonating) && <NotificationBell />}
            <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
              <LogOut size={15} />
              {t('auth.logout')}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>

      <MobileBottomBar navGroups={navGroups} onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}
