import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

export const PERMISSIONS = [
  'attendance:read',
  'attendance:write',
  'grades:read',
  'grades:write',
  'grades:publish',
  'students:read',
  'students:write',
  'staff:read',
  'staff:write',
  'leave:read',
  'leave:write',
  'leave:approve',
  'expense:read',
  'expense:write',
  'expense:approve',
  'fees:read',
  'fees:write',
  'fees:collect',
  'inventory:read',
  'inventory:write',
  'payroll:read',
  'payroll:write',
  'roles:read',
  'roles:write',
  'audit:read',
  'tenant:admin',
];

export const DEFAULT_ROLE_TEMPLATES = {
  tenant_admin: PERMISSIONS,
  principal: PERMISSIONS.filter(
    (p) => !p.endsWith(':write') || p === 'leave:approve' || p === 'expense:approve'
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
