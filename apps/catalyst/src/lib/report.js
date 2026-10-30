// Sentry is loaded only when a DSN is configured, so it stays out of the entry
// bundle everyone downloads. Until it arrives, early errors are not reported.
let sentry = null;

export function initReporting() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  sentry = import('@sentry/react').then((Sentry) => {
    Sentry.init({ dsn, environment: import.meta.env.MODE });
    return Sentry;
  });
}

export function reportError(error, info) {
  sentry?.then((Sentry) =>
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info?.componentStack } },
    })
  );
}
