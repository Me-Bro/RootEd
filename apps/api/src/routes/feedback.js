import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { feedbackSubmitSchema } from '@rooted/shared/schemas';
import { Feedback } from '../models/Feedback.js';
import { decodeOptionalUser } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';

const router = Router();

const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 5 : 500,
  message: { error: 'Too many submissions, try again later' },
});

// Public: works for an anonymous landing-page visitor and a logged-in tenant
// user alike — decodeOptionalUser() never throws, so a missing/invalid token
// just means an anonymous submission rather than a rejected request.
router.post('/', feedbackLimiter, validate(feedbackSubmitSchema), async (req, res, next) => {
  try {
    const optionalUser = decodeOptionalUser(req);
    const feedback = await Feedback.create({
      ...req.body,
      userId: optionalUser?.userId,
      tenantId: optionalUser?.tenantId ?? undefined,
    });
    res.status(201).json({ id: feedback._id });
  } catch (err) {
    next(err);
  }
});

export default router;
