import mongoose from 'mongoose';
import { PERMISSIONS, isSelfScoped } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// PERMISSIONS is defined once, in @rooted/shared, alongside ORG_TYPES and the
// other cross-app constants. It is re-exported here so the API's existing
// importers keep working and so the Role schema enum can never drift from the
// list the rest of the workspace validates against.
export { PERMISSIONS };

// Tenant-wide roles never carry self: permissions. A tenant_admin has no
// student record for them to resolve against, and granting both would mean two
// code paths could answer the same question differently.
const TENANT_WIDE = PERMISSIONS.filter((p) => !isSelfScoped(p));

export const DEFAULT_ROLE_TEMPLATES = {
  tenant_admin: TENANT_WIDE,
  // Reads and approvals, but no writes and — deliberately — no tenant:admin.
  // The ':approve' permissions need no special case: they do not end in
  // ':write', so the filter already keeps them.
  // 'training:complete' is an admin decision (it feeds the completion figure the
  // college is billed against) and, like 'tenant:admin', does not end in ':write'.
  principal: TENANT_WIDE.filter(
    (p) => !p.endsWith(':write') && p !== 'tenant:admin' && p !== 'training:complete'
  ),
  teacher: [
    'attendance:read',
    'attendance:write',
    'grades:read',
    'grades:write',
    'grades:publish',
    'students:read',
    'leave:read',
    'leave:write',
    'training:read',
    'training:write',
  ],
  accountant: [
    'fees:read',
    'fees:write',
    'fees:collect',
    'expense:read',
    'expense:write',
    'payroll:read',
    'payroll:write',
  ],
  librarian: ['inventory:read', 'inventory:write'],
  // Study-center front desk: registers walk-ins, assigns seats, checks learners in
  // and out and takes payment. Deliberately has no 'fees:write' (cannot create
  // plans or discount beyond the tenant's discountPolicy) and no 'tenant:admin'.
  // Provisioned only for orgTypes where hasSeats() is true.
  front_desk: [
    'students:read',
    'students:write',
    'attendance:read',
    'attendance:write',
    'fees:read',
    'fees:collect',
  ],
  // Holds nothing tenant-wide. Every route a student can reach lives under
  // /me and answers only about them.
  student: PERMISSIONS.filter(isSelfScoped),
};

const roleSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    permissions: [{ type: String, enum: PERMISSIONS }],
    isTemplate: { type: Boolean, default: false },
    templateKey: { type: String },
  },
  { timestamps: true }
);

roleSchema.plugin(tenantScopePlugin);
roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Role = mongoose.model('Role', roleSchema);
