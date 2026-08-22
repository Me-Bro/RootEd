/**
 * API client for test data operations.
 *
 * Uses Playwright's APIRequestContext, hitting the API directly at localhost:3001
 * with a spoofed Host header for tenant resolution.
 *
 * Usage:
 *   const client = await createTestApiClient(request, 'tenant_admin');
 *   const student = await client.post('/academic/students', { ... });
 */
import { readFileSync } from 'fs';
import path from 'path';

const API_DIRECT = 'http://localhost:3001';
const TENANT_HOST = 'testschool.localhost';

let _csrfCache = null;

function getTestTenantId() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8')).tenant._id;
}

async function fetchCsrf(request) {
  if (_csrfCache) return _csrfCache;
  const res = await request.get(`${API_DIRECT}/csrf-token`, {
    headers: { Host: TENANT_HOST },
  });
  const { csrfToken } = await res.json();
  _csrfCache = csrfToken;
  // CSRF tokens are short-lived; clear cache after 5 min
  setTimeout(
    () => {
      _csrfCache = null;
    },
    5 * 60 * 1000
  );
  return csrfToken;
}

async function loginDirect(request, email, password) {
  const res = await request.post(`${API_DIRECT}/auth/login`, {
    data: { email, password },
    headers: { Host: TENANT_HOST },
  });
  if (!res.ok()) {
    throw new Error(`Login failed for ${email}: ${await res.text()}`);
  }
  const { accessToken } = await res.json();
  return accessToken;
}

// super_admin only gets tenant-module permissions while actively impersonating
// a tenant (see apps/api/src/middleware/requirePermission.js) — a bare login
// 403s on every tenant-scoped call this client makes. Exchange the bare token
// for an impersonation token via the same endpoint the "Login to tenant" UI
// button uses (mirrors auth.setup.js's loginAsImpersonatingSuperAdmin).
async function impersonateTestTenant(request, accessToken) {
  const csrf = await fetchCsrf(request);
  const res = await request.post(`${API_DIRECT}/admin/tenants/${getTestTenantId()}/impersonate`, {
    headers: {
      Host: TENANT_HOST,
      Authorization: `Bearer ${accessToken}`,
      'x-csrf-token': csrf,
    },
  });
  if (!res.ok()) {
    throw new Error(`Impersonation failed: ${await res.text()}`);
  }
  const { accessToken: impersonationToken } = await res.json();
  return impersonationToken;
}

/**
 * Create an API client authenticated as `role`.
 * `TEST_USERS` credentials are used to obtain an access token.
 */
export async function createTestApiClient(request, role) {
  const { TEST_USERS } = await import('./auth.js');
  const creds = TEST_USERS[role];
  if (!creds) throw new Error(`Unknown role: ${role}`);
  // Each client uses its own request context — clear shared CSRF cache so the
  // new context fetches its own token+cookie pair (avoids 403 on double-submit).
  _csrfCache = null;

  let accessToken = await loginDirect(request, creds.email, creds.password);
  if (role === 'super_admin') {
    accessToken = await impersonateTestTenant(request, accessToken);
  }

  async function call(method, path, body) {
    const csrf = ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
      ? undefined
      : await fetchCsrf(request);

    const res = await request[method.toLowerCase()](`${API_DIRECT}${path}`, {
      data: body,
      headers: {
        Host: TENANT_HOST,
        Authorization: `Bearer ${accessToken}`,
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
    });
    return res;
  }

  async function postFile(path, file) {
    const csrf = await fetchCsrf(request);
    return request.post(`${API_DIRECT}${path}`, {
      multipart: { file },
      headers: {
        Host: TENANT_HOST,
        Authorization: `Bearer ${accessToken}`,
        'x-csrf-token': csrf,
      },
    });
  }

  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    patch: (path, body) => call('PATCH', path, body),
    delete: (path) => call('DELETE', path),
    postFile,
    accessToken,
  };
}

// ── Convenience entity creators ───────────────────────────────────────────────

export async function createStudent(client, overrides = {}) {
  const admissionNo = `TEST-${Date.now()}`;
  const res = await client.post('/academic/students', {
    admissionNo,
    firstName: 'Test',
    lastName: 'Student',
    gender: 'male',
    ...overrides,
  });
  if (!res.ok()) throw new Error(`createStudent failed: ${await res.text()}`);
  return res.json();
}

export async function createExpenseEntry(client, costCenterId, overrides = {}) {
  const res = await client.post('/expense/entries', {
    title: 'Test Expense',
    amount: 1000,
    costCenterId,
    category: 'supplies',
    date: new Date().toISOString(),
    ...overrides,
  });
  if (!res.ok()) throw new Error(`createExpenseEntry failed: ${await res.text()}`);
  return res.json();
}

export async function createLeaveRequest(client, staffMemberId, overrides = {}) {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const res = await client.post('/staff/leave-requests', {
    staffMemberId,
    startDate: tomorrow,
    endDate: tomorrow,
    reason: 'Test leave',
    ...overrides,
  });
  if (!res.ok()) throw new Error(`createLeaveRequest failed: ${await res.text()}`);
  return res.json();
}
