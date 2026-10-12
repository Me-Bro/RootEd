import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBrand } from './brand.js';

test('ranabrothers.online hosts get Rana Brothers', () => {
  for (const host of [
    'ranabrothers.online',
    'rooted.ranabrothers.online',
    'Rooted-UAT.RanaBrothers.online',
  ]) {
    assert.equal(resolveBrand(host).company, 'Rana Brothers');
  }
  assert.equal(resolveBrand('rooted.ranabrothers.online').showStory, false);
});

test('everything else keeps Rural Root Cloud', () => {
  for (const host of [
    'rooted.ruralrootcloud.com',
    'acme-rooted.ruralrootcloud.com',
    'localhost',
    '',
    'notranabrothers.online',
  ]) {
    assert.equal(resolveBrand(host).shortName, 'Rural Root Cloud');
  }
});
