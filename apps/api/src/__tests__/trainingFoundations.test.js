import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  ASSESSMENT_TYPES,
  ALL_MODULES,
  REPORT_CARD_EXCLUDED_ASSESSMENT_TYPES,
  TRAINING_TARGETS,
} from '@rooted/shared/constants';
import { Grade } from '../models/Grade.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('baseline and mock_interview are assessment types', () => {
  expect(ASSESSMENT_TYPES).toEqual(expect.arrayContaining(['baseline', 'mock_interview']));
  // The original four stay, in their original order at the front.
  expect(ASSESSMENT_TYPES.slice(0, 4)).toEqual(['quiz', 'midterm', 'final', 'other']);
});

test('training is a known module', () => {
  expect(ALL_MODULES).toContain('training');
});

test('training targets match the business plan pilot metrics', () => {
  expect(TRAINING_TARGETS).toEqual({
    attendance: 80,
    completion: 85,
    project: 80,
    mockInterview: 80,
  });
});

test('baseline and mock_interview never appear on a report card', () => {
  expect(REPORT_CARD_EXCLUDED_ASSESSMENT_TYPES).toEqual(
    expect.arrayContaining(['baseline', 'mock_interview'])
  );
  expect(REPORT_CARD_EXCLUDED_ASSESSMENT_TYPES).not.toContain('final');
  for (const t of REPORT_CARD_EXCLUDED_ASSESSMENT_TYPES) {
    expect(ASSESSMENT_TYPES).toContain(t);
  }
});

test('one student/subject/term holds a baseline and a final grade at once', async () => {
  const base = {
    tenantId: new mongoose.Types.ObjectId(),
    studentId: new mongoose.Types.ObjectId(),
    sectionId: new mongoose.Types.ObjectId(),
    subjectId: new mongoose.Types.ObjectId(),
    termId: new mongoose.Types.ObjectId(),
    academicYearId: new mongoose.Types.ObjectId(),
  };
  await Grade.syncIndexes();
  await Grade.create({ ...base, assessmentType: 'baseline', score: 40 });
  await Grade.create({ ...base, assessmentType: 'final', score: 75 });
  await Grade.create({ ...base, assessmentType: 'mock_interview', score: 60 });

  const found = await Grade.find({ tenantId: base.tenantId, studentId: base.studentId });
  expect(found.map((g) => g.assessmentType).sort()).toEqual([
    'baseline',
    'final',
    'mock_interview',
  ]);

  await expect(Grade.create({ ...base, assessmentType: 'baseline', score: 50 })).rejects.toThrow(
    /duplicate key|E11000/
  );
});

test('Grade rejects an unknown assessment type', async () => {
  const g = new Grade({
    tenantId: new mongoose.Types.ObjectId(),
    studentId: new mongoose.Types.ObjectId(),
    sectionId: new mongoose.Types.ObjectId(),
    subjectId: new mongoose.Types.ObjectId(),
    termId: new mongoose.Types.ObjectId(),
    academicYearId: new mongoose.Types.ObjectId(),
    assessmentType: 'pop_quiz',
  });
  await expect(g.validate()).rejects.toThrow(/assessmentType/);
});
