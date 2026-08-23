import { deriveModule } from '../services/requestLog.service.js';
import { redis } from '../config/redis.js';

afterAll(() => {
  redis.disconnect();
});

test('derives the module from the first path segment for tenant-scoped routes', () => {
  expect(deriveModule('/academic/students')).toBe('academic');
  expect(deriveModule('/fee/payments/123')).toBe('fee');
  expect(deriveModule('/auth/login')).toBe('auth');
});

test('returns undefined for paths that are not a known router mount prefix', () => {
  expect(deriveModule('/metrics')).toBeUndefined();
  expect(deriveModule('/')).toBeUndefined();
  expect(deriveModule('/unknown-module/foo')).toBeUndefined();
});
