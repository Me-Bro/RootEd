import { Tenant } from '../models/Tenant.js';
import { AppError } from './errorHandler.js';
import { env } from '../config/env.js';

export async function resolveTenant(req, res, next) {
  try {
    const host = req.hostname;
    const subdomain = host.replace(`.${env.APP_DOMAIN}`, '');

    if (!subdomain || subdomain === host) return next(new AppError('Tenant not found', 404));

    const tenant = await Tenant.findOne({ subdomain, status: 'active' }).lean();
    if (!tenant) return next(new AppError('Tenant not found or suspended', 404));

    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}
