import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n/index.js';
import App from './App.jsx';
import { CrashFallback } from './components/ui/Feedback.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { initReporting } from './lib/report.js';

initReporting();

// Installable and openable offline. Only in a built app: in dev it would cache stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={<CrashFallback />}>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
