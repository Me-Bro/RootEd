/**
 * AC10 / V8: everything here goes through the portal's own server (the vite
 * proxy in test, the nginx image in production), never straight at the API.
 *
 * The portal pins the Host it forwards to the existing portal host, so the API
 * takes the college from the access token's claim. A browser must not be able to
 * name a different college by sending its own forwarding header.
 */
import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/auth.js';

// A fresh sign-in per test rather than the shared stored session: auth.spec.js
// signs that session out, which revokes its refresh token.
async function signIn(request) {
  const { email, password } = TEST_USERS.teacher;
  const res = await request.post('/__api/auth/login', { data: { email, password } });
  expect(res.ok()).toBe(true);
  return (await res.json()).accessToken;
}

test('a signed-in trainer reaches their own college through the portal host', async ({
  request,
}) => {
  const token = await signIn(request);
  const res = await request.get('/__api/training/assignments', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  expect(Array.isArray(await res.json())).toBe(true);
});

test('naming another college in X-Forwarded-Host changes nothing', async ({ request }) => {
  const token = await signIn(request);
  // Second School has no training module: if the forged host were honoured the
  // API would resolve that college and answer 403 "Module not enabled".
  const res = await request.get('/__api/training/assignments', {
    headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-Host': 'secondschool.localhost' },
  });
  expect(res.status()).toBe(200);
});

test('without a token the college cannot be guessed from the host', async ({ request }) => {
  // On the portal host the college comes only from a token claim, so with no
  // token there is no college to resolve at all.
  const res = await request.get('/__api/training/assignments');
  expect(res.status()).toBe(404);
});
