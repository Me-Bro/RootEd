/**
 * MongoDB snapshot helpers — dump once, restore fast between test suites.
 *
 * Usage:
 *   node apps/web/tests/seed/snapshot.js dump    # saves snapshot to tests/seed/.snapshot/
 *   node apps/web/tests/seed/snapshot.js restore # restores from snapshot
 *
 * Requires mongodump / mongorestore to be on PATH (ships with MongoDB Tools).
 * DB name is read from MONGODB_URI env var.
 */
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = resolve(__dirname, '.snapshot');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/eduflow_test?replicaSet=rs0';
const DB_NAME = new URL(MONGO_URI.replace('mongodb://', 'http://')).pathname.slice(1).split('?')[0];
const HOST_PORT = MONGO_URI.replace(/^mongodb:\/\//, '').split('/')[0];

const [, , command] = process.argv;

if (command === 'dump') {
  console.log(`Dumping ${DB_NAME} → ${SNAPSHOT_DIR}`);
  execSync(
    `mongodump --host="${HOST_PORT}" --db="${DB_NAME}" --out="${SNAPSHOT_DIR}" --quiet`,
    { stdio: 'inherit' }
  );
  console.log('Snapshot saved.');
} else if (command === 'restore') {
  console.log(`Restoring ${DB_NAME} from ${SNAPSHOT_DIR}`);
  execSync(
    `mongorestore --host="${HOST_PORT}" --db="${DB_NAME}" --drop "${SNAPSHOT_DIR}/${DB_NAME}" --quiet`,
    { stdio: 'inherit' }
  );
  console.log('Snapshot restored.');
} else {
  console.error('Usage: node snapshot.js [dump|restore]');
  process.exit(1);
}
