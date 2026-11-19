import mongoose from 'mongoose';
import { changedFields, redactFields, studentIdFor, REDACTED } from '../utils/auditDiff.js';

describe('changedFields', () => {
  test('reports only the fields that changed, on both sides', () => {
    const diff = changedFields(
      { firstName: 'Asha', phone: '111', status: 'active' },
      { firstName: 'Asha', phone: '222', status: 'active' }
    );
    expect(diff).toEqual({ before: { phone: '111' }, after: { phone: '222' } });
  });

  test('returns null when nothing changed', () => {
    expect(changedFields({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBeNull();
  });

  test('a cleared field shows its old value and no new one', () => {
    const diff = changedFields({ allergies: 'nuts' }, {});
    expect(diff.before).toEqual({ allergies: 'nuts' });
    expect(diff.after.allergies).toBeUndefined();
  });

  test('a newly set field has no before value', () => {
    const diff = changedFields({}, { bloodGroup: 'O+' });
    expect(diff.after).toEqual({ bloodGroup: 'O+' });
    expect(diff.before.bloodGroup).toBeUndefined();
  });

  test('null and undefined are the same', () => {
    expect(changedFields({ a: null }, {})).toBeNull();
  });

  test('equal dates and ids are not changes; different ones are', () => {
    const id = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    expect(
      changedFields(
        { at: new Date('2026-01-01'), sectionId: id },
        { at: new Date('2026-01-01'), sectionId: new mongoose.Types.ObjectId(id.toString()) }
      )
    ).toBeNull();
    const diff = changedFields({ sectionId: id }, { sectionId: other });
    expect(Object.keys(diff.after)).toEqual(['sectionId']);
  });

  test('nested objects and arrays compare by value', () => {
    expect(
      changedFields(
        { address: { city: 'Pune' }, parentContacts: [{ name: 'A' }] },
        { address: { city: 'Pune' }, parentContacts: [{ name: 'A' }] }
      )
    ).toBeNull();
    const diff = changedFields({ parentContacts: [{ name: 'A' }] }, { parentContacts: [] });
    expect(Object.keys(diff.after)).toEqual(['parentContacts']);
  });

  test('a redacted field is reported as changed but never carries its value', () => {
    const diff = changedFields(
      { aadhaarLast4: '1234', phone: '1' },
      { aadhaarLast4: '9876', phone: '1' },
      { redact: ['aadhaarLast4'] }
    );
    expect(diff).toEqual({ before: { aadhaarLast4: REDACTED }, after: { aadhaarLast4: REDACTED } });
    expect(JSON.stringify(diff)).not.toMatch(/1234|9876/);
  });
});

describe('redactFields', () => {
  test('masks listed keys and leaves the rest and the input alone', () => {
    const input = { name: 'A', aadhaarEnc: 'secret' };
    const out = redactFields(input, ['aadhaarEnc', 'absent']);
    expect(out).toEqual({ name: 'A', aadhaarEnc: REDACTED });
    expect(input.aadhaarEnc).toBe('secret');
    expect('absent' in out).toBe(false);
  });
});

describe('studentIdFor', () => {
  const id = new mongoose.Types.ObjectId();

  test('an explicit studentId wins', () => {
    expect(studentIdFor({ studentId: id, target: { model: 'Student', id: 'other' } })).toBe(id);
  });

  test('a Student target is the learner', () => {
    expect(studentIdFor({ target: { model: 'Student', id } })).toBe(id);
  });

  test('a snapshot that carries the learner is read', () => {
    expect(studentIdFor({ target: { model: 'Visit' }, after: { studentId: id } })).toBe(id);
    expect(studentIdFor({ target: { model: 'FeeAssignment' }, before: { studentId: id } })).toBe(
      id
    );
    expect(
      studentIdFor({ target: { model: 'FeeAssignment' }, after: { assignment: { studentId: id } } })
    ).toBe(id);
  });

  test('an entry about no learner has none', () => {
    expect(studentIdFor({ target: { model: 'Seat' }, after: { label: 'A-1' } })).toBeUndefined();
    expect(studentIdFor({ action: 'tenant.updated' })).toBeUndefined();
  });
});
