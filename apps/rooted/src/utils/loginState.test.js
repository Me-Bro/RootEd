import test from 'node:test';
import assert from 'node:assert/strict';
import { studentLoginState } from './loginState.js';

test('studentLoginState', () => {
  assert.equal(studentLoginState(null), 'none');
  assert.equal(studentLoginState(undefined), 'none');
  assert.equal(studentLoginState({ status: 'pending_claim' }), 'pending');
  assert.equal(studentLoginState({ status: 'active' }), 'active');
  assert.equal(studentLoginState({ status: 'suspended' }), 'suspended');
});
