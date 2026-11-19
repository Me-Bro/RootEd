import test from 'node:test';
import assert from 'node:assert/strict';
import { actionKey, editChanges, historyMessage } from './studentHistory.js';

const entry = (action, params = {}, extra = {}) => ({ action, params, ...extra });

test('an action key swaps the dots for underscores', () => {
  assert.equal(
    actionKey('student.feePlan.set'),
    'studyCenter.studentHistory.actions.student_feePlan_set'
  );
});

test('an unknown action gets the generic line naming it', () => {
  const m = historyMessage(entry('something.new'));
  assert.equal(m.key, 'studyCenter.studentHistory.actions.unknown');
  assert.deepEqual(m.params, { action: 'something.new' });
});

test('a status change has a second wording only when there is a reason', () => {
  const plain = historyMessage(entry('student.status_change', { from: 'active', to: 'withdrawn' }));
  const why = historyMessage(
    entry('student.status_change', { from: 'active', to: 'withdrawn', reason: 'Moved' })
  );
  assert.ok(plain.key.endsWith('student_status_change'));
  assert.ok(why.key.endsWith('student_status_change_withReason'));
  assert.equal(why.params.reason, 'Moved');
});

test('an automatic check-out has its own wording', () => {
  assert.ok(
    historyMessage(entry('visit.checkOut', { seat: 'A-1' })).key.endsWith('visit_checkOut')
  );
  assert.ok(
    historyMessage(entry('visit.checkOut', { seat: 'A-1', autoClosed: true })).key.endsWith(
      'visit_checkOut_auto'
    )
  );
});

test('a payment shows a formatted amount and the method label it is given', () => {
  const m = historyMessage(
    entry('feePayment.record', { amount: 400, method: 'cash', receiptNumber: 'RCP-1' }),
    { method: (v) => `M:${v}` }
  );
  assert.match(m.params.amount, /400/);
  assert.equal(m.params.method, 'M:cash');
  assert.equal(m.params.receiptNumber, 'RCP-1');
});

test('missing facts show a dash, never "undefined"', () => {
  const m = historyMessage(entry('seatAllocation.move', {}));
  assert.deepEqual(m.params, { from: '—', to: '—', shift: '—' });
  assert.equal(historyMessage(entry('student.feePlan.pause', {})).params.on, '—');
});

test('an edit lists its fields by label', () => {
  const m = historyMessage(entry('student.update', { fields: ['phone', 'address'] }), {
    field: (f) => f.toUpperCase(),
  });
  assert.equal(m.params.fields, 'PHONE, ADDRESS');
});

test('editChanges keeps scalar changes only, with a dash for an empty side', () => {
  const rows = editChanges(
    {
      changes: [
        { field: 'phone', before: '111', after: '222' },
        { field: 'allergies', before: 'nuts', after: null },
        { field: 'address', complex: true },
      ],
    },
    (f) => `L:${f}`
  );
  assert.deepEqual(rows, [
    { field: 'phone', label: 'L:phone', before: '111', after: '222' },
    { field: 'allergies', label: 'L:allergies', before: 'nuts', after: '—' },
  ]);
});

test('every action the server writes for a learner has wording', () => {
  const known = [
    'student.create',
    'student.enrolled',
    'student.update',
    'student.status_change',
    'student.photo_set',
    'student.document_add',
    'student.document_download',
    'student.aadhaar_set',
    'student.aadhaar_cleared',
    'student.aadhaar_revealed',
    'student.account_created',
    'student.claim_resent',
    'walkIn.create',
    'walkIn.eraseContact',
    'visit.checkIn',
    'visit.checkOut',
    'visit.outsideHours',
    'seatAllocation.create',
    'seatAllocation.end',
    'seatAllocation.move',
    'feePayment.record',
    'feePayment.refund',
    'feeSale.create',
    'feeSale.discount',
    'feeSale.void',
    'feeAssignment.applyDiscount',
    'feeAssignment.waive',
    'feeDiscount.create',
    'student.feePlan.set',
    'student.feePlan.pause',
    'student.feePlan.resume',
    'student.feePlan.end',
    'student.feePlan.reopen',
    'student.feeStructure.add',
    'student.feeStructure.remove',
  ];
  for (const action of known) {
    assert.ok(!historyMessage(entry(action)).key.endsWith('.unknown'), action);
  }
});

test('every wording the code can pick exists in English and Hindi', async () => {
  const { readFileSync } = await import('node:fs');
  const load = (lang) =>
    JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
  const actions = [
    'student.create',
    'student.enrolled',
    'student.update',
    'student.status_change',
    'student.photo_set',
    'student.document_add',
    'student.document_download',
    'student.aadhaar_set',
    'student.aadhaar_cleared',
    'student.aadhaar_revealed',
    'student.account_created',
    'student.claim_resent',
    'walkIn.create',
    'walkIn.eraseContact',
    'visit.checkIn',
    'visit.checkOut',
    'visit.outsideHours',
    'seatAllocation.create',
    'seatAllocation.end',
    'seatAllocation.move',
    'feePayment.record',
    'feePayment.refund',
    'feeSale.create',
    'feeSale.discount',
    'feeSale.void',
    'feeAssignment.applyDiscount',
    'feeAssignment.waive',
    'feeDiscount.create',
    'student.feePlan.set',
    'student.feePlan.pause',
    'student.feePlan.resume',
    'student.feePlan.end',
    'student.feePlan.reopen',
    'student.feeStructure.add',
    'student.feeStructure.remove',
  ];
  const keys = new Set([
    'studyCenter.studentHistory.actions.unknown',
    ...actions.map((a) => historyMessage(entry(a)).key),
    historyMessage(entry('student.status_change', { reason: 'x' })).key,
    historyMessage(entry('visit.checkOut', { autoClosed: true })).key,
  ]);
  for (const lang of ['en', 'hi']) {
    const locale = load(lang);
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node?.[part], locale);
      assert.equal(typeof value, 'string', `${lang}: ${key}`);
    }
  }
});
