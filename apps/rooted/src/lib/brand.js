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
  // The Android app is published under Rural Root Cloud's Play account, so only
  // this brand shows the Play badge and QR code (public/landing/qr-play.svg encodes
  // the same URL plus a landing_qr referrer). Brands without it hide both.
  playStoreUrl:
    'https://play.google.com/store/apps/details?id=com.ruralrootcloud.rooted&referrer=utm_source%3Dlanding',
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
  playStoreUrl: null,
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
