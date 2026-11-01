/**
 * Fee plans and discounts need an academic year, and a study center has none.
 * New study centers get an "Ongoing" year when they are provisioned; this gives
 * the same year to the ones that already exist and have no academic year at all.
 *
 * A study center that already has any year (the owner made one) is left alone.
 * Idempotent: the second run finds the year it created.
 */

import { Tenant } from '../models/Tenant.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { ONGOING_YEAR_NAME, ONGOING_YEAR_SPAN_DAYS } from '@rooted/shared/constants';

export async function up() {
  const tenants = await Tenant.find({ orgType: 'study_center' }, '_id').lean();
  for (const { _id: tenantId } of tenants) {
    const hasYear = await AcademicYear.findOne({ tenantId }, '_id', { _bypassTenantScope: true });
    if (hasYear) continue;
    await AcademicYear.create({
      tenantId,
      name: ONGOING_YEAR_NAME,
      startDate: new Date(),
      endDate: new Date(Date.now() + ONGOING_YEAR_SPAN_DAYS * 24 * 60 * 60 * 1000),
      isActive: true,
    });
  }
}
