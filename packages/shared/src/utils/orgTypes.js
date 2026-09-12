import { ORG_TYPE_CONFIG } from '../constants/index.js';

function resolveConfig(orgType) {
  return ORG_TYPE_CONFIG[orgType] ?? ORG_TYPE_CONFIG.school;
}

// Accepts either a raw orgType string (legacy) or a tenant-like object
// ({ orgType, enabledModules }) whose enabledModules, when set, overrides the
// orgType default — this is what lets a super_admin toggle a module for one
// specific tenant instead of every tenant of that orgType.
export function isModuleEnabled(tenantOrOrgType, moduleName) {
  const tenantLike =
    typeof tenantOrOrgType === 'string' ? { orgType: tenantOrOrgType } : tenantOrOrgType;
  const modules = tenantLike?.enabledModules ?? resolveConfig(tenantLike?.orgType).enabledModules;
  return modules.includes(moduleName);
}

export function resolveOrgTerm(orgType, key) {
  return resolveConfig(orgType).terms[key];
}

// True for tuition/coaching/study-center orgTypes — anywhere a "section" is a
// batch a learner drops in and out of rather than a fixed annual homeroom.
// Derived from the terms config (classLevel === 'Batch') instead of listing
// orgType names, so a new batch-style orgType picks this up automatically.
export function isBatchOrgType(orgType) {
  return resolveConfig(orgType).terms.classLevel === 'Batch';
}
