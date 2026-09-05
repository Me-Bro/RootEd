// Landing page content structure. The copy itself lives in the `landing`
// namespace of src/i18n/locales/{en,hi}.json — these arrays only hold the
// ordering, the icon/number decoration, and explicit translation keys.
//
// Keys are written out in full rather than built from a fragment at the call
// site, so `grep landing.modules.academics` finds both the definition and its
// use.

// The signup page this CTA would hand off to is explicitly out of scope
// (PLAN.md, "Not in this batch"), so it opens the one real contact channel
// the plan keeps — the same address the footer uses. Not translated: it's a
// mailto to an English-speaking inbox.
export const TRIAL_HREF = 'mailto:ruralrootcloud@gmail.com?subject=RootEd%20free%20trial';

export const MODULES = [
  {
    icon: 'Ac',
    titleKey: 'landing.modules.academics.title',
    bodyKey: 'landing.modules.academics.body',
  },
  { icon: 'St', titleKey: 'landing.modules.staff.title', bodyKey: 'landing.modules.staff.body' },
  { icon: 'Fe', titleKey: 'landing.modules.fee.title', bodyKey: 'landing.modules.fee.body' },
  {
    icon: 'Ex',
    titleKey: 'landing.modules.expense.title',
    bodyKey: 'landing.modules.expense.body',
  },
  {
    icon: 'In',
    titleKey: 'landing.modules.inventory.title',
    bodyKey: 'landing.modules.inventory.body',
  },
];

export const WHY_ROOTED = [
  { titleKey: 'landing.why.multiTenant.title', bodyKey: 'landing.why.multiTenant.body' },
  { titleKey: 'landing.why.rbac.title', bodyKey: 'landing.why.rbac.body' },
  { titleKey: 'landing.why.i18n.title', bodyKey: 'landing.why.i18n.body' },
  { titleKey: 'landing.why.workflows.title', bodyKey: 'landing.why.workflows.body' },
];

export const SECURITY = [
  {
    num: '01',
    titleKey: 'landing.security.isolation.title',
    bodyKey: 'landing.security.isolation.body',
  },
  { num: '02', titleKey: 'landing.security.pii.title', bodyKey: 'landing.security.pii.body' },
  { num: '03', titleKey: 'landing.security.audit.title', bodyKey: 'landing.security.audit.body' },
];

export const ABOUT_VALUES = [
  { titleKey: 'landing.values.reliability.title', bodyKey: 'landing.values.reliability.body' },
  { titleKey: 'landing.values.cloudNative.title', bodyKey: 'landing.values.cloudNative.body' },
  { titleKey: 'landing.values.training.title', bodyKey: 'landing.values.training.body' },
  { titleKey: 'landing.values.rural.title', bodyKey: 'landing.values.rural.body' },
];

export const PROCESS = [
  {
    n: 1,
    titleKey: 'landing.process.understand.title',
    bodyKey: 'landing.process.understand.body',
  },
  { n: 2, titleKey: 'landing.process.plan.title', bodyKey: 'landing.process.plan.body' },
  { n: 3, titleKey: 'landing.process.golive.title', bodyKey: 'landing.process.golive.body' },
  { n: 4, titleKey: 'landing.process.support.title', bodyKey: 'landing.process.support.body' },
];

// The four mobile "why schools trust it" facts — shorter copy than the
// desktop security rows, per the approved mobile mock.
export const MOBILE_FACTS = [
  {
    num: '01',
    titleKey: 'landing.mobile.facts.isolation.title',
    bodyKey: 'landing.mobile.facts.isolation.body',
  },
  {
    num: '02',
    titleKey: 'landing.mobile.facts.pii.title',
    bodyKey: 'landing.mobile.facts.pii.body',
  },
  {
    num: '03',
    titleKey: 'landing.mobile.facts.audit.title',
    bodyKey: 'landing.mobile.facts.audit.body',
  },
  {
    num: '04',
    titleKey: 'landing.mobile.facts.roles.title',
    bodyKey: 'landing.mobile.facts.roles.body',
  },
];

export const MOBILE_TAGS = [
  'landing.mobile.tags.reliability',
  'landing.mobile.tags.cloudNative',
  'landing.mobile.tags.knowledge',
  'landing.mobile.tags.rural',
];

export const PREVIEW_ROLES = [
  'landing.preview.rolePrincipal',
  'landing.preview.roleTeacher',
  'landing.preview.roleAccountant',
  'landing.preview.roleLibrarian',
  'landing.preview.roleTenantAdmin',
];
