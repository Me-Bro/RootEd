import { hasSeats } from '@rooted/shared/utils';
import { AppError } from './errorHandler.js';

// Seats, walk-ins, plans and check-in exist only for study centers. Gating on
// orgType (not on a module) keeps tuition and coaching centers, which share the
// same modules, exactly as they are.
export function requireSeatsOrg(req, _res, next) {
  if (!req.tenant) return next(new AppError('Tenant context missing', 400));
  if (!hasSeats(req.tenant.orgType)) {
    return next(new AppError('Not available for this organization type', 403));
  }
  next();
}
