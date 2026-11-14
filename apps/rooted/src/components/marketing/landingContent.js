import {
  GraduationCap,
  Users,
  Wallet,
  Receipt,
  Package,
  Mail,
  MessageCircle,
  MessageSquare,
  CreditCard,
  School,
  BookOpen,
  Armchair,
  Languages,
  Smartphone,
  ShieldCheck,
  IndianRupee,
  Layers,
} from 'lucide-react';
import { brand } from '../../lib/brand.js';

// Landing page content structure. The copy itself lives in the `landing`
// namespace of src/i18n/locales/{en,hi}.json — these arrays only hold the
// ordering, the icon/number decoration, and explicit translation keys.
//
// Keys are written out in full rather than built from a fragment at the call
// site, so `grep landing.modules.academics` finds both the definition and its
// use.

// Registration (`/register`) is a real, live route (ADR 005) — the "Get
// started free" CTAs navigate there via `onGetStartedClick`, not through this
// mailto. This address is only for the footer's general contact link and the
// premium-features enquiry, since premium add-ons (dedicated email, WhatsApp,
// SMS, payment gateway) have no self-serve purchase flow yet. Not translated:
// it's a mailto to an English-speaking inbox.
export const CONTACT_HREF = `mailto:${brand.contactEmail}?subject=RootEd%20inquiry`;

export const PARENT_SITE_HREF = brand.parentSiteUrl;

// The Android app is published under one company's Play account, so brands
// without `playStoreUrl` hide every Play badge, the QR code and the Android
// band rather than linking to an app that isn't theirs.
export const PLAY_STORE_URL = brand.playStoreUrl;
export const PLAY_QR_SRC = '/landing/qr-play.svg';

export const PREMIUM_FEATURES = [
  {
    icon: Mail,
    titleKey: 'landing.premium.email.title',
    bodyKey: 'landing.premium.email.body',
  },
  {
    icon: MessageCircle,
    titleKey: 'landing.premium.whatsapp.title',
    bodyKey: 'landing.premium.whatsapp.body',
  },
  {
    icon: MessageSquare,
    titleKey: 'landing.premium.sms.title',
    bodyKey: 'landing.premium.sms.body',
  },
  {
    icon: CreditCard,
    titleKey: 'landing.premium.paymentGateway.title',
    bodyKey: 'landing.premium.paymentGateway.body',
  },
];

export const MODULES = [
  {
    icon: GraduationCap,
    titleKey: 'landing.modules.academics.title',
    bodyKey: 'landing.modules.academics.body',
  },
  {
    icon: Users,
    titleKey: 'landing.modules.staff.title',
    bodyKey: 'landing.modules.staff.body',
  },
  {
    icon: Wallet,
    titleKey: 'landing.modules.fee.title',
    bodyKey: 'landing.modules.fee.body',
  },
  {
    icon: Receipt,
    titleKey: 'landing.modules.expense.title',
    bodyKey: 'landing.modules.expense.body',
  },
  {
    icon: Package,
    titleKey: 'landing.modules.inventory.title',
    bodyKey: 'landing.modules.inventory.body',
  },
];

// The strip under the hero: five one-line facts, each already true elsewhere
// on the page.
export const TRUST = [
  { icon: IndianRupee, key: 'landing.trust.free' },
  { icon: Languages, key: 'landing.trust.languages' },
  { icon: Smartphone, key: 'landing.trust.platforms' },
  { icon: Layers, key: 'landing.trust.roles' },
  { icon: ShieldCheck, key: 'landing.trust.isolation' },
];

// Role tabs. `id` picks the demo panel in ProductFrames.jsx.
export const ROLES = [
  {
    id: 'principal',
    tabKey: 'landing.roles.principal.tab',
    titleKey: 'landing.roles.principal.title',
    bodyKey: 'landing.roles.principal.body',
    pointKeys: [
      'landing.roles.principal.b1',
      'landing.roles.principal.b2',
      'landing.roles.principal.b3',
    ],
  },
  {
    id: 'teacher',
    tabKey: 'landing.roles.teacher.tab',
    titleKey: 'landing.roles.teacher.title',
    bodyKey: 'landing.roles.teacher.body',
    pointKeys: ['landing.roles.teacher.b1', 'landing.roles.teacher.b2', 'landing.roles.teacher.b3'],
  },
  {
    id: 'accountant',
    tabKey: 'landing.roles.accountant.tab',
    titleKey: 'landing.roles.accountant.title',
    bodyKey: 'landing.roles.accountant.body',
    pointKeys: [
      'landing.roles.accountant.b1',
      'landing.roles.accountant.b2',
      'landing.roles.accountant.b3',
    ],
  },
  {
    id: 'student',
    tabKey: 'landing.roles.student.tab',
    titleKey: 'landing.roles.student.title',
    bodyKey: 'landing.roles.student.body',
    pointKeys: ['landing.roles.student.b1', 'landing.roles.student.b2', 'landing.roles.student.b3'],
  },
];

export const WHO = [
  { icon: School, titleKey: 'landing.who.school.title', bodyKey: 'landing.who.school.body' },
  {
    icon: GraduationCap,
    titleKey: 'landing.who.college.title',
    bodyKey: 'landing.who.college.body',
  },
  { icon: BookOpen, titleKey: 'landing.who.coaching.title', bodyKey: 'landing.who.coaching.body' },
  {
    icon: Armchair,
    titleKey: 'landing.who.studyCentre.title',
    bodyKey: 'landing.who.studyCentre.body',
  },
];

export const ANDROID_POINTS = ['landing.android.b1', 'landing.android.b2', 'landing.android.b3'];

export const SECURITY = [
  {
    num: '01',
    titleKey: 'landing.security.isolation.title',
    bodyKey: 'landing.security.isolation.body',
    techKey: 'landing.security.isolation.tech',
  },
  {
    num: '02',
    titleKey: 'landing.security.pii.title',
    bodyKey: 'landing.security.pii.body',
    techKey: 'landing.security.pii.tech',
  },
  {
    num: '03',
    titleKey: 'landing.security.audit.title',
    bodyKey: 'landing.security.audit.body',
    techKey: 'landing.security.audit.tech',
  },
];

export const FAQ = ['free', 'app', 'hindi', 'salary', 'students', 'orgs'].map((id) => ({
  id,
  qKey: `landing.faq.${id}.q`,
  aKey: `landing.faq.${id}.a`,
}));

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

// The three mobile "why schools trust it" facts — shorter copy than the
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
];

export const MOBILE_TAGS = [
  'landing.mobile.tags.reliability',
  'landing.mobile.tags.cloudNative',
  'landing.mobile.tags.knowledge',
  'landing.mobile.tags.rural',
];
