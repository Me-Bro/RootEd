import { randomUUID } from 'crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { rateLimit } from 'express-rate-limit';
import { doubleCsrf } from 'csrf-csrf';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';
import { logger } from './utils/logger.js';
import { env, isAllowedOrigin } from './config/env.js';
import { redis } from './config/redis.js';
import { errorHandler } from './middleware/errorHandler.js';
import { resolveTenant } from './middleware/resolveTenant.js';
import { requireModuleEnabled } from './middleware/requireModuleEnabled.js';
import { sanitizeBody } from './utils/sanitize.js';
import { swaggerSpec } from './config/swagger.js';
import { httpRequestDuration, httpRequestTotal, registry } from './config/metrics.js';
import { requestMonitor } from './middleware/requestMonitor.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import tenantRouter from './routes/tenant.js';
import academicRouter from './routes/academic.js';
import walkInRouter from './routes/walkins.js';
import seatsRouter from './routes/seats.js';
import visitsRouter from './routes/visits.js';
import trainingRouter from './routes/training.js';
import roadmapRouter from './routes/roadmap.js';
import staffRouter from './routes/staff.js';
import expenseRouter from './routes/expense.js';
import feeRouter from './routes/fee.js';
import inventoryRouter from './routes/inventory.js';
import billingRouter from './routes/billing.js';
import orgsRouter from './routes/orgs.js';
import meRouter from './routes/me.js';
import feedbackRouter from './routes/feedback.js';
import enquiriesRouter from './routes/enquiries.js';
import webhooksRouter from './routes/webhooks.js';

const app = express();

// Proxy hops in front of the API. The tunnel stack has two (X-Forwarded-For is
// "client, <upstream proxy>" and the socket peer is the last nginx), so 1 made
// every visitor look like the same internal address: one shared rate-limit
// bucket for all users, and wrong IPs in audit logs. See TRUST_PROXY_HOPS.
app.set('trust proxy', env.TRUST_PROXY_HOPS);

// ── Trace ID ─────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.traceId = randomUUID();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
});

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (env.NODE_ENV === 'development') return cb(null, true);
      if (isAllowedOrigin(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeBody);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.traceId,
  })
);

// ── Prometheus metrics middleware ─────────────────────────────────────────────
app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const [sec, ns] = process.hrtime(start);
    const duration = sec + ns / 1e9;
    const route = req.route?.path ?? req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });
  next();
});

app.use(requestMonitor);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    // A SPA page fires ~10-20 calls, so 300 locked out a normal user in minutes.
    max: env.NODE_ENV === 'production' ? 3000 : 10_000,
    standardHeaders: true,
    legacyHeaders: false,
    // Session renewal must never be throttled by the bucket: a 429 on refresh logs the user out.
    skip: (req) =>
      env.NODE_ENV === 'test' || req.path === '/auth/refresh' || req.path === '/auth/me',
  })
);

// ── CSRF ─────────────────────────────────────────────────────────────────────
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  cookieName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
  size: 64,
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
  // Not bound to the client IP: a phone's address changes mid-session, which
  // would invalidate its token. The cookie/header double-submit still applies.
  getSessionIdentifier: () => 'rooted',
});

// CSRF token endpoint (GET — safe, no protection needed)
app.get('/csrf-token', (req, res, next) => {
  try {
    const csrfToken = generateCsrfToken(req, res);
    res.json({ csrfToken });
  } catch (err) {
    next(err);
  }
});

// Apply CSRF to all state-changing routes EXCEPT /auth/login
// (login issues the cookie so it cannot yet have a token)
app.use((req, res, next) => {
  const method = req.method;
  const path = req.path;
  // Skip CSRF for login (issues cookie) and GET/HEAD/OPTIONS. /auth/google is
  // the same case as /auth/login — an unauthenticated caller with no prior
  // session can't have a CSRF token yet either.
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
  if (path === '/auth/login' || path === '/auth/refresh' || path === '/auth/google') {
    return next();
  }
  // Server-to-server callbacks (Postmark): no browser, no cookie, so no CSRF
  // token. They authenticate with their own shared secret instead.
  if (path.startsWith('/webhooks/')) return next();
  doubleCsrfProtection(req, res, next);
});

// ── Metrics endpoint ──────────────────────────────────────────────────────────
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: 'unknown',
      redis: 'unknown',
    },
  };
  try {
    await mongoose.connection.db.admin().ping();
    checks.services.mongodb = 'ok';
  } catch {
    checks.services.mongodb = 'error';
    checks.status = 'degraded';
  }
  try {
    await redis.ping();
    checks.services.redis = 'ok';
  } catch {
    checks.services.redis = 'error';
    checks.status = 'degraded';
  }
  res.status(checks.status === 'ok' ? 200 : 503).json(checks);
});

// ── Swagger UI ────────────────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
// Portal-mounted, before resolveTenant(): creating an organization happens on
// the bare domain, where there is no tenant to resolve yet.
app.use('/orgs', orgsRouter);
// Public, no auth required: works for an anonymous landing-page visitor and
// a logged-in tenant user alike (see decodeOptionalUser in feedback.js).
app.use('/feedback', feedbackRouter);
// Public too: a college asking for a proposal from the Career Catalyst landing page.
app.use('/enquiries', enquiriesRouter);
// Provider callbacks. Public and tenant-agnostic; each route checks its own secret.
app.use('/webhooks', webhooksRouter);

app.use(resolveTenant);

// Tenant-scoped, and the only surface a self-scoped role can reach. Its
// handlers never accept an identity from the caller — see routes/me.js.
app.use('/me', meRouter);
app.use('/tenant', tenantRouter);
app.use('/academic', requireModuleEnabled('academic'), academicRouter);
// Study-center routers share the /academic prefix and are gated on orgType.
app.use('/academic', requireModuleEnabled('academic'), walkInRouter);
app.use('/academic', requireModuleEnabled('academic'), seatsRouter);
app.use('/academic', requireModuleEnabled('academic'), visitsRouter);
app.use('/staff', requireModuleEnabled('staff'), staffRouter);
app.use('/expense', requireModuleEnabled('expense'), expenseRouter);
app.use('/fee', requireModuleEnabled('fee'), feeRouter);
app.use('/inventory', requireModuleEnabled('inventory'), inventoryRouter);
// Before trainingRouter, which would otherwise authenticate the request first.
app.use('/training/roadmaps', requireModuleEnabled('training'), roadmapRouter);
app.use('/training', requireModuleEnabled('training'), trainingRouter);
// Unmounted entirely while the product is free, so the subscribe and webhook
// endpoints are not merely inert but absent.
if (env.BILLING_ENABLED) {
  app.use('/billing', requireModuleEnabled('billing'), billingRouter);
}

app.use(errorHandler);

export default app;
// watch-test
