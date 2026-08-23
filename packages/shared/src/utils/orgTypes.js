import { ORG_TYPE_CONFIG } from '../constants/index.js';

function resolveConfig(orgType) {
  return ORG_TYPE_CONFIG[orgType] ?? ORG_TYPE_CONFIG.school;
}

export function isModuleEnabled(orgType, moduleName) {
  return resolveConfig(orgType).enabledModules.includes(moduleName);
}

export function resolveOrgTerm(orgType, key) {
  return resolveConfig(orgType).terms[key];
}
