import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PROFILE_FORM,
  profileToForm,
  formToPayload,
  hasProfileContent,
} from './orgProfile.js';

test('an org with nothing saved gives a blank form', () => {
  assert.deepEqual(profileToForm(undefined), EMPTY_PROFILE_FORM);
  assert.deepEqual(profileToForm({}), EMPTY_PROFILE_FORM);
});

test('saved values fill the form, with the API HTML entities put back', () => {
  const form = profileToForm({
    description: 'Arts &amp; Science',
    address: { city: 'Pune', line1: '12 A &lt;B&gt;' },
    phone: '123',
  });
  assert.equal(form.description, 'Arts & Science');
  assert.equal(form.city, 'Pune');
  assert.equal(form.line1, '12 A <B>');
  assert.equal(form.phone, '123');
  assert.equal(form.website, '');
});

test('the payload sends every key so a cleared field clears the saved one', () => {
  const payload = formToPayload({ ...EMPTY_PROFILE_FORM, city: ' Pune ', phone: '' });
  assert.equal(payload.address.city, 'Pune');
  assert.equal(payload.phone, '');
  assert.equal(payload.website, '');
  assert.deepEqual(Object.keys(payload.address).sort(), [
    'city',
    'country',
    'line1',
    'line2',
    'pincode',
    'state',
  ]);
});

test('registrationNumber is left out unless the viewer may see it', () => {
  assert.ok(!('registrationNumber' in formToPayload(EMPTY_PROFILE_FORM, { admin: false })));
  assert.ok('registrationNumber' in formToPayload(EMPTY_PROFILE_FORM, { admin: true }));
});

test('hasProfileContent is false for an empty profile and true for any filled field', () => {
  assert.equal(hasProfileContent(undefined), false);
  assert.equal(hasProfileContent({ address: {} }), false);
  assert.equal(hasProfileContent({ logoUrl: 'http://x' }), true);
  assert.equal(hasProfileContent({ address: { city: 'Pune' } }), true);
});
