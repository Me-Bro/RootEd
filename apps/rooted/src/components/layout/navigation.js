import {
  Activity,
  Mail,
  Archive,
  Armchair,
  BarChart2,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  GraduationCap,
  Grid,
  Home,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  PieChart,
  ScrollText,
  Settings2,
  ToggleLeft,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { hasSeats, isModuleEnabled, resolveOrgTerm } from '@rooted/shared/utils';

// A study center sells seats, not lessons: these pages do not apply to it. The
// routes still work if opened by URL; only the nav entry is withheld.
export const STUDY_CENTER_HIDDEN = new Set([
  '/academic/timetable',
  '/academic/my-timetable',
  '/academic/grades',
  '/academic/grades/report',
  '/academic/report-cards',
  '/tenant/report-card',
  '/me/timetable',
  '/me/grades',
  '/academic/subjects',
  '/academic/my-classes',
  // Presence is check-in and check-out (the front desk), not a roll call.
  '/academic/attendance',
  '/academic/attendance/report',
  '/me/attendance',
  // Plan sales are not offered yet (the front desk is).
  '/fee/sell',
  // One owner and no approval chain: budgets and cost centers are a school's.
  '/expense/budgets',
]);

export function getNavGroups(t, orgType) {
  // Only override the translated label for org types whose terminology actually
  // diverges — school (the default) keeps the plain t() call so Hindi/hi_en
  // coverage stays intact for the common case.
  const studentLabel =
    orgType && orgType !== 'school' ? resolveOrgTerm(orgType, 'student') : t('nav.students');
  // A study center has one tier (its batches are its shifts), so no "& Group".
  const classesSectionsLabel = hasSeats(orgType)
    ? `${resolveOrgTerm(orgType, 'classLevel')}es`
    : orgType && orgType !== 'school'
      ? `${resolveOrgTerm(orgType, 'classLevel')} & ${resolveOrgTerm(orgType, 'section')}`
      : t('nav.classesSections');

  return [
    {
      label: null,
      items: [
        // The org's own page. Needs a tenant, so a super_admin who is not
        // impersonating (no organization to show) never sees it.
        { to: '/home', label: t('nav.home'), icon: Home, tenantOnly: true },
        { to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
      ],
    },
    {
      label: null,
      superAdminOnly: true,
      items: [
        { to: '/tenants', label: t('nav.tenants'), icon: Building2 },
        { to: '/audit', label: t('nav.audit'), icon: ScrollText },
        { to: '/request-logs', label: t('nav.requestLogs'), icon: Activity },
        { to: '/email-logs', label: t('nav.emailLogs'), icon: Mail },
        { to: '/flags', label: t('nav.flags'), icon: ToggleLeft },
        { to: '/users', label: t('nav.platformUsers'), icon: Users },
        { to: '/feedback', label: t('nav.feedback'), icon: MessageSquare },
      ],
    },
    {
      label: t('nav.academicSetup'),
      module: 'academic',
      items: [
        {
          to: '/academic/years',
          label: t('nav.academicYears'),
          icon: CalendarDays,
          permission: 'students:read',
        },
        {
          to: '/academic/classes-sections',
          label: classesSectionsLabel,
          icon: Layers,
          permission: 'students:read',
        },
        {
          to: '/academic/subjects',
          label: t('nav.subjects'),
          icon: BookMarked,
          permission: 'students:read',
        },
        {
          to: '/academic/timetable',
          label: t('nav.timetable'),
          icon: Grid,
          permission: 'students:read',
        },
      ],
    },
    {
      label: t('nav.academic'),
      module: 'academic',
      items: [
        {
          to: '/academic/my-classes',
          label: t('nav.myClasses'),
          icon: GraduationCap,
          permission: 'attendance:write',
        },
        {
          to: '/academic/students',
          label: studentLabel,
          icon: Users,
          permission: 'students:read',
        },
        // Study center only: the front desk, the chairs, who holds them per shift,
        // and the learner's own seat.
        {
          to: '/desk',
          label: t('nav.desk'),
          icon: Armchair,
          permission: 'attendance:write',
          seatsOnly: true,
        },
        {
          to: '/academic/study-center-reports',
          label: t('nav.studyReports'),
          icon: BarChart2,
          permission: 'attendance:read',
          seatsOnly: true,
        },
        {
          to: '/academic/seat-map',
          label: t('nav.seatMap'),
          icon: Armchair,
          permission: 'students:read',
          seatsOnly: true,
        },
        {
          to: '/academic/seats',
          label: t('nav.seats'),
          icon: Armchair,
          permission: 'students:write',
          seatsOnly: true,
        },
        {
          to: '/me/seat',
          label: t('nav.mySeat'),
          icon: Armchair,
          permission: 'self:seat:read',
          seatsOnly: true,
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
        // Self-scoped: held only by the student role, never alongside the
        // tenant-wide permissions above, so exactly one of the two sets ever
        // renders for a given user.
        {
          to: '/me/timetable',
          label: t('nav.myTimetable'),
          icon: CalendarDays,
          permission: 'self:timetable:read',
        },
        {
          to: '/me/attendance',
          label: t('nav.myAttendance'),
          icon: ClipboardList,
          permission: 'self:attendance:read',
        },
        {
          to: '/me/grades',
          label: t('nav.myGrades'),
          icon: BookOpen,
          permission: 'self:grades:read',
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
        // Study center only: the desk sale, and the owner's discount catalog.
        {
          to: '/fee/sell',
          label: t('nav.sell'),
          icon: Wallet,
          permission: 'fees:collect',
          seatsOnly: true,
        },
        {
          to: '/fee/discounts',
          label: t('nav.discounts'),
          icon: CreditCard,
          permission: 'tenant:admin',
          seatsOnly: true,
        },
        {
          to: '/fee/pending',
          label: t('nav.pendingFees'),
          icon: CreditCard,
          permission: 'fees:read',
          seatsOnly: true,
        },
        {
          to: '/fee/finance',
          label: t('nav.finance'),
          icon: PieChart,
          permission: 'tenant:admin',
          seatsOnly: true,
        },
        {
          to: '/me/fees',
          label: t('nav.myFees'),
          icon: Wallet,
          permission: 'self:fees:read',
        },
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
    {
      label: t('nav.organization'),
      items: [
        // No permission: every member may see who their organization is.
        { to: '/tenant/profile', label: t('nav.orgProfile'), icon: Building2 },
        { to: '/tenant/members', label: t('nav.members'), icon: Users, permission: 'roles:read' },
        {
          to: '/tenant/join-policy',
          label: t('nav.joinPolicy'),
          icon: UserPlus,
          permission: 'tenant:admin',
        },
        {
          to: '/tenant/centre',
          label: t('nav.centreSettings'),
          icon: Settings2,
          permission: 'tenant:admin',
          seatsOnly: true,
        },
        {
          to: '/tenant/report-card',
          label: t('nav.reportCardSettings'),
          icon: FileText,
          permission: 'tenant:admin',
        },
        // Last on purpose: the one irreversible action sits apart from the settings.
        {
          to: '/tenant/close',
          label: t('nav.closeOrg'),
          icon: Archive,
          permission: 'tenant:admin',
        },
      ],
    },
    {
      // The person's own items, not the organization's.
      label: t('nav.yourAccount'),
      items: [
        // No permission: account settings belong to the person, not the
        // organization, so every signed-in user has them.
        { to: '/settings/account', label: t('nav.accountSettings'), icon: UserCog },
        // Same: any signed-in user can ask for help, whatever their role.
        { to: '/help', label: t('nav.helpSupport'), icon: LifeBuoy },
      ],
    },
  ];
}

/**
 * The nav the signed-in user actually sees: groups and items filtered by role,
 * module and org type. One function so the sidebar and the org home page's
 * shortcuts can never disagree about what someone is allowed to open.
 */
export function visibleNavGroups(t, user) {
  const isSuperAdmin = user?.systemRole === 'super_admin';
  const isImpersonating = Boolean(user?.impersonatedTenantId);
  const permissions = user?.permissions ?? [];
  // Tenant module nav is gated on actual permissions (already tenant_admin-equivalent
  // while impersonating, per GET /auth/me) — a bare super_admin token grants none.
  const hasPermission = (permission) => !permission || permissions.includes(permission);

  return (
    getNavGroups(t, user?.orgType)
      .filter((g) => !g.superAdminOnly || (isSuperAdmin && !isImpersonating))
      // A super_admin with no active impersonation has no tenant context — hide
      // tenant modules (Academic/Staff/Expense/Fees/Inventory) entirely rather
      // than showing links that 404 against /tenant/* endpoints. Once impersonating
      // a tenant, treat them like any tenant_admin and let the permission filter below decide.
      .filter((g) => !isSuperAdmin || isImpersonating || g.label === null)
      .filter((g) => !g.module || isModuleEnabled(user, g.module))
      .map((g) => ({
        ...g,
        items: g.items
          .filter((item) => !item.tenantOnly || !isSuperAdmin || isImpersonating)
          .filter((item) => hasPermission(item.permission))
          .filter((item) => !item.seatsOnly || hasSeats(user?.orgType))
          .filter((item) => !hasSeats(user?.orgType) || !STUDY_CENTER_HIDDEN.has(item.to)),
      }))
      .filter((g) => g.items.length > 0)
  );
}
