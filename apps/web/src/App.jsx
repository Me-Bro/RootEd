import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isModuleEnabled } from '@rooted/shared/utils';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { useAuth } from './contexts/useAuth.js';
import LoginPage from './pages/auth/LoginPage.jsx';
import SelectTenantPage from './pages/auth/SelectTenantPage.jsx';
import ImpersonateCallbackPage from './pages/auth/ImpersonateCallbackPage.jsx';
import SetPasswordPage from './pages/auth/SetPasswordPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import CheckEmailPage from './pages/auth/CheckEmailPage.jsx';
import VerifyEmailPage from './pages/auth/VerifyEmailPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import OnboardingPage from './pages/org/OnboardingPage.jsx';
import CreateOrgPage from './pages/org/CreateOrgPage.jsx';
import JoinOrgPage from './pages/org/JoinOrgPage.jsx';
import AccountSettingsPage from './pages/account/AccountSettingsPage.jsx';
import MembersPage from './pages/tenant/MembersPage.jsx';
import JoinPolicyPage from './pages/tenant/JoinPolicyPage.jsx';
import AppShell from './components/layout/AppShell.jsx';
import DashboardPage from './pages/admin/DashboardPage.jsx';
import TenantsPage from './pages/admin/TenantsPage.jsx';
import TenantDetailPage from './pages/admin/TenantDetailPage.jsx';
import AuditPage from './pages/admin/AuditPage.jsx';
import RequestLogsPage from './pages/admin/RequestLogsPage.jsx';
import FlagsPage from './pages/admin/FlagsPage.jsx';
import AcademicYearsPage from './pages/academic/AcademicYearsPage.jsx';
import StudentsPage from './pages/academic/StudentsPage.jsx';
import StudentDetailPage from './pages/academic/StudentDetailPage.jsx';
import AttendancePage from './pages/academic/AttendancePage.jsx';
import AttendanceReportPage from './pages/academic/AttendanceReportPage.jsx';
import GradesPage from './pages/academic/GradesPage.jsx';
import GradeReportPage from './pages/academic/GradeReportPage.jsx';
import TimetablePage from './pages/academic/TimetablePage.jsx';
import MySchedulePage from './pages/academic/MySchedulePage.jsx';
import ReportCardPage from './pages/academic/ReportCardPage.jsx';
import MyTimetablePage from './pages/me/MyTimetablePage.jsx';
import MyAttendancePage from './pages/me/MyAttendancePage.jsx';
import MyGradesPage from './pages/me/MyGradesPage.jsx';
import MyFeesPage from './pages/me/MyFeesPage.jsx';
import AcademicSummaryPage from './pages/dashboard/AcademicSummaryPage.jsx';
import FinanceSummaryPage from './pages/dashboard/FinanceSummaryPage.jsx';
import StaffSummaryPage from './pages/dashboard/StaffSummaryPage.jsx';
import StaffPage from './pages/staff/StaffPage.jsx';
import StaffDetailPage from './pages/staff/StaffDetailPage.jsx';
import LeaveRequestsPage from './pages/staff/LeaveRequestsPage.jsx';
import SalaryPage from './pages/staff/SalaryPage.jsx';
import SalaryStructuresPage from './pages/staff/SalaryStructuresPage.jsx';
import ExpensesPage from './pages/expense/ExpensesPage.jsx';
import BudgetsPage from './pages/expense/BudgetsPage.jsx';
import FeesPage from './pages/fee/FeesPage.jsx';
import FeeStructuresPage from './pages/fee/FeeStructuresPage.jsx';
import InventoryPage from './pages/inventory/InventoryPage.jsx';
import DepreciationPage from './pages/inventory/DepreciationPage.jsx';
import SetupWizardPage from './pages/tenant/SetupWizardPage.jsx';
import { Toaster } from './components/ui/sonner.jsx';
import './index.css';

const queryClient = new QueryClient();

