import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradesGap } from './gradesGap.js';

const some = [{}];

test('gradesGap names the first missing prerequisite', () => {
  assert.equal(gradesGap({ sections: [], terms: some, subjects: some }), 'sections');
  assert.equal(gradesGap({ sections: some, terms: [], subjects: [] }), 'terms');
  assert.equal(gradesGap({ sections: some, terms: some, subjects: [] }), 'subjects');
  assert.equal(gradesGap({ sections: some, terms: some, subjects: some }), null);
});

test('gradesGap stays quiet while a list is still loading (undefined)', () => {
  assert.equal(gradesGap({ sections: undefined, terms: undefined, subjects: undefined }), null);
  assert.equal(gradesGap({ sections: some, terms: undefined, subjects: [] }), 'subjects');
});
