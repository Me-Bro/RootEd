import { resolveCentreSettings } from './centreSettings.js';
import { autoCloseAt } from './openHours.js';

// A visit left open this long is closed even when no closing time applies (a
// 24-hour centre, or someone let in after hours). A constant, not a setting.
export const MAX_VISIT_HOURS = 16;

/**
 * Which open visits are due to be closed at `now`, and when to say they ended.
 * `tenants` maps tenant id to the tenant (for its hours and timezone). A visit whose
 * tenant is unknown is left alone.
 */
export function selectVisitsToClose({ openVisits, tenants, now, maxVisitHours = MAX_VISIT_HOURS }) {
  const maxVisitMs = maxVisitHours * 60 * 60 * 1000;
  const due = [];
  for (const visit of openVisits) {
    const tenant = tenants.get(String(visit.tenantId));
    if (!tenant) continue;
    const at = autoCloseAt(
      new Date(visit.inAt),
      resolveCentreSettings(tenant),
      tenant.timezone,
      maxVisitMs
    );
    if (now >= at) due.push({ visitId: visit._id, tenantId: visit.tenantId, outAt: at });
  }
  return due;
}
