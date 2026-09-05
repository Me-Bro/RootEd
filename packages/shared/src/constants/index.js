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

export const USER_STATUS = ['active', 'invited', 'suspended', 'pending_verification'];

// 'invited'  — a seat exists but the person has not accepted it yet
// 'pending'  — the person asked to join and an admin has not decided yet (P3)
// 'rejected' — kept rather than deleted so a rejected request cannot simply be
//              resubmitted, and so a suspended member cannot rejoin around it
export const MEMBERSHIP_STATUS = ['active', 'invited', 'pending', 'suspended', 'rejected'];

export const JOIN_METHODS = ['invite', 'join_code', 'request', 'import', 'founder'];

export const INVITE_STATUS = ['pending', 'accepted', 'revoked', 'expired'];

// 'closed'  — the only way in is an invitation
// 'code'    — anyone holding the join code may ask to join
export const JOIN_POLICY_MODES = ['closed', 'code'];

// Crockford base32. '0' and '1' are in the alphabet; the letters they are
// confused with (I, L, O) are not, and are folded into them when a typed code
// is normalised. U is omitted so the encoding cannot spell unfortunate words.
export const JOIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const JOIN_CODE_LENGTH = 10;
export const JOIN_CODE_PREFIX = 'RTED';

export const PASSWORD_MIN_LENGTH = 8;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

// Deliberately excludes '@'. That is what makes the login identifier
// unambiguous: an identifier containing '@' is an email address, anything else
// is a username — no guessing, no double lookup. The anchors also stop a
// username starting or ending with a separator.
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;

// Names that would let someone impersonate the product, the platform team, or
// a position of authority inside a school. Checked case-insensitively against
// the normalised (lowercased) username.
export const RESERVED_USERNAMES = [
  'abuse',
  'admin',
  'administrator',
  'api',
  'auth',
  'billing',
  'help',
  'hostmaster',
  'mail',
  'me',
  'moderator',
  'noreply',
  'no-reply',
  'owner',
  'postmaster',
  'principal',
  'root',
  'rooted',
  'security',
  'settings',
  'staff',
  'superadmin',
  'super-admin',
  'support',
  'sysadmin',
  'system',
  'webmaster',
  'www',
];

export const ASSESSMENT_TYPES = ['quiz', 'midterm', 'final', 'other'];

// The single source of truth for module permissions. apps/api/src/models/Role.js
// re-exports this and uses it as the Role schema's enum — do not redeclare the
// list there.
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
