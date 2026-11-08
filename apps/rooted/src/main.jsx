import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { ThemeProvider } from 'next-themes';
import './index.css';
import './i18n/index.js';
import App from './App.jsx';
import { loadPersistedTheme } from './components/ui/ThemeConfigurator.jsx';
import { RouteStatus } from './components/layout/RouteStatus.jsx';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE });
}

loadPersistedTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {/* Last resort for a crash outside the app shell (sign-in, onboarding). */}
      <Sentry.ErrorBoundary fallback={<RouteStatus kind="crash" />}>
        <App />
      </Sentry.ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
