// The "How do I…" topics. Text lives in i18n under help.topics.<key> (title, step1..stepN).
// `permission` and `module` mirror what the target page needs, so nobody is told to use a screen
// they cannot open. `paths` are the routes where the topic is shown first in the help drawer.
// `audience` says which kind of organization the topic is for: 'school' (every org type that is
// not a study center), 'centre' (study centers, where a seat is the product), or omitted for both.
// A topic must never describe a screen the other audience has hidden (sections, timetable,
// attendance and grades are not in a study center's nav).
export const HELP_TOPICS = [
  {
    key: 'addYear',
    group: 'setup',
    audience: 'school',
    steps: 3,
    to: '/academic/years',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/years'],
  },
  {
    key: 'addTerm',
    group: 'setup',
    audience: 'school',
    steps: 2,
    to: '/academic/years',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/years'],
  },
  {
    key: 'addClass',
    group: 'setup',
    audience: 'school',
    steps: 3,
    to: '/academic/classes-sections',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/classes-sections'],
  },
  {
    key: 'addSubject',
    group: 'setup',
    audience: 'school',
    steps: 3,
    to: '/academic/subjects',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/subjects'],
  },
  {
    key: 'addStaff',
    group: 'setup',
    audience: 'school',
    steps: 4,
    to: '/staff',
    permission: 'staff:write',
    module: 'staff',
    paths: ['/staff'],
  },
  // A study center's staff are its front desk, not teachers.
  {
    key: 'addStaffCentre',
    group: 'setup',
    audience: 'centre',
    steps: 4,
    to: '/staff',
    permission: 'staff:write',
    module: 'staff',
    paths: ['/staff'],
  },
  {
    key: 'assignTeacher',
    group: 'setup',
    audience: 'school',
    steps: 4,
    to: '/academic/subjects',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/subjects'],
  },
  {
    key: 'buildTimetable',
    group: 'setup',
    audience: 'school',
    steps: 3,
    to: '/academic/timetable',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/timetable'],
  },
  {
    key: 'addStudent',
    group: 'setup',
    audience: 'school',
    steps: 3,
    to: '/academic/students',
    permission: 'students:write',
    module: 'academic',
    paths: ['/academic/students'],
  },
  {
    key: 'studentLogin',
    group: 'setup',
    audience: 'school',
    steps: 3,
    to: '/academic/students',
    permission: 'students:write',
    module: 'academic',
    paths: ['/academic/students'],
  },
  {
    key: 'addShift',
    group: 'setup',
    audience: 'centre',
    steps: 3,
    to: '/academic/classes-sections',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/classes-sections'],
  },
  {
    key: 'addSeats',
    group: 'setup',
    audience: 'centre',
    steps: 3,
    to: '/academic/seats',
    permission: 'students:write',
    module: 'academic',
    paths: ['/academic/seats'],
  },
  {
    key: 'addPlan',
    group: 'setup',
    audience: 'centre',
    steps: 3,
    to: '/fee/structures',
    permission: 'fees:write',
    module: 'fee',
    paths: ['/fee/structures'],
  },
  {
    key: 'addMember',
    group: 'setup',
    audience: 'centre',
    steps: 3,
    to: '/academic/students',
    permission: 'students:write',
    module: 'academic',
    paths: ['/academic/students'],
  },
  {
    key: 'seatMember',
    group: 'setup',
    audience: 'centre',
    steps: 3,
    to: '/academic/seat-map',
    permission: 'students:write',
    module: 'academic',
    paths: ['/academic/seat-map'],
  },
  {
    key: 'centreSettings',
    group: 'setup',
    audience: 'centre',
    steps: 3,
    to: '/tenant/centre',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/tenant/centre'],
  },
  {
    key: 'centreQr',
    group: 'setup',
    audience: 'centre',
    steps: 3,
    to: '/tenant/centre',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/tenant/centre'],
  },
  {
    key: 'myClasses',
    group: 'daily',
    audience: 'school',
    steps: 2,
    to: '/academic/my-classes',
    permission: 'attendance:write',
    module: 'academic',
    paths: ['/academic/my-classes', '/dashboard'],
  },
  {
    key: 'takeAttendance',
    group: 'daily',
    audience: 'school',
    steps: 4,
    to: '/academic/attendance',
    permission: 'attendance:write',
    module: 'academic',
    paths: ['/academic/attendance'],
  },
  {
    key: 'enterGrades',
    group: 'daily',
    audience: 'school',
    steps: 4,
    to: '/academic/grades',
    permission: 'grades:write',
    module: 'academic',
    paths: ['/academic/grades'],
  },
  {
    key: 'checkInOut',
    group: 'daily',
    audience: 'centre',
    steps: 3,
    to: '/desk',
    permission: 'attendance:write',
    module: 'academic',
    paths: ['/desk', '/dashboard'],
  },
  // The learner's own: scan the centre's QR code from My seat.
  {
    key: 'scanCheckIn',
    group: 'daily',
    audience: 'centre',
    steps: 3,
    to: '/me/seat',
    // The scan itself (POST /me/visits/scan) needs write, not just seeing the seat.
    permission: 'self:seat:write',
    module: 'academic',
    paths: ['/me/seat', '/me/scan'],
  },
  {
    key: 'addExpense',
    group: 'daily',
    audience: 'centre',
    steps: 3,
    to: '/expense',
    permission: 'expense:write',
    module: 'expense',
    paths: ['/expense'],
  },
  {
    key: 'pendingFees',
    group: 'daily',
    audience: 'centre',
    steps: 3,
    to: '/fee/pending',
    permission: 'fees:read',
    module: 'fee',
    paths: ['/fee/pending'],
  },
  // The Remind button is on Pending fees, the front desk row and the Billing tab.
  {
    key: 'remindWhatsapp',
    group: 'daily',
    audience: 'centre',
    steps: 3,
    to: '/fee/pending',
    permission: 'fees:read',
    module: 'fee',
    paths: ['/fee/pending', '/desk'],
  },
  {
    key: 'pauseBilling',
    group: 'daily',
    audience: 'centre',
    steps: 3,
    to: '/academic/students',
    permission: 'tenant:admin',
    module: 'fee',
    paths: ['/academic/students'],
  },
  {
    key: 'monthlyMoney',
    group: 'daily',
    audience: 'centre',
    steps: 3,
    to: '/fee/finance',
    permission: 'tenant:admin',
    module: 'fee',
    paths: ['/fee/finance'],
  },
];

/**
 * Topics this user can act on. `isEnabled(module)` says whether the org has that module on;
 * `seats` is true for a study center (`hasSeats(orgType)`), which gets the centre topics instead
 * of the school ones.
 */
export function visibleTopics(permissions, isEnabled, topics = HELP_TOPICS, seats = false) {
  const audience = seats ? 'centre' : 'school';
  return topics.filter(
    (t) =>
      (!t.audience || t.audience === audience) &&
      permissions.includes(t.permission) &&
      isEnabled(t.module)
  );
}

/** Splits topics into those for the current page and the rest, keeping their order. */
export function topicsForPath(topics, pathname) {
  const here = (t) => t.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return { here: topics.filter(here), rest: topics.filter((t) => !here(t)) };
}
