import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n/index.js';
import { pushToast } from '@/lib/toast.js';
import { Toaster } from '@/components/ui/Toaster.jsx';
import { AuthProvider } from '@/contexts/AuthContext.jsx';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission, homeRoute } from '@/lib/access.js';
import { Spinner } from '@/components/ui/Feedback.jsx';
import PortalShell from '@/components/layout/PortalShell.jsx';
import LandingPage from '@/pages/LandingPage.jsx';
import LoginPage from '@/pages/LoginPage.jsx';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from '@/pages/ResetPasswordPage.jsx';
import SelectCollegePage from '@/pages/SelectCollegePage.jsx';
import NoAccessPage from '@/pages/NoAccessPage.jsx';
const DashboardPage = lazy(() => import('@/pages/DashboardPage.jsx'));
const MyProgressPage = lazy(() => import('@/pages/MyProgressPage.jsx'));
const MyRoadmapPage = lazy(() => import('@/pages/MyRoadmapPage.jsx'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage.jsx'));
const OutcomesPage = lazy(() => import('@/pages/OutcomesPage.jsx'));
const EnquiriesPage = lazy(() => import('@/pages/EnquiriesPage.jsx'));
const AssignmentsPage = lazy(() => import('@/pages/AssignmentsPage.jsx'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage.jsx'));
const PlacementPage = lazy(() => import('@/pages/PlacementPage.jsx'));
const ReadinessPage = lazy(() => import('@/pages/ReadinessPage.jsx'));
const CompletionPage = lazy(() => import('@/pages/CompletionPage.jsx'));
const RoadmapPage = lazy(() => import('@/pages/RoadmapPage.jsx'));
const PeopleStudentsPage = lazy(() => import('@/pages/PeopleStudentsPage.jsx'));
const PeopleTeamPage = lazy(() => import('@/pages/PeopleTeamPage.jsx'));

// Pages for anyone who can read the college's training data (trainer, TPO, admin).
// What a page lets them change is decided inside it, by training:write / :complete.
const STAFF_PAGES = [
  { path: '/dashboard', Page: DashboardPage },
  { path: '/assignments', Page: AssignmentsPage },
  { path: '/roadmap', Page: RoadmapPage },
  { path: '/projects', Page: ProjectsPage },
  { path: '/placement', Page: PlacementPage },
  { path: '/readiness', Page: ReadinessPage },
  { path: '/completion', Page: CompletionPage },
];

// Every save reports itself here, so no page has to remember to. A mutation that
// is not a user's save (e.g. clearing the bell) sets `meta: { silent: true }`.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      if (!mutation.meta?.silent) pushToast(i18n.t('toast.saved'));
    },
    onError: (error, _vars, _ctx, mutation) => {
      if (!mutation.meta?.silent) {
        pushToast(error?.response?.data?.error || i18n.t('common.error'), 'error');
      }
    },
  }),
});

/** Signed in, with the user record loaded (AuthContext drops the token if /auth/me fails). */
function RequireAuth({ children }) {
  const { accessToken, user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!accessToken || !user) return <Navigate to="/login" replace />;
  return children;
}

/**
 * A page that needs a college (and the training module) plus one permission, or,
 * with `superAdmin`, the platform role instead. Anyone else is sent to wherever
 * homeRoute() says they belong, so no one is ever left on a blank page.
 */
function RequireAccess({ permission, superAdmin = false, children }) {
  const { user } = useAuth();
  const home = homeRoute(user);
  const isSuper = user.systemRole === 'super_admin';

  if (superAdmin) return isSuper ? children : <Navigate to={home.path} replace />;
  if (isSuper) return <Navigate to="/outcomes" replace />;
  if (home.path === '/select-college' || home.path === '/no-access') {
    return <Navigate to={home.path} replace />;
  }
  return hasPermission(user, permission) ? children : <Navigate to={home.path} replace />;
}

/**
 * `/` is the public landing page. It shows straight away (most visitors are not
 * signed in); someone who turns out to be signed in is sent where they belong.
 */
function RootRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to={homeRoute(user).path} replace />;
  return <LandingPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/select-college"
              element={
                <RequireAuth>
                  <SelectCollegePage />
                </RequireAuth>
              }
            />
            <Route
              path="/no-access"
              element={
                <RequireAuth>
                  <NoAccessPage />
                </RequireAuth>
              }
            />
            <Route path="/" element={<RootRoute />} />

            <Route
              element={
                <RequireAuth>
                  <PortalShell />
                </RequireAuth>
              }
            >
              {STAFF_PAGES.map(({ path, Page }) => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <RequireAccess permission="training:read">
                      <Page />
                    </RequireAccess>
                  }
                />
              ))}
              {/* what a person may change is decided inside: students:write, roles:write */}
              <Route
                path="/people/students"
                element={
                  <RequireAccess permission="students:read">
                    <PeopleStudentsPage />
                  </RequireAccess>
                }
              />
              <Route
                path="/people/team"
                element={
                  <RequireAccess permission="roles:read">
                    <PeopleTeamPage />
                  </RequireAccess>
                }
              />
              <Route
                path="/me/progress"
                element={
                  <RequireAccess permission="self:training:read">
                    <MyProgressPage />
                  </RequireAccess>
                }
              />
              <Route
                path="/me/roadmap"
                element={
                  <RequireAccess permission="self:training:read">
                    <MyRoadmapPage />
                  </RequireAccess>
                }
              />
              <Route
                path="/me/leaderboard"
                element={
                  <RequireAccess permission="self:training:read">
                    <LeaderboardPage />
                  </RequireAccess>
                }
              />
              <Route
                path="/outcomes"
                element={
                  <RequireAccess superAdmin>
                    <OutcomesPage />
                  </RequireAccess>
                }
              />
              <Route
                path="/enquiries"
                element={
                  <RequireAccess superAdmin>
                    <EnquiriesPage />
                  </RequireAccess>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
