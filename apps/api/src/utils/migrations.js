import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { MigrationLog } from '../models/MigrationLog.js';
import { logger } from './logger.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

// Sorted by filename (numeric prefix decides order) — each file exports an
// `up()`; the migration's tracked name is just its filename, so there's no
// separate name string to keep in sync with the file.
export async function loadMigrations() {
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.js')).sort();
  const migrations = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
    migrations.push({ name: file.replace(/\.js$/, ''), up: mod.up });
  }
  return migrations;
}

// Takes an already-loaded list (rather than reading the directory itself) so
// this is testable with fake migrations against an in-memory Mongo, with no
// filesystem involved.
export async function runMigrations(migrations) {
  for (const { name, up } of migrations) {
    const alreadyApplied = await MigrationLog.findOne({ name }).lean();
    if (alreadyApplied) continue;

    logger.info({ name }, 'running migration');
    await up();

    try {
      await MigrationLog.create({ name });
    } catch (err) {
      // Another instance recorded this migration while we were running it —
      // safe to treat as applied rather than crash, since up() must stay
      // idempotent (documented requirement, same as every migrate-*.js script).
      if (err.code === 11000) {
        logger.warn({ name }, 'migration recorded by a concurrent boot, continuing');
        continue;
      }
      throw err;
    }
  }
}
