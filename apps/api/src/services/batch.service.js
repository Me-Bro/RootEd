import { Class } from '../models/Class.js';
import { Section } from '../models/Section.js';
import { assertHoursKeepSeatsClear } from './seat.service.js';

/**
 * A study center has one tier, the Batch, and a batch is a shift (Morning, Evening) with
 * its own hours. Seats, enrolments, fee plans and visits all hang off a `Section`, so each
 * batch keeps exactly one Section that mirrors it: same name, same hours. The owner never
 * sees or edits that section; these functions are the only writers, so the two cannot drift.
 */

const TIME_KEYS = ['startTime', 'endTime'];

/** The hours that are set on `source`, as a plain object (unset ones are left out). */
function timesOf(source) {
  const times = {};
  for (const key of TIME_KEYS) if (source[key]) times[key] = source[key];
  return times;
}

/** `$set` / `$unset` halves of a patch where null or undefined clears the field. */
function toUpdate(fields) {
  const $set = {};
  const $unset = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) $unset[key] = '';
    else $set[key] = value;
  }
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  return update;
}

/** Creates the batch and its mirrored section. Returns `{ cls, section }`. */
export async function createBatch(tenantId, { name, startTime, endTime }) {
  const times = timesOf({ startTime, endTime });
  const cls = await Class.create({ tenantId, name, ...times });
  try {
    const section = await Section.create({ tenantId, classId: cls._id, name, ...times });
    return { cls, section };
  } catch (err) {
    // No half-made batch: a class with no section cannot hold a seat or an enrolment.
    await Class.deleteOne({ _id: cls._id, tenantId });
    throw err;
  }
}

/**
 * Edits a batch and carries the change onto its section. `body` may hold `name`,
 * `startTime` and `endTime`; a null time clears it. Returns the updated class, or null.
 */
export async function updateBatch(tenantId, classId, body) {
  const fields = {};
  if (body.name !== undefined) fields.name = body.name;
  for (const key of TIME_KEYS) if (key in body) fields[key] = body[key] || null;
  const update = toUpdate(fields);
  if (!Object.keys(update).length) return Class.findOne({ _id: classId, tenantId });

  // Changing the hours must not make a held seat overlap another batch's hold.
  if (TIME_KEYS.some((key) => key in fields)) {
    const current = await Class.findOne({ _id: classId, tenantId }).lean();
    if (!current) return null;
    const after = { name: fields.name ?? current.name };
    for (const key of TIME_KEYS) after[key] = key in fields ? fields[key] : current[key];
    await assertHoursKeepSeatsClear(tenantId, classId, {
      before: { name: current.name, ...timesOf(current) },
      after,
    });
  }

  const cls = await Class.findOneAndUpdate({ _id: classId, tenantId }, update, { new: true });
  if (!cls) return null;
  await Section.updateMany({ tenantId, classId }, update);
  return cls;
}

/**
 * Brings one study center's classes and sections into the one-tier shape: every class is a
 * batch holding exactly one section that mirrors it. A class with several sections (an old
 * "Batches" class holding Morning and Evening) is split into one batch per section, so the
 * section ids that seats, enrolments, plans and visits point at stay valid.
 *
 * Which name wins: when a class holds several sections, or its only section has hours, the
 * section is what the owner has been calling the shift, so the batch takes the section's name
 * and hours. A class whose only section is a bare "A" keeps its own name.
 *
 * Idempotent: a tenant already in shape is left alone. Returns the number of writes made.
 */
export async function normalizeBatches(tenantId) {
  const classes = await Class.find({ tenantId }).sort({ createdAt: 1, _id: 1 }).lean();
  const sections = await Section.find({ tenantId }).sort({ createdAt: 1, _id: 1 }).lean();

  const byClass = new Map();
  for (const s of sections) {
    const key = String(s.classId);
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(s);
  }

  const taken = new Set(classes.map((c) => c.name));
  // A name no other batch uses: the wanted one, else "<class> - <wanted>", else numbered.
  const freeName = (wanted, classLabel) => {
    let name = wanted;
    if (taken.has(name)) name = `${classLabel} - ${wanted}`;
    for (let n = 2; taken.has(name); n += 1) name = `${classLabel} - ${wanted} ${n}`;
    return name;
  };

  let writes = 0;
  for (const cls of classes) {
    const own = byClass.get(String(cls._id)) ?? [];

    // A class holding no section is an empty shell nobody can use: give it one.
    if (own.length === 0) {
      await Section.create({ tenantId, classId: cls._id, name: cls.name, ...timesOf(cls) });
      writes += 1;
      continue;
    }

    const sectionIsShift = own.length > 1 || Boolean(own[0].startTime || own[0].endTime);

    for (const [index, section] of own.entries()) {
      let batchId = cls._id;
      let batchName = cls.name;
      let batchTimes = timesOf(cls);

      if (index === 0) {
        // The first section stays with its class, which may take the section's name.
        if (sectionIsShift && section.name !== cls.name && !taken.has(section.name)) {
          taken.delete(cls.name);
          taken.add(section.name);
          batchName = section.name;
        }
      } else {
        // Each further section moves to a batch of its own.
        batchName = freeName(section.name, cls.name);
        taken.add(batchName);
        batchTimes = {};
      }
      if (sectionIsShift) batchTimes = { ...batchTimes, ...timesOf(section) };

      if (index === 0) {
        const differs =
          batchName !== cls.name ||
          TIME_KEYS.some((k) => (batchTimes[k] ?? null) !== (cls[k] ?? null));
        if (differs) {
          await Class.updateOne(
            { _id: cls._id, tenantId },
            { $set: { name: batchName, ...batchTimes } }
          );
          writes += 1;
        }
      } else {
        const created = await Class.create({ tenantId, name: batchName, ...batchTimes });
        batchId = created._id;
        writes += 1;
      }

      const mirror = { classId: batchId, name: batchName, ...batchTimes };
      const same =
        String(section.classId) === String(batchId) &&
        section.name === batchName &&
        TIME_KEYS.every((k) => (section[k] ?? null) === (batchTimes[k] ?? null));
      if (!same) {
        const unset = {};
        for (const k of TIME_KEYS) if (!batchTimes[k] && section[k]) unset[k] = '';
        await Section.updateOne(
          { _id: section._id, tenantId },
          { $set: mirror, ...(Object.keys(unset).length && { $unset: unset }) }
        );
        writes += 1;
      }
    }
  }
  return writes;
}
