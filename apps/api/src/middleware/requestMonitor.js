import { enqueueRequestLog, deriveModule } from '../services/requestLog.service.js';
import { logger } from '../utils/logger.js';

// Hit constantly by scrapes/preflight and carry no security-relevant signal.
const SKIP_PATHS = new Set(['/metrics', '/health', '/csrf-token']);

// Registered early in app.js, same as the Prometheus metrics middleware — reads
// req.tenant/req.user inside res.on('finish'), so it sees whatever resolveTenant()
// and authenticate() attached further down the chain regardless of mount order.
export function requestMonitor(req, res, next) {
  const start = process.hrtime();

  res.on('finish', () => {
    if (SKIP_PATHS.has(req.path)) return;

    const [sec, ns] = process.hrtime(start);
    const durationMs = Math.round((sec * 1e9 + ns) / 1e6);

    enqueueRequestLog({
      tenantId: req.tenant?._id,
      tenantSubdomain: req.tenant?.subdomain,
      module: deriveModule(req.path),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userId: req.user?.sub,
      userAgent: req.headers['user-agent'],
      traceId: req.traceId,
    }).catch((err) => logger.error({ err }, 'Failed to enqueue request log'));
  });

  next();
}
