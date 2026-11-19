import test from 'node:test';
import assert from 'node:assert/strict';
import { addedMessage, noticeFromCreated } from './studentAdded.js';

test('a login link sent says where', () => {
  const m = addedMessage({ name: 'Asha Rao', email: 'a@x.in' });
  assert.equal(m.key, 'academic.students.addedWithLogin');
  assert.deepEqual(m.params, { name: 'Asha Rao', email: 'a@x.in' });
  assert.equal(m.feeKey, null);
});

test('a login that could not be made says why, and the student is still added', () => {
  const m = addedMessage({ name: 'Asha Rao', loginError: 'already linked' });
  assert.equal(m.key, 'academic.students.addedNoLogin');
  assert.equal(m.params.reason, 'already linked');
});

test('with no email and no error it is just added, with no school-only advice', () => {
  const m = addedMessage({ name: 'Asha Rao' });
  assert.equal(m.key, 'academic.students.addedGeneric');
});

test('a fee that could not be assigned adds its own line', () => {
  assert.equal(
    addedMessage({ name: 'A B', feeError: 'x' }).feeKey,
    'academic.students.feeNotAssigned'
  );
});

test('the notice is built from the create response', () => {
  const n = noticeFromCreated({
    _id: '1',
    firstName: 'Asha',
    lastName: 'Rao',
    account: { email: 'a@x.in' },
    feeError: 'x',
  });
  assert.deepEqual(n, {
    studentId: '1',
    name: 'Asha Rao',
    email: 'a@x.in',
    loginError: undefined,
    feeError: 'x',
  });
  assert.equal(noticeFromCreated(null), null);
  assert.equal(noticeFromCreated({}), null);
});
