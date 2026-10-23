import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Student } from '../models/Student.js';
import { Notification } from '../models/Notification.js';
import { notifyStudents } from '../services/notification.service.js';

let mongod;
let tenant;
let other;
const message = { title: 'New assignment', body: 'Quiz is due', link: '/me/progress' };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  tenant = await Tenant.create({ name: 'Catalyst', subdomain: 'catalyst' });
  other = await Tenant.create({ name: 'Elsewhere', subdomain: 'elsewhere' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const student = (tenantId, n, userId) =>
  Student.create({
    tenantId,
    admissionNo: `A${n}`,
    firstName: 'S',
    lastName: String(n),
    ...(userId ? { userId } : {}),
  });

describe('notifyStudents', () => {
  test('notifies only students with a login, in their own tenant', async () => {
    const withLogin = new mongoose.Types.ObjectId();
    const a = await student(tenant._id, 1, withLogin);
    const b = await student(tenant._id, 2); // no login: skipped
    const c = await student(other._id, 3, new mongoose.Types.ObjectId()); // other tenant

    const sent = await notifyStudents(tenant._id, [a._id, b._id, c._id], message);

    expect(sent).toBe(1);
    const rows = await Notification.find({ tenantId: tenant._id }).lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].userId)).toBe(String(withLogin));
    expect(rows[0]).toMatchObject({ title: 'New assignment', read: false, link: '/me/progress' });
    expect(await Notification.countDocuments({ tenantId: other._id })).toBe(0);
  });

  test('does nothing for an empty list', async () => {
    expect(await notifyStudents(tenant._id, [], message)).toBe(0);
  });
});
