import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1),
  // Optional override for the request-monitoring database connection. When unset,
  // it's derived from MONGODB_URI by appending "_monitoring" to the db name.
  MONITORING_MONGODB_URI: z.string().optional(),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  S3_ENDPOINT: z.string().min(1),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().default('rooted'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@rooted.app'),
  MASTER_ENCRYPTION_KEY: z.string().min(32),
  APP_DOMAIN: z.string().default('rooted.app'),
  // Optional single-label subdomain (e.g. "rooted") that should be treated as the
  // bare/general-portal host — same as APP_DOMAIN itself with zero labels — instead
  // of being looked up as a real tenant subdomain. Needed on deployments (like the
  // Cloudflare Tunnel one) where the apex domain isn't reachable/desired for login.
  PORTAL_SUBDOMAIN: z.string().optional(),
  // Public origin of the RR Cloud Career Catalyst portal (apps/catalyst), e.g.
  // "https://catalyst.ruralrootcloud.com". Only used so a password-reset link
  // requested from that portal, and a claim link for a college on the training
  // programme, open there; unset, every link goes to the main app.
  CATALYST_PUBLIC_URL: z
    .string()
    .url()
    .optional()
    .transform((v) => v?.replace(/\/+$/, '')),
  // Comma-separated full origins (e.g. "https://rooted-uat.ranabrothers.online") served
  // in addition to *.APP_DOMAIN — lets one deployment answer on a second domain. CORS
  // plus emailed links (see getPortalHost); tenants still resolve under APP_DOMAIN.
  EXTRA_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    ),
  CSRF_SECRET: z.string().min(32),
  // Google OAuth client id used to verify Google Sign-In ID tokens
  // (audience check). Unset disables POST /auth/google rather than breaking
  // boot — same philosophy as a blank SMTP_HOST no-op'ing below.
  GOOGLE_CLIENT_ID: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  SENTRY_DSN: z
    .string()
    .url()
    .or(z.literal(''))
    .optional()
    .transform((v) => v || undefined),
  // Registration and organization creation are free and unlimited while this is
  // false: no trial is started, the trial-expiry worker stands down, /billing
  // is unmounted, and capability checks pass. Turning it on is what makes the
  // product paid — see docs/adr/006-free-tier-and-deferred-billing.txt.
  BILLING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // 'console' delivers nothing — it logs the message and its link. For
  // self-hosted/demo boxes with no mail provider; see consoleAdapter.js.
  EMAIL_PROVIDER: z.enum(['smtp', 'postmark', 'console']).default('smtp'),
  POSTMARK_API_TOKEN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export function isAllowedOrigin(origin) {
  return (
    origin.endsWith(`.${env.APP_DOMAIN}`) ||
    origin === `https://${env.APP_DOMAIN}` ||
    env.EXTRA_ALLOWED_ORIGINS.includes(origin)
  );
}

// The canonical general-portal hostname: the configured PORTAL_SUBDOMAIN under
// APP_DOMAIN, or the bare APP_DOMAIN itself when none is set.
//
// Pass the request's Host to keep an emailed link on the domain the user is on
// (the portal can answer on a second domain via EXTRA_ALLOWED_ORIGINS). Only the
// canonical host and the EXTRA_ALLOWED_ORIGINS hosts are honoured — anything else
// falls back to canonical, since a reflected Host would let a forged request get
// a password-reset link emailed that points at the attacker's domain.
export function getPortalHost(reqHost) {
  const canonical = env.PORTAL_SUBDOMAIN
    ? `${env.PORTAL_SUBDOMAIN}.${env.APP_DOMAIN}`
    : env.APP_DOMAIN;
  const host = (reqHost ?? '').split(':')[0].toLowerCase();
  const extra = env.EXTRA_ALLOWED_ORIGINS.map((o) => URL.parse(o)?.hostname);
  return host && extra.includes(host) ? host : canonical;
}

// Origin that a password-reset link should open. `app` is a fixed name, never a
// URL from the request: a caller-supplied address would let anyone get a valid
// reset token mailed to a page they control.
export function getResetBaseUrl(app, reqHost) {
  if (app === 'portal' && env.CATALYST_PUBLIC_URL) return env.CATALYST_PUBLIC_URL;
  return `https://${getPortalHost(reqHost)}`;
}
