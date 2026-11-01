// The "How do I…" topics. Text lives in i18n under help.topics.<key> (title, step1..stepN).
// `permission` and `module` mirror what the target page needs, so nobody is told to use a screen
// they cannot open. `paths` are the routes where the topic is shown first in the help drawer.
export const HELP_TOPICS = [
  {
    key: 'addYear',
    group: 'setup',
    steps: 3,
    to: '/academic/years',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/years'],
  },
  {
    key: 'addTerm',
    group: 'setup',
    steps: 2,
    to: '/academic/years',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/years'],
  },
  {
    key: 'addClass',
    group: 'setup',
    steps: 3,
    to: '/academic/classes-sections',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/classes-sections'],
  },
  {
    key: 'addSubject',
    group: 'setup',
    steps: 3,
    to: '/academic/subjects',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/subjects'],
  },
  {
    key: 'addStaff',
    group: 'setup',
    steps: 4,
    to: '/staff',
    permission: 'staff:write',
    module: 'staff',
    paths: ['/staff'],
  },
  {
    key: 'assignTeacher',
    group: 'setup',
    steps: 4,
    to: '/academic/subjects',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/subjects'],
  },
  {
    key: 'buildTimetable',
    group: 'setup',
    steps: 3,
    to: '/academic/timetable',
    permission: 'tenant:admin',
    module: 'academic',
    paths: ['/academic/timetable'],
  },
  {
    key: 'addStudent',
    group: 'setup',
    steps: 3,
    to: '/academic/students',
    permission: 'students:write',
    module: 'academic',
    paths: ['/academic/students'],
  },
  {
    key: 'studentLogin',
    group: 'setup',
    steps: 3,
    to: '/academic/students',
    permission: 'students:write',
    module: 'academic',
    paths: ['/academic/students'],
  },
  {
    key: 'myClasses',
    group: 'daily',
    steps: 2,
    to: '/academic/my-classes',
    permission: 'attendance:write',
    module: 'academic',
    paths: ['/academic/my-classes', '/dashboard'],
  },
  {
    key: 'takeAttendance',
    group: 'daily',
    steps: 4,
    to: '/academic/attendance',
    permission: 'attendance:write',
    module: 'academic',
    paths: ['/academic/attendance'],
  },
  {
    key: 'enterGrades',
    group: 'daily',
    steps: 4,
    to: '/academic/grades',
    permission: 'grades:write',
    module: 'academic',
    paths: ['/academic/grades'],
  },
];

/** Topics this user can act on. `isEnabled(module)` says whether the org has that module on. */
export function visibleTopics(permissions, isEnabled, topics = HELP_TOPICS) {
  return topics.filter((t) => permissions.includes(t.permission) && isEnabled(t.module));
}

/** Splits topics into those for the current page and the rest, keeping their order. */
export function topicsForPath(topics, pathname) {
  const here = (t) => t.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return { here: topics.filter(here), rest: topics.filter((t) => !here(t)) };
}
