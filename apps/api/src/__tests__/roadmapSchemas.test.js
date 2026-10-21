import {
  createRoadmapSchema,
  createRoadmapItemSchema,
  updateRoadmapItemSchema,
  reorderRoadmapItemsSchema,
  roadmapProgressUpdateSchema,
  scheduleFieldError,
} from '@rooted/shared/schemas';
import { unescapeText } from '@rooted/shared/utils';

const id = '64b7f0c2a1b2c3d4e5f60718';
const id2 = '64b7f0c2a1b2c3d4e5f60719';

describe('createRoadmapSchema', () => {
  const valid = { sectionId: id, termId: id, title: 'Full-stack track' };

  test('defaults to unpublished with no timeline', () => {
    const out = createRoadmapSchema.parse(valid);
    expect(out.scheduleMode).toBe('none');
    expect(out.published).toBe(false);
  });

  test('rejects an unknown schedule mode', () => {
    expect(() => createRoadmapSchema.parse({ ...valid, scheduleMode: 'monthly' })).toThrow();
  });

  test('puts back an ampersand the sanitiser escaped', () => {
    expect(createRoadmapSchema.parse({ ...valid, title: 'HTML &amp; CSS' }).title).toBe(
      'HTML & CSS'
    );
  });
});

describe('createRoadmapItemSchema', () => {
  const valid = { type: 'theory', title: 'Read chapter 1' };

  test('accepts a minimal item and defaults to unlocked', () => {
    const out = createRoadmapItemSchema.parse(valid);
    expect(out.locked).toBe(false);
    expect(out.unlockAfter).toEqual([]);
  });

  test('rejects an unknown type', () => {
    expect(() => createRoadmapItemSchema.parse({ ...valid, type: 'quiz' })).toThrow();
  });

  test('rejects a javascript: resource link', () => {
    expect(() =>
      createRoadmapItemSchema.parse({ ...valid, resourceUrl: 'javascript:alert(1)' })
    ).toThrow(/http/i);
  });

  test('keeps the & in a link query string', () => {
    const out = createRoadmapItemSchema.parse({
      ...valid,
      resourceUrl: 'https://example.com/a?x=1&amp;y=2',
    });
    expect(out.resourceUrl).toBe('https://example.com/a?x=1&y=2');
  });

  test('prerequisites need the item to be locked', () => {
    expect(() => createRoadmapItemSchema.parse({ ...valid, unlockAfter: [id] })).toThrow(/locked/i);
    expect(
      createRoadmapItemSchema.parse({ ...valid, locked: true, unlockAfter: [id] }).unlockAfter
    ).toEqual([id]);
  });

  test('rejects a duplicate prerequisite and a non-integer day', () => {
    expect(() =>
      createRoadmapItemSchema.parse({ ...valid, locked: true, unlockAfter: [id, id] })
    ).toThrow();
    expect(() => createRoadmapItemSchema.parse({ ...valid, dayNumber: 1.5 })).toThrow();
  });
});

describe('updateRoadmapItemSchema', () => {
  test('rejects an empty body and unknown keys', () => {
    expect(() => updateRoadmapItemSchema.parse({})).toThrow(/nothing/i);
    expect(() => updateRoadmapItemSchema.parse({ roadmapId: id })).toThrow();
  });

  test('lets a link be cleared with null', () => {
    expect(updateRoadmapItemSchema.parse({ resourceUrl: null }).resourceUrl).toBeNull();
  });
});

describe('reorderRoadmapItemsSchema', () => {
  test('needs at least one unique id', () => {
    expect(() => reorderRoadmapItemsSchema.parse({ itemIds: [] })).toThrow();
    expect(() => reorderRoadmapItemsSchema.parse({ itemIds: [id, id] })).toThrow();
    expect(reorderRoadmapItemsSchema.parse({ itemIds: [id, id2] }).itemIds).toHaveLength(2);
  });
});

describe('scheduleFieldError', () => {
  const day = new Date();
  test('each mode wants exactly its own field', () => {
    expect(scheduleFieldError('dated', { dueDate: day })).toBeNull();
    expect(scheduleFieldError('daily', { dayNumber: 3 })).toBeNull();
    expect(scheduleFieldError('weekly', { weekNumber: 2 })).toBeNull();
    expect(scheduleFieldError('none', {})).toBeNull();
  });

  test('a missing field, a wrong field and an extra field are all errors', () => {
    expect(scheduleFieldError('weekly', {})).toMatch(/weekNumber/);
    expect(scheduleFieldError('weekly', { dayNumber: 2 })).toMatch(/weekNumber/);
    expect(scheduleFieldError('daily', { dayNumber: 2, weekNumber: 1 })).toMatch(/not weekNumber/);
    expect(scheduleFieldError('none', { dayNumber: 2 })).toMatch(/dayNumber/);
  });

  test('null counts as absent', () => {
    expect(scheduleFieldError('none', { dueDate: null })).toBeNull();
  });
});

describe('roadmapProgressUpdateSchema', () => {
  test('rejects an empty body', () => {
    expect(() => roadmapProgressUpdateSchema.parse({})).toThrow(/nothing/i);
  });

  test('rejects a studentId in the body', () => {
    expect(() => roadmapProgressUpdateSchema.parse({ completed: true, studentId: id })).toThrow();
  });

  test('rejects a javascript: link and an over-long answer', () => {
    expect(() => roadmapProgressUpdateSchema.parse({ linkUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => roadmapProgressUpdateSchema.parse({ answer: 'x'.repeat(5001) })).toThrow();
  });

  test('accepts completed, an answer and an https link', () => {
    expect(
      roadmapProgressUpdateSchema.parse({
        completed: true,
        answer: 'Tom &amp; Jerry',
        linkUrl: 'https://github.com/a/b',
      })
    ).toEqual({ completed: true, answer: 'Tom & Jerry', linkUrl: 'https://github.com/a/b' });
  });
});

test('unescapeText only touches strings', () => {
  expect(unescapeText('a &lt; b &amp;&amp; c &gt; d')).toBe('a < b && c > d');
  expect(unescapeText(5)).toBe(5);
});
