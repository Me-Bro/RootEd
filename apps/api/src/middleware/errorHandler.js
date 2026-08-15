import { ZodError } from 'zod';
import mongoose from 'mongoose';
import * as Sentry from '@sentry/node';
import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation error', details: err.flatten().fieldErrors });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message])
    );
    return res.status(400).json({ error: 'Validation error', details });
  }

  const status = err.status ?? err.statusCode ?? 500;
  const message = status < 500 ? err.message : 'Internal server error';

  if (status >= 500) {
    logger.error({ err, req: { method: req.method, url: req.url } }, message);
    Sentry.captureException(err);
  }

  res.status(status).json({ error: message });
}

export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
