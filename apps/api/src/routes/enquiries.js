import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { enquirySubmitSchema } from '@rooted/shared/schemas';
import { CollegeEnquiry } from '../models/CollegeEnquiry.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';

const router = Router();

const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 5 : 500,
  message: { error: 'Too many submissions, try again later' },
});

// Public: a college that has no account yet. Bots that fill the hidden
// `website` field get the same 201 a person would, so they learn nothing.
router.post('/', enquiryLimiter, validate(enquirySubmitSchema), async (req, res, next) => {
  try {
    const { website, ...fields } = req.body;
    if (website) return res.status(201).json({});
    const enquiry = await CollegeEnquiry.create(fields);
    res.status(201).json({ id: enquiry._id });
  } catch (err) {
    next(err);
  }
});

export default router;