function ProtectedRoute({ children }) {
  const { accessToken, user, loading } = useAuth();
  if (loading) return null;
  if (!accessToken) return <Navigate to="/login" replace />;
  // Render nothing rather than redirecting when the user has not loaded yet:
  // LoginPage redirects on accessToken alone, so bouncing to /login here made
  // the two guards disagree and loop. AuthContext drops the token outright if
  // /auth/me fails, so this is a brief in-flight state, not a stuck one.
  if (!user) return null;

  // A super_admin reaches tenants by impersonation, never by membership, so
  // none of the organization checks below apply to them.
  if (user.systemRole !== 'super_admin') {
    // Belongs to nothing yet. Without this the first thing a newly verified
    // user saw was /dashboard fetching /tenant/settings, resolveTenant()
    // 404ing for want of a tenantId claim, and a broken card explaining
    // nothing.
    if ((user.orgs ?? []).length === 0) return <Navigate to="/onboarding" replace />;
    // Belongs to something, but this session is not scoped to one — pick.
    //
    // Only for tenant-scoped routes, and only when there is genuinely nothing
    // selected. /select-tenant is itself reachable while a tenantId exists:
    // /auth/me derives one from the request Host, so a multi-org user who has
    // chosen nothing still arrives with a tenantId and would otherwise be
    // bounced off the very page that lets them choose.
    if (!user.tenantId) return <Navigate to="/select-tenant" replace />;
  }

  return children;
}

/** Authenticated, but deliberately outside the tenant-scoped AppShell. */
function PortalRoute({ children }) {
  const { accessToken, user, loading } = useAuth();
  if (loading) return null;
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!user) return null;
  return children;
}

function RequireSystemRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!roles.includes(user?.systemRole)) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireModuleEnabled({ moduleName, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!isModuleEnabled(user?.orgType, moduleName)) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequirePermission({ permission, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  // Not a redirect: see ProtectedRoute — bouncing to /login while the user is
  // still loading fights LoginPage's own guard.
  if (!user) return null;
  // Backend already folds an active impersonation session into `permissions`
  // (see GET /auth/me) — a bare super_admin token with no impersonation claim
  // gets none, so it must not be special-cased here.
  const allowed = (user?.permissions ?? []).includes(permission);
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/select-tenant" element={<SelectTenantPage />} />
      <Route path="/impersonate" element={<ImpersonateCallbackPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/check-email" element={<CheckEmailPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/accept-invite" element={<SetPasswordPage mode="invite" />} />
      <Route path="/reset-password" element={<SetPasswordPage mode="reset" />} />
      <Route
        path="/onboarding"
        element={
          <PortalRoute>
            <OnboardingPage />
          </PortalRoute>
        }
      />
      <Route
        path="/orgs/new"
        element={
          <PortalRoute>
            <CreateOrgPage />
          </PortalRoute>
        }
      />
      <Route
        path="/orgs/join"
        element={
          <PortalRoute>
            <JoinOrgPage />
          </PortalRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/tenants"
          element={
            <RequireSystemRole roles={['super_admin']}>
              <TenantsPage />
            </RequireSystemRole>
          }
        />
        <Route
          path="/tenants/:id"
          element={
            <RequireSystemRole roles={['super_admin']}>
              <TenantDetailPage />
            </RequireSystemRole>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireSystemRole roles={['super_admin']}>
              <AuditPage />
            </RequireSystemRole>
          }
        />
        <Route
          path="/request-logs"
          element={
            <RequireSystemRole roles={['super_admin']}>
              <RequestLogsPage />
            </RequireSystemRole>
          }
        />
        <Route
          path="/flags"
          element={
            <RequireSystemRole roles={['super_admin']}>
              <FlagsPage />
            </RequireSystemRole>
          }
        />
        <Route
          element={
            <RequireModuleEnabled moduleName="academic">
              <Outlet />
            </RequireModuleEnabled>
          }
        >
          <Route
            path="/academic/years"
            element={
              <RequirePermission permission="students:read">
                <AcademicYearsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/students"
            element={
              <RequirePermission permission="students:read">
                <StudentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/students/:id"
            element={
              <RequirePermission permission="students:read">
                <StudentDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/attendance"
            element={
              <RequirePermission permission="attendance:read">
                <AttendancePage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/attendance/report"
            element={
              <RequirePermission permission="attendance:read">
                <AttendanceReportPage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/grades"
            element={
              <RequirePermission permission="grades:read">
                <GradesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/grades/report"
            element={
              <RequirePermission permission="grades:read">
                <GradeReportPage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/timetable"
            element={
              <RequirePermission permission="students:read">
                <TimetablePage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/my-timetable"
            element={
              <RequirePermission permission="students:read">
                <MySchedulePage />
              </RequirePermission>
            }
          />
          <Route
            path="/academic/report-cards"
            element={
              <RequirePermission permission="grades:read">
                <ReportCardPage />
              </RequirePermission>
            }
          />
          <Route
            path="/dashboard/academic"
            element={
              <RequirePermission permission="attendance:read">
                <AcademicSummaryPage />
              </RequirePermission>
            }
          />
          <Route
            path="/me/timetable"
            element={
              <RequirePermission permission="self:timetable:read">
                <MyTimetablePage />
              </RequirePermission>
            }
          />
          <Route
            path="/me/attendance"
            element={
              <RequirePermission permission="self:attendance:read">
                <MyAttendancePage />
              </RequirePermission>
            }
          />
          <Route
            path="/me/grades"
            element={
              <RequirePermission permission="self:grades:read">
                <MyGradesPage />
              </RequirePermission>
            }
          />
        </Route>
        <Route
          element={
            <RequireModuleEnabled moduleName="staff">
              <Outlet />
            </RequireModuleEnabled>
          }
        >
          <Route
            path="/staff"
            element={
              <RequirePermission permission="staff:read">
                <StaffPage />
              </RequirePermission>
            }
          />
          <Route
            path="/staff/:id"
            element={
              <RequirePermission permission="staff:read">
                <StaffDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/staff/leaves"
            element={
              <RequirePermission permission="leave:read">
                <LeaveRequestsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/staff/salary"
            element={
              <RequirePermission permission="payroll:read">
                <SalaryPage />
              </RequirePermission>
            }
          />
          <Route
            path="/staff/salary-structures"
            element={
              <RequirePermission permission="payroll:read">
                <SalaryStructuresPage />
              </RequirePermission>
            }
          />
          <Route
            path="/dashboard/staff"
            element={
              <RequirePermission permission="leave:read">
                <StaffSummaryPage />
              </RequirePermission>
            }
          />
        </Route>
        <Route
          element={
            <RequireModuleEnabled moduleName="expense">
              <Outlet />
            </RequireModuleEnabled>
          }
        >
          <Route
            path="/expense"
            element={
              <RequirePermission permission="expense:read">
                <ExpensesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/expense/budgets"
            element={
              <RequirePermission permission="expense:read">
                <BudgetsPage />
              </RequirePermission>
            }
          />
        </Route>
        <Route
          element={
            <RequireModuleEnabled moduleName="fee">
              <Outlet />
            </RequireModuleEnabled>
          }
        >
          <Route
            path="/fee"
            element={
              <RequirePermission permission="fees:read">
                <FeesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/fee/structures"
            element={
              <RequirePermission permission="fees:read">
                <FeeStructuresPage />
              </RequirePermission>
            }
          />
          <Route
            path="/dashboard/finance"
            element={
              <RequirePermission permission="fees:read">
                <FinanceSummaryPage />
              </RequirePermission>
            }
          />
          <Route
            path="/me/fees"
            element={
              <RequirePermission permission="self:fees:read">
                <MyFeesPage />
              </RequirePermission>
            }
          />
        </Route>
        <Route
          element={
            <RequireModuleEnabled moduleName="inventory">
              <Outlet />
            </RequireModuleEnabled>
          }
        >
          <Route
            path="/inventory"
            element={
              <RequirePermission permission="inventory:read">
                <InventoryPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory/depreciation"
            element={
              <RequirePermission permission="inventory:read">
                <DepreciationPage />
              </RequirePermission>
            }
          />
        </Route>
        {/* Account settings are personal, not tenant-scoped — every signed-in
            user has them regardless of role. */}
        <Route path="/settings/account" element={<AccountSettingsPage />} />
        <Route
          path="/tenant/members"
          element={
            <RequirePermission permission="roles:read">
              <MembersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/tenant/join-policy"
          element={
            <RequirePermission permission="tenant:admin">
              <JoinPolicyPage />
            </RequirePermission>
          }
        />
        <Route path="/setup" element={<SetupWizardPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster richColors closeButton position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
