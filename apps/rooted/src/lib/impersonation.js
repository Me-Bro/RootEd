export function buildImpersonateUrl(subdomain, accessToken) {
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'rooted.app';
  const portalSubdomain = import.meta.env.VITE_PORTAL_SUBDOMAIN;
  const host = subdomain
    ? `${subdomain}.${appDomain}`
    : portalSubdomain
      ? `${portalSubdomain}.${appDomain}`
      : appDomain;
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//${host}${port}/impersonate#token=${accessToken}`;
}
