import { Router } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import { markBounced } from '../services/emailBounce.service.js';

const router = Router();

// Only these say the address is gone. Soft bounces, auto-responders and spam
// complaints do not. ponytail: names from Postmark's bounce API; confirm against
// their docs if the set changes.
const HARD_BOUNCE_TYPES = new Set(['HardBounce', 'BadEmailAddress']);

const digest = (s) => createHash('sha256').update(s).digest();

// Postmark is given https://user:SECRET@host/... so it sends HTTP Basic; only the
// password half is checked. Fails closed when no secret is configured.
function authorized(req) {
  if (!env.POSTMARK_WEBHOOK_SECRET) return false;
  const [scheme, encoded] = String(req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const supplied = Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':');
  return timingSafeEqual(digest(supplied), digest(env.POSTMARK_WEBHOOK_SECRET));
}

// Public and tenant-agnostic, so it mounts before resolveTenant() and is exempt
// from CSRF (see app.js): the caller is Postmark, not a browser. Always answers
// 200 once authorized so Postmark does not retry on an event we chose to ignore.
router.post('/postmark/bounce', async (req, res, next) => {
  try {
    if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { Type, Email } = req.body ?? {};
    if (HARD_BOUNCE_TYPES.has(Type) && Email) await markBounced(Email, Type);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

export default router;
