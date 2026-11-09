import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { withBalances } from '../services/fee.service.js';
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

test('balance counts discount, late fee and payments, but not refunded payments', async () => {
  const tenant = await Tenant.create({ name: 'Balance School', subdomain: 'balance-school' });
  const tenantId = tenant._id;
  const studentId = new mongoose.Types.ObjectId();
  const base = {
    tenantId,
    studentId,
    feeStructureId: new mongoose.Types.ObjectId(),
    academicYearId: new mongoose.Types.ObjectId(),
  };

  // 10000 - 1000 discount + 500 late fee = 9500 owed.
  const partly = await FeeAssignment.create({
    ...base,
    totalAmount: 10000,
    discountAmount: 1000,
    lateFeeAmount: 500,
    status: 'partial',
  });
  const waived = await FeeAssignment.create({ ...base, totalAmount: 4000, status: 'waived' });
  const untouched = await FeeAssignment.create({ ...base, totalAmount: 2000 });

  const pay = (amount, receiptNumber, extra = {}) =>
    FeePayment.create({
      tenantId,
      assignmentId: partly._id,
      studentId,
      amount,
      paymentMethod: 'cash',
      receiptNumber,
      collectedBy: studentId,
      ...extra,
    });
  await pay(3000, 'RCP-BAL-1');
  await pay(2000, 'RCP-BAL-2', { refunded: true });

  const assignments = await FeeAssignment.find({ tenantId }).lean();
  const byId = Object.fromEntries(
    (await withBalances(tenantId, assignments)).map((a) => [String(a._id), a])
  );

  expect(byId[partly._id]).toMatchObject({ paidAmount: 3000, balanceDue: 6500 });
  expect(byId[waived._id]).toMatchObject({ paidAmount: 0, balanceDue: 0 });
  expect(byId[untouched._id]).toMatchObject({ paidAmount: 0, balanceDue: 2000 });
});
