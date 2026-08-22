import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { getNextSequence } from '../services/counter.service.js';
import { applyAssignmentMutation } from '../services/fee.service.js';
import { redis } from '../config/redis.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

async function makeTenantId() {
  const tenant = await Tenant.create({
    name: 'Concurrency Test School',
    subdomain: `concurrency-${new mongoose.Types.ObjectId().toString()}`,
  });
  return tenant._id;
}

test('getNextSequence is atomic under concurrent calls for the same key', async () => {
  const tenantId = await makeTenantId();

  const results = await Promise.all(
    Array.from({ length: 20 }, () => getNextSequence(tenantId, 'feePayment:receipt:test'))
  );

  expect(new Set(results).size).toBe(20);
  expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
});

test('getNextSequence tracks separate sequences per key', async () => {
  const tenantId = await makeTenantId();

  const a1 = await getNextSequence(tenantId, 'keyA');
  const b1 = await getNextSequence(tenantId, 'keyB');
  const a2 = await getNextSequence(tenantId, 'keyA');

  expect(a1).toBe(1);
  expect(b1).toBe(1);
  expect(a2).toBe(2);
});

test('applyAssignmentMutation does not lose an installment update under concurrent writers', async () => {
  const tenantId = await makeTenantId();
  const studentId = new mongoose.Types.ObjectId();
  const feeStructureId = new mongoose.Types.ObjectId();
  const academicYearId = new mongoose.Types.ObjectId();

  const assignment = await FeeAssignment.create({
    tenantId,
    studentId,
    feeStructureId,
    academicYearId,
    totalAmount: 6000,
    installments: [
      { label: 'I1', amount: 3000, dueDate: new Date(), status: 'unpaid', paidAmount: 0 },
      { label: 'I2', amount: 3000, dueDate: new Date(), status: 'unpaid', paidAmount: 0 },
    ],
  });

  await Promise.all([
    FeePayment.create({
      tenantId,
      assignmentId: assignment._id,
      studentId,
      amount: 3000,
      paymentMethod: 'cash',
      receiptNumber: 'RCP-CONC-00001',
      collectedBy: studentId,
      installmentIndex: 0,
    }).then(() => applyAssignmentMutation(assignment._id, tenantId)),
    FeePayment.create({
      tenantId,
      assignmentId: assignment._id,
      studentId,
      amount: 3000,
      paymentMethod: 'cash',
      receiptNumber: 'RCP-CONC-00002',
      collectedBy: studentId,
      installmentIndex: 1,
    }).then(() => applyAssignmentMutation(assignment._id, tenantId)),
  ]);

  const refetched = await FeeAssignment.findOne({ _id: assignment._id, tenantId }).lean();
  expect(refetched.installments[0].status).toBe('paid');
  expect(refetched.installments[1].status).toBe('paid');
  expect(refetched.status).toBe('paid');
});
