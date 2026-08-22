import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { useAuth } from './contexts/useAuth.js';
import LoginPage from './pages/auth/LoginPage.jsx';
import SelectTenantPage from './pages/auth/SelectTenantPage.jsx';
import ImpersonateCallbackPage from './pages/auth/ImpersonateCallbackPage.jsx';
import AppShell from './components/layout/AppShell.jsx';
import DashboardPage from './pages/admin/DashboardPage.jsx';
import TenantsPage from './pages/admin/TenantsPage.jsx';
import TenantDetailPage from './pages/admin/TenantDetailPage.jsx';
import AuditPage from './pages/admin/AuditPage.jsx';
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
  const { accessToken, loading } = useAuth();
  if (loading) return null;
  if (!accessToken) return <Navigate to="/login" replace />;
  return children;
}

function RequireSystemRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!roles.includes(user?.systemRole)) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequirePermission({ permission, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
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
          path="/flags"
          element={
            <RequireSystemRole roles={['super_admin']}>
              <FlagsPage />
            </RequireSystemRole>
          }
        />
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
