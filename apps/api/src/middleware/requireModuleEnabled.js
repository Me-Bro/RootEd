import { isModuleEnabled } from '@rooted/shared/utils';
import { AppError } from './errorHandler.js';

export function requireModuleEnabled(moduleName) {
  return (req, _res, next) => {
    if (!req.tenant) return next(new AppError('Tenant context missing', 400));
    if (!isModuleEnabled(req.tenant.orgType, moduleName)) {
      return next(new AppError('Module not enabled for this organization type', 403));
    }
    next();
  };
}
