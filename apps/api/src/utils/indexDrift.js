import * as models from '../models/index.js';
import { logger } from './logger.js';

/**
 * Index definitions live in the schemas, but Mongo will not redefine an
 * existing index in place: change `sparse`, `unique` or a partial filter on an
 * index that is already built and autoIndex quietly leaves the old one alone.
 * The schema then says one thing and the database does another, and the gap
 * surfaces only as a runtime write failure — a non-sparse unique index treating
 * every missing value as a duplicate null, say.
 *
 * This reports that gap. It never writes; `scripts/migrate-sync-indexes.js`
 * does the fixing.
 */
export function allModels() {
  return Object.values(models)
    .filter((m) => typeof m?.diffIndexes === 'function' && m.modelName)
    .sort((a, b) => a.modelName.localeCompare(b.modelName));
}

/**
 * @param {object} [options]
 * @param {string[]} [options.only] model names to check; defaults to all
 * @returns {Promise<Array<{modelName: string, toDrop: string[], toCreate: object[]}>>}
 *   one entry per model whose collection differs from its schema; empty when in sync
 */
export async function collectIndexDrift({ only } = {}) {
  const targets = only?.length
    ? allModels().filter((m) => only.includes(m.modelName))
    : allModels();

  const drift = [];
  for (const model of targets) {
    // init() resolves once autoIndex has finished building this model's
    // indexes. Diffing before that races the build and reports indexes as
    // missing that are seconds away from existing. A rejection here *is* the
    // drift we are looking for — autoIndex cannot redefine an index whose
    // options changed and errors out — so swallow it and let diffIndexes
    // describe it properly.
    await model.init().catch(() => {});
    const { toDrop, toCreate } = await model.diffIndexes();
    if (toDrop.length || toCreate.length) {
      drift.push({ modelName: model.modelName, toDrop, toCreate });
    }
  }
  return drift;
}

export function formatDrift(entry) {
  const parts = [];
  if (entry.toDrop.length) parts.push(`drop ${entry.toDrop.join(', ')}`);
  if (entry.toCreate.length) {
    parts.push(`create ${entry.toCreate.map((ix) => JSON.stringify(ix)).join(', ')}`);
  }
  return `${entry.modelName}: ${parts.join('; ')}`;
}

/**
 * Boot-time report. Never fixes anything and never fails startup — a drifted
 * index is a deploy-time problem, not a reason to refuse to serve traffic.
 */
export async function warnOnIndexDrift() {
  try {
    const drift = await collectIndexDrift();
    if (!drift.length) return;
    logger.warn(
      { drift: drift.map(formatDrift) },
      `Index drift on ${drift.length} collection(s) — run \`pnpm --filter api migrate:indexes\` to reconcile`
    );
  } catch (err) {
    logger.error({ err }, 'Index drift check failed');
  }
}
