import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_CARD_DEFAULTS,
  LOGO_MAX_BYTES,
  resolveForm,
  buildPayload,
  checkLogoFile,
} from './reportCardSettings.js';

test('an unconfigured organization shows the defaults', () => {
  assert.deepEqual(resolveForm(undefined, {}), REPORT_CARD_DEFAULTS);
  assert.deepEqual(resolveForm({}, {}), REPORT_CARD_DEFAULTS);
});

test('saved values win over defaults, edits win over saved', () => {
  const form = resolveForm(
    { preset: 'modern', accentColor: '#1a5c1a', showRank: false },
    {
      accentColor: '#112233',
    }
  );
  assert.equal(form.preset, 'modern');
  assert.equal(form.accentColor, '#112233');
  assert.equal(form.showRank, false);
  assert.equal(form.showAttendance, true);
});

test('keys the form does not edit (logoKey, unknowns) are not carried into it', () => {
  const form = resolveForm({ logoKey: 'branding/x/logo.png', other: 1 }, {});
  assert.equal('logoKey' in form, false);
  assert.equal('other' in form, false);
});

test('false booleans from the server are kept, not reset to true', () => {
  const form = resolveForm({ showRank: false, showAttendance: false }, {});
  assert.equal(form.showRank, false);
  assert.equal(form.showAttendance, false);
});

test('the defaults are never shared with a caller who edits them', () => {
  const a = resolveForm({}, {});
  a.signatories.push('Hacker');
  assert.deepEqual(resolveForm({}, {}).signatories, ['Class Teacher', 'Principal']);
});

test('the payload trims text, drops blank signatories and keeps at most three', () => {
  const result = buildPayload({
    ...REPORT_CARD_DEFAULTS,
    schoolName: '  Green Valley  ',
    signatories: [' Class Teacher ', '', 'Vice Principal', 'Principal', 'Extra'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.schoolName, 'Green Valley');
  assert.deepEqual(result.payload.signatories, ['Class Teacher', 'Vice Principal', 'Principal']);
});

test('a form with no signatory left cannot be saved', () => {
  const result = buildPayload({ ...REPORT_CARD_DEFAULTS, signatories: ['', '  '] });
  assert.deepEqual(result, { ok: false, field: 'signatories' });
});

test('the payload carries every editable key and never logoKey', () => {
  const { payload } = buildPayload(REPORT_CARD_DEFAULTS);
  assert.deepEqual(Object.keys(payload).sort(), [
    'accentColor',
    'footerText',
    'gradingLegend',
    'preset',
    'schoolName',
    'showAttendance',
    'showRank',
    'signatories',
    'subtitle',
  ]);
});

test('a logo must be a PNG or JPEG of at most 500 KB', () => {
  assert.equal(checkLogoFile({ type: 'image/png', size: 1000 }), null);
  assert.equal(checkLogoFile({ type: 'image/jpeg', size: LOGO_MAX_BYTES }), null);
  assert.equal(checkLogoFile({ type: 'image/gif', size: 1000 }), 'type');
  assert.equal(checkLogoFile({ type: 'application/pdf', size: 1000 }), 'type');
  assert.equal(checkLogoFile({ type: 'image/png', size: LOGO_MAX_BYTES + 1 }), 'size');
  assert.equal(LOGO_MAX_BYTES, 500 * 1024);
});
