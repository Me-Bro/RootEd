/**
 * Seed runner — runs seed-test-data.js inside the Docker API container
 * (avoids pnpm XSym symlink issues on Windows with Node.js ESM).
 *
 * Usage (from repo root or apps/web):
 *   node tests/seed/seed.js
 *   node tests/seed/seed.js --clean
 *
 * Saves seeded IDs to tests/seed/.test-ids.json on the host.
 */
import { execSync, spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clean = process.argv.includes('--clean') ? '--clean' : '';
const repoRoot = resolve(__dirname, '../../../..');

const COMPOSE_FILES = '-f docker-compose.yml -f docker-compose.test.yml';
const COMPOSE_CMD = `docker compose ${COMPOSE_FILES}`;

// Run seed inside the API container (avoids pnpm symlink issues on Windows)
const result = spawnSync(
  'docker',
  [
    'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml',
    'exec', 'api',
    'node', `src/scripts/seed-test-data.js`, ...(clean ? ['--clean'] : []),
  ],
  { cwd: repoRoot, encoding: 'utf-8' }
);

if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(1);
}

// Extract JSON from stdout (seed script may emit log lines on stderr)
const lines = result.stdout.split('\n');
const jsonStart = lines.findIndex((l) => l.trim().startsWith('{'));
const jsonStr = lines.slice(jsonStart).join('\n');

try {
  const data = JSON.parse(jsonStr);
  const outPath = resolve(__dirname, '.test-ids.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log('Seed complete. IDs written to', outPath);
} catch (e) {
  console.error('Failed to parse seed output as JSON:', e.message);
  console.error('Raw output:', result.stdout.slice(0, 500));
  process.exit(1);
}
