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

// The reverse gate: the roll-call attendance write is for schools, colleges and the
// like. A study center records presence as check-in and check-out (a Visit), so it
// refuses a roll call with a message instead of keeping two records of one thing.
// 422, not 403: the caller may well hold the permission; the action does not apply.
export function rejectSeatsOrg(req, _res, next) {
  if (!req.tenant) return next(new AppError('Tenant context missing', 400));
  if (hasSeats(req.tenant.orgType)) {
    return next(new AppError('A study center records attendance by check-in and check-out', 422));
  }
  next();
}
