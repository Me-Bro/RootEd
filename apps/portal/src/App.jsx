import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext.jsx';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission, homeRoute } from '@/lib/access.js';
import { Spinner } from '@/components/ui/Feedback.jsx';
import PortalShell from '@/components/layout/PortalShell.jsx';
import LandingPage from '@/pages/LandingPage.jsx';
import LoginPage from '@/pages/LoginPage.jsx';
import SelectCollegePage from '@/pages/SelectCollegePage.jsx';
import NoAccessPage from '@/pages/NoAccessPage.jsx';
import DashboardPage from '@/pages/DashboardPage.jsx';
import MyProgressPage from '@/pages/MyProgressPage.jsx';
import OutcomesPage from '@/pages/OutcomesPage.jsx';
import EnquiriesPage from '@/pages/EnquiriesPage.jsx';
import AssignmentsPage from '@/pages/AssignmentsPage.jsx';
import ProjectsPage from '@/pages/ProjectsPage.jsx';
import PlacementPage from '@/pages/PlacementPage.jsx';
import ReadinessPage from '@/pages/ReadinessPage.jsx';
import CompletionPage from '@/pages/CompletionPage.jsx';

// Pages for anyone who can read the college's training data (trainer, TPO, admin).
// What a page lets them change is decided inside it, by training:write / :complete.
const STAFF_PAGES = [
  { path: '/dashboard', Page: DashboardPage },
  { path: '/assignments', Page: AssignmentsPage },
  { path: '/projects', Page: ProjectsPage },
  { path: '/placement', Page: PlacementPage },
  { path: '/readiness', Page: ReadinessPage },
  { path: '/completion', Page: CompletionPage },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
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
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
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
              <Route
                path="/me/progress"
                element={
                  <RequireAccess permission="self:training:read">
                    <MyProgressPage />
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
