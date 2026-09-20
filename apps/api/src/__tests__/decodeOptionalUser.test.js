import jwt from 'jsonwebtoken';
import { signAccessToken } from '../services/auth.service.js';
import { decodeOptionalUser } from '../middleware/authenticate.js';

function reqWith(authorization) {
  return { headers: authorization ? { authorization } : {} };
}

test('no Authorization header yields null', () => {
  expect(decodeOptionalUser(reqWith(undefined))).toBeNull();
});

test('non-Bearer Authorization header yields null', () => {
  expect(decodeOptionalUser(reqWith('Basic abc123'))).toBeNull();
});

test('malformed token yields null, does not throw', () => {
  expect(decodeOptionalUser(reqWith('Bearer not-a-real-token'))).toBeNull();
});

test('expired token yields null', () => {
  const expired = jwt.sign({ sub: 'user-1' }, process.env.JWT_ACCESS_SECRET, { expiresIn: -10 });
  expect(decodeOptionalUser(reqWith(`Bearer ${expired}`))).toBeNull();
});

test('valid token with tenantId yields userId + tenantId', () => {
  const token = signAccessToken({ sub: 'user-1', tenantId: 'tenant-1' });
  expect(decodeOptionalUser(reqWith(`Bearer ${token}`))).toEqual({
    userId: 'user-1',
    tenantId: 'tenant-1',
  });
});

test('valid token without tenantId yields userId + null tenantId', () => {
  const token = signAccessToken({ sub: 'user-1' });
  expect(decodeOptionalUser(reqWith(`Bearer ${token}`))).toEqual({
    userId: 'user-1',
    tenantId: null,
  });
});
