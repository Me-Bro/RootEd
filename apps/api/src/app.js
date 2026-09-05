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
import { env } from './config/env.js';
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
import staffRouter from './routes/staff.js';
import expenseRouter from './routes/expense.js';
import feeRouter from './routes/fee.js';
import inventoryRouter from './routes/inventory.js';
import billingRouter from './routes/billing.js';
import orgsRouter from './routes/orgs.js';

const app = express();

app.set('trust proxy', 1);

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
      if (origin.endsWith(`.${env.APP_DOMAIN}`) || origin === `https://${env.APP_DOMAIN}`)
        return cb(null, true);
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
    max: env.NODE_ENV === 'production' ? 300 : 10_000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
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
  getSessionIdentifier: (req) => {
    const ip = req.ip ?? '127.0.0.1';
    return ip.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
  },
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
  // Skip CSRF for login (issues cookie) and GET/HEAD/OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
  if (path === '/auth/login' || path === '/auth/refresh') return next();
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

app.use(resolveTenant);

app.use('/tenant', tenantRouter);
app.use('/academic', requireModuleEnabled('academic'), academicRouter);
app.use('/staff', requireModuleEnabled('staff'), staffRouter);
app.use('/expense', requireModuleEnabled('expense'), expenseRouter);
app.use('/fee', requireModuleEnabled('fee'), feeRouter);
app.use('/inventory', requireModuleEnabled('inventory'), inventoryRouter);
// Unmounted entirely while the product is free, so the subscribe and webhook
// endpoints are not merely inert but absent.
if (env.BILLING_ENABLED) {
  app.use('/billing', requireModuleEnabled('billing'), billingRouter);
}

app.use(errorHandler);

export default app;
// watch-test
