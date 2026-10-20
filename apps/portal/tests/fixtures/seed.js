/**
 * What the seed (apps/api/src/scripts/seed-test-data.js) put in the database.
 * It writes this file on every run; the figures under `training.expected` are the
 * hand-worked values the specs assert against, never values recomputed here.
 */
import { readFileSync } from 'fs';
import path from 'path';

const FILE = path.join(import.meta.dirname, '../../../web/tests/seed/.test-ids.json');

export const seedIds = () => JSON.parse(readFileSync(FILE, 'utf8'));
export const expected = () => seedIds().training.expected;

/** Signs in through the API and returns an Authorization header, for set-up and clean-up. */
export async function authHeader(request, { email, password }) {
  const res = await request.post('/__api/auth/login', { data: { email, password } });
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()}`);
  const { accessToken } = await res.json();
  return { Authorization: `Bearer ${accessToken}` };
}
