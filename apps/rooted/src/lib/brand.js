// Company branding shown on the public pages (landing, legal), picked from the
// hostname the page is served on — the web build is static and shared by every
// domain, so this can't be a build-time variable. "RootEd" is the product name on
// every domain; only the company behind it differs.
const RURAL_ROOT_CLOUD = {
  company: 'Rural Root Cloud Tech Services And Training',
  shortName: 'Rural Root Cloud',
  contactEmail: 'info@ruralrootcloud.com',
  parentSiteUrl: 'https://ruralrootcloud.com/',
  portalHost: 'rooted.ruralrootcloud.com',
  // The "rural to global" quote, about section and values are Rural Root Cloud's
  // own story; brands without copy of their own hide them.
  showStory: true,
};

const RANA_BROTHERS = {
  company: 'Rana Brothers',
  shortName: 'Rana Brothers',
  contactEmail: 'hello@ranabrothers.online',
  parentSiteUrl: 'https://ranabrothers.online/',
  portalHost: 'rooted.ranabrothers.online',
  showStory: false,
};

// Unknown hosts (localhost, tenant subdomains, previews) get Rural Root Cloud, as
// before this was configurable.
export function resolveBrand(hostname = '') {
  const host = hostname.toLowerCase();
  if (host === 'ranabrothers.online' || host.endsWith('.ranabrothers.online')) {
    return RANA_BROTHERS;
  }
  return RURAL_ROOT_CLOUD;
}

export const brand = resolveBrand(typeof window === 'undefined' ? '' : window.location.hostname);
