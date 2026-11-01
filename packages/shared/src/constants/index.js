// 'free' is the default and, while BILLING_ENABLED is false, the only tier
// anything is ever created on. The paid tiers are kept so existing tenants keep
// validating and so pricing does not have to be reinvented later.
export const PLANS = ['free', 'starter', 'growth', 'pro', 'enterprise'];
export const DEFAULT_PLAN = 'free';

// Single source of truth for the module enum — every module any orgType can
// grant in ORG_TYPE_CONFIG below, plus what a tenant's enabledModules override
// (Tenant.enabledModules) is validated against.
export const ALL_MODULES = [
  'academic',
  'staff',
  'expense',
  'fee',
  'inventory',
  'billing',
  'training',
];

// Name of the college training and placement programme the `training` module
// serves. One constant so the portal header and the PDF report agree.
export const PROGRAMME_NAME = 'RR Cloud Career Catalyst';

// What a college can ask about on the public Career Catalyst landing page, and
// where an enquiry stands once the platform team has it.
export const ENQUIRY_PROGRAMMES = ['skill_builder', 'career_ready', 'campus_partner', 'not_sure'];
export const ENQUIRY_STATUSES = ['new', 'contacted', 'closed'];

// Pilot success targets from the business plan (section 7), in percent.
export const TRAINING_TARGETS = {
  attendance: 80,
  completion: 85,
  project: 80,
  mockInterview: 80,
};

export const ORG_TYPE_CONFIG = {
  school: {
    enabledModules: ['academic', 'staff', 'expense', 'fee', 'inventory', 'billing'],
    terms: { classLevel: 'Grade', section: 'Section', student: 'Student' },
  },
  college: {
    enabledModules: ['academic', 'staff', 'expense', 'fee', 'inventory', 'billing', 'training'],
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

// A study center has no school year, but fee plans and discounts need an academic
// year to hang from, so one long-running year is created for it. Nothing reads a
// year's start or end date for logic.
export const ONGOING_YEAR_NAME = 'Ongoing';
export const ONGOING_YEAR_SPAN_DAYS = 3650;

export const TENANT_STATUS = ['active', 'suspended', 'archived'];

export const SYSTEM_ROLES = ['super_admin', 'support_agent'];

export const USER_STATUS = [
  'active',
  'invited',
  'suspended',
  // Registered themselves, has not confirmed their address yet.
  'pending_verification',
  // Provisioned from a roster import. The account exists and is linked, but
  // holds a random password nobody was ever told; the person sets their own
  // through a claim link.
  'pending_claim',
  // Terminal. The person asked for deletion and their identifying fields have
  // been scrubbed; the row survives only so tenant-owned academic and financial
  // records keep a valid actor reference. Nothing can sign in as one of these.
  'deleted',
];

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

// 'baseline' and 'mock_interview' belong to the training module: the pre-course
// diagnostic (compared against 'final' for the pre/post improvement) and the
// mock interview score. They are not term results, so report cards skip them.
export const ASSESSMENT_TYPES = ['quiz', 'midterm', 'final', 'other', 'baseline', 'mock_interview'];

export const REPORT_CARD_EXCLUDED_ASSESSMENT_TYPES = ['baseline', 'mock_interview'];

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
  'training:read',
  'training:write',
  // Decides a student's final completion of a batch. Held by tenant_admin only,
  // and deliberately not derivable from ':write' — see DEFAULT_ROLE_TEMPLATES.
  'training:complete',
  // Self-scoped reads. Prefixed 'self:' rather than suffixed ':self' on
  // purpose: 'grades:read:self' sorts next to 'grades:read' and invites a
  // startsWith() that silently over-grants, whereas 'self:grades:read' cannot
  // be prefix-matched into a tenant-wide check. They return only the caller's
  // own records and are served exclusively by the /me router.
  'self:attendance:read',
  'self:grades:read',
  'self:fees:read',
  'self:timetable:read',
  'self:training:read',
  // Ticks items off, answers and attaches links on the caller's own roadmap.
  // Separate from the read so a read-only student role cannot change anything.
  'self:training:write',
  // The learner's own shift, seat, plan and visits at a study center (GET /me/seat).
  'self:seat:read',
];

// Learning roadmap (training module): what an item asks the student to do, and
// how a roadmap places its items in time. 'none' means order only.
export const ROADMAP_ITEM_TYPES = ['theory', 'practical', 'assignment'];
export const ROADMAP_SCHEDULE_MODES = ['dated', 'daily', 'weekly', 'none'];

/** True for permissions that only ever expose the caller's own records. */
export const isSelfScoped = (permission) => permission.startsWith('self:');

// Placement pipeline. The first four are the progression, in order; the last
// two close an application without a joining. Order matters: stage moves are
// forward-only (see apps/api/src/utils/placementStage.js).
export const PLACEMENT_STAGES = [
  'applied',
  'interviewed',
  'offered',
  'joined',
  'rejected',
  'withdrawn',
];

// Statuses an admin may set on a student's enrolment in a batch — a subset of
// Enrollment.status, which is where the decision is stored.
export const COMPLETION_STATUSES = ['active', 'completed', 'dropped'];

// PROVISIONAL — rough placeholder weights for the per-student readiness figure
// (percent contribution of each component; they need not sum to 100, the score
// is renormalised over the components a student actually has). The business
// plan names the inputs but gives no formula, and the owner has said this will
// be revised. Nothing — completion, targets, the PDF — depends on it.
export const READINESS_WEIGHTS = {
  attendance: 20,
  assignments: 20,
  finalGrade: 25,
  project: 20,
  mockInterview: 15,
};
