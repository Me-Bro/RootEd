import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import AppShell from './components/layout/AppShell.jsx';
import DashboardPage from './pages/admin/DashboardPage.jsx';
import TenantsPage from './pages/admin/TenantsPage.jsx';
import TenantDetailPage from './pages/admin/TenantDetailPage.jsx';
import AuditPage from './pages/admin/AuditPage.jsx';
import FlagsPage from './pages/admin/FlagsPage.jsx';
import AcademicYearsPage from './pages/academic/AcademicYearsPage.jsx';
import StudentsPage from './pages/academic/StudentsPage.jsx';
import AttendancePage from './pages/academic/AttendancePage.jsx';
import GradesPage from './pages/academic/GradesPage.jsx';
import TimetablePage from './pages/academic/TimetablePage.jsx';
import ReportCardPage from './pages/academic/ReportCardPage.jsx';
import StaffPage from './pages/staff/StaffPage.jsx';
import LeaveRequestsPage from './pages/staff/LeaveRequestsPage.jsx';
import SalaryPage from './pages/staff/SalaryPage.jsx';
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
  const allowed =
    user?.systemRole === 'super_admin' || (user?.permissions ?? []).includes(permission);
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="/academic/years" element={<AcademicYearsPage />} />
        <Route path="/academic/students" element={<StudentsPage />} />
        <Route path="/academic/attendance" element={<AttendancePage />} />
        <Route path="/academic/grades" element={<GradesPage />} />
        <Route path="/academic/timetable" element={<TimetablePage />} />
        <Route path="/academic/report-cards" element={<ReportCardPage />} />
        <Route
          path="/staff"
          element={
            <RequirePermission permission="staff:read">
              <StaffPage />
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
          path="/expense"
          element={
            <RequirePermission permission="expense:read">
              <ExpensesPage />
            </RequirePermission>
          }
        />
        <Route path="/expense/budgets" element={<BudgetsPage />} />
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
