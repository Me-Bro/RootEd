/**
 * Credentials for the seeded users (apps/api/src/scripts/seed-test-data.js) and
 * the paths of the per-role browser state files written by tests/auth.setup.js.
 */
import path from 'path';

const PASSWORD = 'TestPass123!';

export const TEST_USERS = {
  super_admin: { email: 'admin@test.local', password: PASSWORD },
  tenant_admin: { email: 'tadmin@testschool.local', password: PASSWORD },
  teacher: { email: 'teacher@testschool.local', password: PASSWORD },
  // Reads training data across the college (the college TPO / HOD).
  principal: { email: 'principal@testschool.local', password: PASSWORD },
  // Librarian role: signed in to a college, but no training permission.
  viewer: { email: 'viewer@testschool.local', password: PASSWORD },
  // Linked to Student1 Test (2025-TEST-001); holds only self: permissions.
  student: { email: 'student@testschool.local', password: PASSWORD },
  // Member of testschool (librarian) and secondschool (tenant_admin, no training module).
  multiTenant: { email: 'multi@testschool.local', password: PASSWORD },
};

const AUTH_DIR = path.join(import.meta.dirname, '.auth');

export const AUTH_STATES = Object.fromEntries(
  ['super_admin', 'tenant_admin', 'teacher', 'principal', 'viewer', 'student'].map((role) => [
    role,
    path.join(AUTH_DIR, `${role}.json`),
  ])
);

/** Signs in through the real form and waits for the redirect away from /login. */
export async function loginViaUi(page, { email, password }) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}
