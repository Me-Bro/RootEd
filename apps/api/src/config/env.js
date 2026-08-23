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
  CSRF_SECRET: z.string().min(32),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  SENTRY_DSN: z
    .string()
    .url()
    .or(z.literal(''))
    .optional()
    .transform((v) => v || undefined),
  EMAIL_PROVIDER: z.enum(['smtp', 'postmark']).default('smtp'),
  POSTMARK_API_TOKEN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// The canonical general-portal hostname: the configured PORTAL_SUBDOMAIN under
// APP_DOMAIN, or the bare APP_DOMAIN itself when none is set.
export function getPortalHost() {
  return env.PORTAL_SUBDOMAIN ? `${env.PORTAL_SUBDOMAIN}.${env.APP_DOMAIN}` : env.APP_DOMAIN;
}
