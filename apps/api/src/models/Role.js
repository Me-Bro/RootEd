import mongoose from 'mongoose';
import { PERMISSIONS } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// PERMISSIONS is defined once, in @rooted/shared, alongside ORG_TYPES and the
// other cross-app constants. It is re-exported here so the API's existing
// importers keep working and so the Role schema enum can never drift from the
// list the rest of the workspace validates against.
export { PERMISSIONS };

export const DEFAULT_ROLE_TEMPLATES = {
  tenant_admin: PERMISSIONS,
  // Reads and approvals, but no writes and — deliberately — no tenant:admin.
  // The ':approve' permissions need no special case: they do not end in
  // ':write', so the filter already keeps them.
  principal: PERMISSIONS.filter((p) => !p.endsWith(':write') && p !== 'tenant:admin'),
  teacher: [
    'attendance:read',
    'attendance:write',
    'grades:read',
    'grades:write',
    'grades:publish',
    'students:read',
    'leave:read',
    'leave:write',
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
