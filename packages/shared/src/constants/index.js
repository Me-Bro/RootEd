export const PLANS = ['starter', 'growth', 'pro', 'enterprise'];

export const ORG_TYPE_CONFIG = {
  school: {
    enabledModules: ['academic', 'staff', 'expense', 'fee', 'inventory', 'billing'],
    terms: { classLevel: 'Grade', section: 'Section', student: 'Student' },
  },
  college: {
    enabledModules: ['academic', 'staff', 'expense', 'fee', 'inventory', 'billing'],
    terms: { classLevel: 'Semester', section: 'Section', student: 'Student' },
  },
  tuition_center: {
    enabledModules: ['academic', 'staff', 'fee', 'billing'],
    terms: { classLevel: 'Batch', section: 'Group', student: 'Learner' },
  },
  coaching_center: {
    enabledModules: ['academic', 'staff', 'fee', 'billing'],
    terms: { classLevel: 'Batch', section: 'Group', student: 'Learner' },
  },
  study_center: {
    enabledModules: ['academic', 'staff', 'fee', 'billing'],
    terms: { classLevel: 'Batch', section: 'Group', student: 'Learner' },
  },
};

export const ORG_TYPES = Object.keys(ORG_TYPE_CONFIG);

export const TENANT_STATUS = ['active', 'suspended', 'archived'];

export const SYSTEM_ROLES = ['super_admin', 'support_agent'];

export const ASSESSMENT_TYPES = ['quiz', 'midterm', 'final', 'other'];

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
