import {
  createAssignmentSchema,
  updateAssignmentSchema,
  upsertSubmissionSchema,
  createProjectSchema,
  updateProjectSchema,
} from '@rooted/shared/schemas';

const id = () => '64b7f0c2a1b2c3d4e5f60718';

describe('createAssignmentSchema', () => {
  const valid = {
    sectionId: id(),
    subjectId: id(),
    termId: id(),
    title: 'Build a REST API',
    dueDate: '2026-11-01',
  };

  test('accepts a valid body and defaults maxScore to 10', () => {
    const out = createAssignmentSchema.parse(valid);
    expect(out.maxScore).toBe(10);
    expect(out.dueDate).toBeInstanceOf(Date);
  });

  test.each([
    ['bad section id', { sectionId: 'nope' }],
    ['empty title', { title: '   ' }],
    ['zero max score', { maxScore: 0 }],
    ['negative max score', { maxScore: -5 }],
    ['absurd max score', { maxScore: 100000 }],
    ['unparseable due date', { dueDate: 'not-a-date' }],
  ])('rejects %s', (_label, patch) => {
    expect(() => createAssignmentSchema.parse({ ...valid, ...patch })).toThrow();
  });
});

describe('updateAssignmentSchema', () => {
  test('allows editing the descriptive fields', () => {
    expect(updateAssignmentSchema.parse({ title: 'New', maxScore: 20 })).toEqual({
      title: 'New',
      maxScore: 20,
    });
  });

  test('refuses to re-point an assignment at another batch, module or term', () => {
    expect(() => updateAssignmentSchema.parse({ sectionId: id() })).toThrow();
    expect(() => updateAssignmentSchema.parse({ subjectId: id() })).toThrow();
    expect(() => updateAssignmentSchema.parse({ termId: id() })).toThrow();
  });

  test('rejects an empty update', () => {
    expect(() => updateAssignmentSchema.parse({})).toThrow();
  });
});

describe('upsertSubmissionSchema', () => {
  test('accepts a pending submission with no score', () => {
    expect(upsertSubmissionSchema.parse({ status: 'pending' })).toEqual({ status: 'pending' });
  });

  test('a reviewed submission must carry a score', () => {
    expect(() => upsertSubmissionSchema.parse({ status: 'reviewed' })).toThrow();
    expect(upsertSubmissionSchema.parse({ status: 'reviewed', score: 7 }).score).toBe(7);
  });

  test('rejects a negative score and an unknown status', () => {
    expect(() => upsertSubmissionSchema.parse({ status: 'reviewed', score: -1 })).toThrow();
    expect(() => upsertSubmissionSchema.parse({ status: 'graded', score: 1 })).toThrow();
  });

  test('a zero score is a real score, not a missing one', () => {
    expect(upsertSubmissionSchema.parse({ status: 'reviewed', score: 0 }).score).toBe(0);
  });
});

describe('createProjectSchema', () => {
  const valid = { sectionId: id(), termId: id(), name: 'Team 1 — Attendance app' };

  test('accepts a minimal project', () => {
    const out = createProjectSchema.parse(valid);
    expect(out.memberIds).toEqual([]);
    expect(out.milestones).toEqual([]);
  });

  test('accepts an https repo url and rejects other schemes', () => {
    expect(
      createProjectSchema.parse({ ...valid, repoUrl: 'https://github.com/org/repo' }).repoUrl
    ).toBe('https://github.com/org/repo');
    expect(() => createProjectSchema.parse({ ...valid, repoUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => createProjectSchema.parse({ ...valid, repoUrl: 'ftp://x/y' })).toThrow();
    expect(() => createProjectSchema.parse({ ...valid, repoUrl: 'not a url' })).toThrow();
  });

  test('de-duplicates nothing silently: duplicate members are rejected', () => {
    expect(() => createProjectSchema.parse({ ...valid, memberIds: [id(), id()] })).toThrow();
  });
});

describe('updateProjectSchema', () => {
  test('review score is 0-100 and may be cleared with null', () => {
    expect(updateProjectSchema.parse({ reviewScore: 88 }).reviewScore).toBe(88);
    expect(updateProjectSchema.parse({ reviewScore: null }).reviewScore).toBeNull();
    expect(() => updateProjectSchema.parse({ reviewScore: 101 })).toThrow();
    expect(() => updateProjectSchema.parse({ reviewScore: -1 })).toThrow();
  });

  test('milestones carry a title and optional dates', () => {
    const out = updateProjectSchema.parse({
      milestones: [{ title: 'Auth done', dueDate: '2026-11-10', doneAt: '2026-11-09' }],
    });
    expect(out.milestones[0].doneAt).toBeInstanceOf(Date);
    expect(() => updateProjectSchema.parse({ milestones: [{ title: '' }] })).toThrow();
  });

  test('cannot move a project to another batch or term', () => {
    expect(() => updateProjectSchema.parse({ sectionId: id() })).toThrow();
  });
});
