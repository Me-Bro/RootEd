/**
 * Test credentials and auth helpers.
 * storageState files are created by tests/auth.setup.js before any e2e tests run.
 */
import path from 'path';

export const TEST_USERS = {
  super_admin: {
    email: 'admin@test.local',
    password: 'TestPass123!',
  },
  tenant_admin: {
    email: 'tadmin@testschool.local',
    password: 'TestPass123!',
  },
  teacher: {
    email: 'teacher@testschool.local',
    password: 'TestPass123!',
  },
  viewer: {
    email: 'viewer@testschool.local',
    password: 'TestPass123!',
  },
  principal: {
    email: 'principal@testschool.local',
    password: 'TestPass123!',
  },
  accountant: {
    email: 'accountant@testschool.local',
    password: 'TestPass123!',
  },
};

export const TEST_TENANT = {
  subdomain: 'testschool',
  name: 'Test School',
};

const AUTH_DIR = path.join(import.meta.dirname, '.auth');

export const AUTH_STATES = {
  super_admin: path.join(AUTH_DIR, 'super_admin.json'),
  tenant_admin: path.join(AUTH_DIR, 'tenant_admin.json'),
  teacher: path.join(AUTH_DIR, 'teacher.json'),
  viewer: path.join(AUTH_DIR, 'viewer.json'),
  principal: path.join(AUTH_DIR, 'principal.json'),
};

/**
 * Fill and submit the login form on /login page.
 * Waits for redirect to /dashboard.
 */
export async function loginViaUi(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}
