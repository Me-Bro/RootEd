import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  LayoutDashboard,
  Building2,
  ScrollText,
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
  Archive,
  BarChart2,
  Bell,
  Grid,
  FileText,
} from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext.jsx';
import { Button } from '../ui/Button.jsx';
import { Separator } from '../ui/separator.jsx';
import { ThemeConfiguratorTrigger } from '../ui/ThemeConfigurator.jsx';
import { cn } from '../../lib/utils.js';
import api from '../../lib/api.js';

const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: null,
    superAdminOnly: true,
    items: [
      { to: '/tenants', label: 'Tenants', icon: Building2 },
      { to: '/audit', label: 'Audit Log', icon: ScrollText },
      { to: '/flags', label: 'Feature Flags', icon: ToggleLeft },
    ],
  },
  {
    label: 'Academic',
    items: [
      { to: '/academic/years', label: 'Academic Years', icon: CalendarDays },
      { to: '/academic/students', label: 'Students', icon: Users },
      { to: '/academic/attendance', label: 'Attendance', icon: ClipboardList },
      { to: '/academic/grades', label: 'Grades', icon: BookOpen },
      { to: '/academic/timetable', label: 'Timetable', icon: Grid },
      { to: '/academic/report-cards', label: 'Report Cards', icon: FileText },
    ],
  },
  {
    label: 'Staff',
    items: [
      { to: '/staff', label: 'Staff Directory', icon: Briefcase, permission: 'staff:read' },
      {
        to: '/staff/leaves',
        label: 'Leave Requests',
        icon: CalendarCheck,
        permission: 'leave:read',
      },
      { to: '/staff/salary', label: 'Salary', icon: Wallet, permission: 'payroll:read' },
    ],
  },
  {
    label: 'Expense',
    items: [
      { to: '/expense', label: 'Expenses', icon: DollarSign, permission: 'expense:read' },
      { to: '/expense/budgets', label: 'Budgets', icon: PieChart },
    ],
  },
  {
    label: 'Fees',
    items: [
      { to: '/fee/structures', label: 'Fee Structures', icon: CreditCard, permission: 'fees:read' },
      { to: '/fee', label: 'Fee Collection', icon: Wallet, permission: 'fees:read' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Archive, permission: 'inventory:read' },
      {
        to: '/inventory/depreciation',
        label: 'Depreciation',
        icon: BarChart2,
        permission: 'inventory:read',
      },
    ],
  },
];

function NavItem({ to, label, icon: Icon, collapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )
      }
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
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
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const isSuperAdmin = user?.systemRole === 'super_admin';
  const permissions = user?.permissions ?? [];
  const hasPermission = (permission) =>
    !permission || isSuperAdmin || permissions.includes(permission);

  const navGroups = NAV_GROUPS.filter((g) => !g.superAdminOnly || isSuperAdmin)
    .map((g) => ({ ...g, items: g.items.filter((item) => hasPermission(item.permission)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          'flex flex-col border-r border-border bg-card transition-all duration-200',
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

        <nav className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto">
          {navGroups.map((group, i) => (
            <div key={i}>
              {group.label && !collapsed && (
                <p className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              {group.label && collapsed && <Separator className="my-2" />}
              {group.items.map(({ to, label, icon }) => (
                <NavItem key={to} to={to} label={label} icon={icon} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
          <span className="text-sm text-muted-foreground">{user?.email ?? ''}</span>
          <div className="flex items-center gap-2">
            <ThemeConfiguratorTrigger />
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
              <LogOut size={15} />
              Logout
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
