import { Router } from 'express';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import { enquirySubmitSchema } from '@rooted/shared/schemas';
import { unescapeText } from '@rooted/shared/utils';
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
// `website` field get a reply shaped like a real one, so they learn nothing.
router.post('/', enquiryLimiter, validate(enquirySubmitSchema), async (req, res, next) => {
  try {
    const { website, ...fields } = req.body;
    if (website) return res.status(201).json({ id: new mongoose.Types.ObjectId() });
    const text = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, unescapeText(v)]));
    const enquiry = await CollegeEnquiry.create(text);
    res.status(201).json({ id: enquiry._id });
  } catch (err) {
    next(err);
  }
});

export default router;
