import { isOpen, openItemIds, unmetPrerequisites, hasCycle } from '../utils/roadmapLock.js';

const item = (_id, locked = false, unlockAfter = []) => ({ _id, locked, unlockAfter });

describe('isOpen', () => {
  test('an unlocked item is always open', () => {
    expect(isOpen(item('a'), [])).toBe(true);
  });

  test('a locked item with an unmet prerequisite is closed', () => {
    expect(isOpen(item('b', true, ['a']), [])).toBe(false);
  });

  test('opens once every prerequisite is complete, not before', () => {
    const c = item('c', true, ['a', 'b']);
    expect(isOpen(c, ['a'])).toBe(false);
    expect(isOpen(c, ['a', 'b'])).toBe(true);
  });

  test('a locked item with no prerequisites is a mentor hold and stays closed', () => {
    expect(isOpen(item('a', true), ['x', 'y'])).toBe(false);
  });

  test('compares ids as strings, so ObjectId-like values match', () => {
    const oid = (s) => ({ toString: () => s });
    expect(isOpen(item(oid('b'), true, [oid('a')]), [oid('a')])).toBe(true);
  });
});

test('unmetPrerequisites lists only the missing ones', () => {
  expect(unmetPrerequisites(item('c', true, ['a', 'b']), ['a'])).toEqual(['b']);
});

test('openItemIds returns the open subset', () => {
  const items = [item('a'), item('b', true, ['a']), item('c', true)];
  expect([...openItemIds(items, [])]).toEqual(['a']);
  expect([...openItemIds(items, ['a'])].sort()).toEqual(['a', 'b']);
});

describe('hasCycle', () => {
  test('a chain is fine', () => {
    expect(hasCycle([item('a'), item('b', true, ['a']), item('c', true, ['b', 'a'])])).toBe(false);
  });

  test('an item listing itself is a cycle', () => {
    expect(hasCycle([item('a', true, ['a'])])).toBe(true);
  });

  test('a loop of two or more is a cycle', () => {
    expect(hasCycle([item('a', true, ['b']), item('b', true, ['a'])])).toBe(true);
    expect(hasCycle([item('a', true, ['c']), item('b', true, ['a']), item('c', true, ['b'])])).toBe(
      true
    );
  });

  test('empty list has no cycle', () => {
    expect(hasCycle([])).toBe(false);
  });
});
