/**
 * seed-uat-roadmap.js — a published 4-week JavaScript roadmap for Batch A of the
 * demo college that seed-uat-college.js creates, so the Catalyst portal's
 * roadmap pages have content on staging. Run that script first.
 *
 * Refuses to run against any database whose name does not end in `_uat`.
 *
 * Usage (inside the api container, so MONGODB_URI is the container's own):
 *   docker exec -w /app rooted-uat-api-1 node src/scripts/seed-uat-roadmap.js
 *
 * Idempotent: the roadmap is looked up by (batch, term, title) and each item by
 * (roadmap, title), so a re-run adds nothing. Student progress is never touched.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Tenant } from '../models/Tenant.js';
import { Term } from '../models/Term.js';
import { Section } from '../models/Section.js';
import { Roadmap } from '../models/Roadmap.js';
import { RoadmapItem } from '../models/RoadmapItem.js';

const SUBDOMAIN = 'demo-college';
const TERM_NAME = 'Cohort Jul-2026';
const BATCH_NAME = 'Batch A';
const TRAINER_EMAIL = 'uat-trainer-meera@demo-college.example';
const BYPASS = { _bypassTenantScope: true };

const ROADMAP = {
  title: 'JavaScript in 4 Weeks',
  description:
    'From the language core to a small browser app: one theory topic, one hands-on practical and one assignment each week.',
  startDate: new Date('2026-10-26'),
};

const MDN = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript';
const JSINFO = 'https://javascript.info';

// Each week: a theory item, a practical, and an assignment locked until the
// practical is marked done.
const WEEKS = [
  {
    theory: {
      title: 'Language core: types, scope and functions',
      body: 'Primitive and reference types, let/const/var, hoisting, function declarations vs arrow functions, and how closures capture scope.',
      resourceUrl: `${JSINFO}/closure`,
      prompt: 'In your own words, what is a closure and where did you use one today?',
    },
    practical: {
      title: 'Console drills: closures and array methods',
      body: 'Write a counter factory with a closure. Then solve ten small problems using map, filter and reduce.',
      resourceUrl: `${MDN}/Reference/Global_Objects/Array`,
    },
    assignment: {
      title: 'Build a small utility library',
      body: 'Implement debounce, groupBy, chunk and unique as plain functions with a few example calls each. Push to a Git repo.',
      prompt: 'Paste your repo link and say which function was hardest.',
    },
  },
  {
    theory: {
      title: 'The DOM and events',
      body: 'Selecting and changing elements, event listeners, bubbling vs capturing, and event delegation.',
      resourceUrl: `${JSINFO}/events`,
      prompt: 'When is event delegation better than one listener per element?',
    },
    practical: {
      title: 'Interactive to-do list',
      body: 'Add, complete and delete tasks using only the DOM API. Keep the list in localStorage so it survives a reload.',
      resourceUrl: `${MDN}/Guide/Introduction`,
    },
    assignment: {
      title: 'Form validator',
      body: 'A sign-up form with live validation messages for email, password strength and matching confirmation, with no libraries.',
      prompt: 'Share a link to your working page.',
    },
  },
  {
    theory: {
      title: 'Asynchronous JavaScript: promises, async/await and fetch',
      body: 'The event loop, callbacks vs promises, async/await, error handling with try/catch, and calling an API with fetch.',
      resourceUrl: `${JSINFO}/async`,
      prompt: 'What does await actually pause, and what keeps running meanwhile?',
    },
    practical: {
      title: 'Fetch and render a public API',
      body: 'Call a free JSON API, show a loading state, render the results, and handle a failed request without breaking the page.',
      resourceUrl: `${MDN}/Reference/Global_Objects/Promise`,
    },
    assignment: {
      title: 'Weather or quotes app',
      body: 'A small app with a search box, a results view and an error state, backed by a public API of your choice.',
      prompt: 'Which API did you pick, and how did you handle rate limits or failures?',
    },
  },
  {
    theory: {
      title: 'Modules, tooling and testing basics',
      body: 'ES modules (import/export), npm scripts, a bundler such as Vite, and writing a first unit test.',
      resourceUrl: `${JSINFO}/modules-intro`,
      prompt: 'What problem do ES modules solve compared with script tags?',
    },
    practical: {
      title: 'Refactor the week-3 app into ES modules',
      body: 'Split your fetch code, rendering and state into separate modules, run it with Vite, and add two unit tests.',
      resourceUrl: `${MDN}/Guide/Modules`,
    },
    assignment: {
      title: 'Mini capstone',
      body: 'Extend your app with one new feature of your choice, write a short README, and deploy it to any static host.',
      prompt: 'Paste your deployed link and your repo link.',
    },
  },
];

async function ensure(Model, filter, data) {
  return Model.findOneAndUpdate(
    filter,
    { $setOnInsert: { ...filter, ...data } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...BYPASS }
  ).lean();
}

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  const dbName = mongoose.connection.name;
  if (!dbName.endsWith('_uat')) {
    console.error(`Refusing to seed database "${dbName}": name must end in _uat.`);
    process.exit(1);
  }

  const tenant = await Tenant.findOne({ subdomain: SUBDOMAIN }).lean();
  if (!tenant) throw new Error(`Tenant "${SUBDOMAIN}" not found: run seed-uat-college.js first.`);
  const tenantId = tenant._id;

  const term = await Term.findOne({ tenantId, name: TERM_NAME }, null, BYPASS).lean();
  const batch = await Section.findOne({ tenantId, name: BATCH_NAME }, null, BYPASS).lean();
  if (!term || !batch)
    throw new Error(`"${TERM_NAME}" or "${BATCH_NAME}" missing: run seed-uat-college.js first.`);

  const trainer = await User.findOne({ email: TRAINER_EMAIL }, '_id', BYPASS).lean();

  const roadmap = await ensure(
    Roadmap,
    { tenantId, sectionId: batch._id, termId: term._id, title: ROADMAP.title },
    {
      description: ROADMAP.description,
      scheduleMode: 'weekly',
      startDate: ROADMAP.startDate,
      published: true,
      createdBy: trainer?._id,
    }
  );

  let order = 0;
  async function item(type, weekNumber, fields, unlockAfter = []) {
    order += 1;
    return ensure(
      RoadmapItem,
      { tenantId, roadmapId: roadmap._id, title: fields.title },
      {
        sectionId: batch._id,
        type,
        weekNumber,
        order,
        body: fields.body,
        resourceUrl: fields.resourceUrl,
        prompt: fields.prompt,
        locked: unlockAfter.length > 0,
        unlockAfter,
      }
    );
  }

  for (const [i, week] of WEEKS.entries()) {
    const weekNumber = i + 1;
    await item('theory', weekNumber, week.theory);
    const practical = await item('practical', weekNumber, week.practical);
    await item('assignment', weekNumber, week.assignment, [practical._id]);
  }

  const total = await RoadmapItem.countDocuments({ tenantId, roadmapId: roadmap._id });
  console.log(
    `Seeded roadmap "${ROADMAP.title}" (${roadmap._id}) for ${BATCH_NAME} in ${dbName}: ${total} items.`
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
