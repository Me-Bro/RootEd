import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { normalizeJoinCode } from '@rooted/shared/utils';
import { JOIN_CODE_ALPHABET } from '@rooted/shared/constants';
import { Tenant } from '../models/Tenant.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { hashPassword } from '../services/auth.service.js';
import {
  generateJoinCode,
  formatJoinCode,
  tenantForJoinCode,
  rotateJoinCode,
  submitJoinRequest,
  approveJoinRequest,
  rejectJoinRequest,
  REJECTED_COOLDOWN_MS,
} from '../services/joinRequest.service.js';
import { redis } from '../config/redis.js';

let mongod;
let tenant;
let otherTenant;
let teacherRole;
let foreignRole;
let admin;
let n = 0;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Tenant.syncIndexes();

  tenant = await Tenant.create({ name: 'Open School', subdomain: 'open-school' });
  otherTenant = await Tenant.create({ name: 'Shut School', subdomain: 'shut-school' });
  teacherRole = await Role.create({
    tenantId: tenant._id,
    name: 'teacher',
    permissions: ['students:read'],
  });
  foreignRole = await Role.create({
    tenantId: otherTenant._id,
    name: 'teacher',
    permissions: ['students:read'],
  });
  admin = await makeUser();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

async function makeUser() {
  n += 1;
  return User.create({
    email: `joiner${n}@school.edu`,
    username: `joiner-${n}`,
    usernameLower: `joiner-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
}

/** Puts the tenant in code mode with a fresh code, returning the typed form. */
async function openTenant(target = tenant, extra = {}) {
  await Tenant.findByIdAndUpdate(target._id, {
    $set: { 'joinPolicy.mode': 'code', 'joinPolicy.requireApproval': true, ...extra },
  });
  const { code } = await rotateJoinCode(target._id);
  return code;
}

describe('join code format', () => {
  test('uses only the Crockford alphabet and round-trips through normalisation', () => {
    const code = generateJoinCode();
    expect(code).toMatch(/^RTED-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    const stored = normalizeJoinCode(code);
    expect(stored).toHaveLength(10);
    for (const ch of stored) expect(JOIN_CODE_ALPHABET).toContain(ch);
    expect(formatJoinCode(stored)).toBe(code);
  });

  test('survives being copied off a whiteboard', () => {
    const stored = normalizeJoinCode('RTED-4K2M9-QX730');
    // Lower case, missing prefix, spaces instead of dashes, and the classic
    // I/L-for-1 and O-for-0 misreadings all resolve to the same code.
    expect(normalizeJoinCode('rted-4k2m9-qx730')).toBe(stored);
    expect(normalizeJoinCode('4K2M9 QX730')).toBe(stored);
    expect(normalizeJoinCode('RTED-4K2M9-QX73O')).toBe(stored);
    expect(normalizeJoinCode('RTED-4K2M9-QX73o')).toBe(stored);
  });

  test('folds I and L to 1', () => {
    expect(normalizeJoinCode('I')).toBe('1');
    expect(normalizeJoinCode('l')).toBe('1');
  });
});

describe('tenantForJoinCode', () => {
  test('resolves a live code', async () => {
    const code = await openTenant();
    const found = await tenantForJoinCode(code);
    expect(String(found._id)).toBe(String(tenant._id));
  });

  test('gives the same answer for unknown, closed and expired codes', async () => {
    const code = await openTenant();
    const message = 'That join code is not valid';

    await expect(tenantForJoinCode('RTED-ZZZZZ-ZZZZZ')).rejects.toThrow(message);

    await Tenant.findByIdAndUpdate(tenant._id, { $set: { 'joinPolicy.mode': 'closed' } });
    await expect(tenantForJoinCode(code)).rejects.toThrow(message);

    await Tenant.findByIdAndUpdate(tenant._id, {
      $set: { 'joinPolicy.mode': 'code', 'joinPolicy.codeExpiresAt': new Date(Date.now() - 1000) },
    });
    await expect(tenantForJoinCode(code)).rejects.toThrow(message);
  });

  test('a suspended tenant is not joinable', async () => {
    const code = await openTenant();
    await Tenant.findByIdAndUpdate(tenant._id, { $set: { status: 'suspended' } });
    await expect(tenantForJoinCode(code)).rejects.toThrow(/not valid/i);
    await Tenant.findByIdAndUpdate(tenant._id, { $set: { status: 'active' } });
  });

  test('rotating invalidates the previous code', async () => {
    const first = await openTenant();
    const { code: second } = await rotateJoinCode(tenant._id);
    expect(second).not.toBe(first);
    await expect(tenantForJoinCode(first)).rejects.toThrow(/not valid/i);
    expect(String((await tenantForJoinCode(second))._id)).toBe(String(tenant._id));
  });
});

describe('submitJoinRequest', () => {
  test('lands as pending with no roles at all', async () => {
    await openTenant();
    const user = await makeUser();
    const { membership, autoApproved } = await submitJoinRequest({
      tenant: await Tenant.findById(tenant._id).lean(),
      user,
      note: 'I teach Year 6',
    });

    expect(autoApproved).toBe(false);
    expect(membership.status).toBe('pending');
    expect(membership.roleIds).toHaveLength(0);
    expect(membership.joinMethod).toBe('join_code');
    expect(membership.requestNote).toBe('I teach Year 6');
  });

  test('a second request while pending is a no-op', async () => {
    await openTenant();
    const lean = await Tenant.findById(tenant._id).lean();
    const user = await makeUser();
    const first = await submitJoinRequest({ tenant: lean, user });
    const second = await submitJoinRequest({ tenant: lean, user });
    expect(String(second.membership._id)).toBe(String(first.membership._id));
    expect(second.membership.status).toBe('pending');
  });

  test('an existing member is told so rather than re-queued', async () => {
    await openTenant();
    const lean = await Tenant.findById(tenant._id).lean();
    const user = await makeUser();
    await TenantMembership.create({
      tenantId: tenant._id,
      userId: user._id,
      roleIds: [teacherRole._id],
      status: 'active',
    });
    await expect(submitJoinRequest({ tenant: lean, user })).rejects.toThrow(/already a member/i);
  });

  test('a suspended member cannot rejoin with the code', async () => {
    await openTenant();
    const lean = await Tenant.findById(tenant._id).lean();
    const user = await makeUser();
    await TenantMembership.create({
      tenantId: tenant._id,
      userId: user._id,
      roleIds: [],
      status: 'suspended',
    });

    await expect(submitJoinRequest({ tenant: lean, user })).rejects.toThrow(/cannot rejoin/i);
    const after = await TenantMembership.findOne({ tenantId: tenant._id, userId: user._id }).lean();
    expect(after.status).toBe('suspended');
  });

  test('a rejected applicant is held off until the cooldown expires', async () => {
    await openTenant();
    const lean = await Tenant.findById(tenant._id).lean();
    const user = await makeUser();
    await TenantMembership.create({
      tenantId: tenant._id,
      userId: user._id,
      roleIds: [],
      status: 'rejected',
      rejectedAt: new Date(),
    });

    await expect(submitJoinRequest({ tenant: lean, user })).rejects.toThrow(/cannot rejoin/i);

    await TenantMembership.updateOne(
      { tenantId: tenant._id, userId: user._id },
      { rejectedAt: new Date(Date.now() - REJECTED_COOLDOWN_MS - 1000) }
    );
    const { membership } = await submitJoinRequest({ tenant: lean, user });
    expect(membership.status).toBe('pending');
    expect(membership.rejectedAt).toBeUndefined();
  });

  test('auto-approval grants the configured default roles immediately', async () => {
    await openTenant(tenant, {
      'joinPolicy.requireApproval': false,
      'joinPolicy.defaultRoleIds': [teacherRole._id],
    });
    const lean = await Tenant.findById(tenant._id).lean();
    const user = await makeUser();

    const { membership, autoApproved } = await submitJoinRequest({ tenant: lean, user });
    expect(autoApproved).toBe(true);
    expect(membership.status).toBe('active');
    expect(membership.roleIds.map(String)).toEqual([String(teacherRole._id)]);
  });
});

describe('approve and reject', () => {
  async function pending() {
    await openTenant(tenant, { 'joinPolicy.requireApproval': true });
    const lean = await Tenant.findById(tenant._id).lean();
    const user = await makeUser();
    const { membership } = await submitJoinRequest({ tenant: lean, user });
    return membership;
  }

  test('approving activates the member with the chosen roles', async () => {
    const membership = await pending();
    const approved = await approveJoinRequest({
      tenantId: tenant._id,
      membershipId: membership._id,
      roleIds: [teacherRole._id],
      approvedBy: admin._id,
    });

    expect(approved.status).toBe('active');
    expect(approved.roleIds.map(String)).toEqual([String(teacherRole._id)]);
    expect(String(approved.approvedBy)).toBe(String(admin._id));
    expect(approved.approvedAt).toBeInstanceOf(Date);
  });

  test('approving with another tenant’s role is refused', async () => {
    const membership = await pending();
    await expect(
      approveJoinRequest({
        tenantId: tenant._id,
        membershipId: membership._id,
        roleIds: [foreignRole._id],
        approvedBy: admin._id,
      })
    ).rejects.toThrow(/do not belong/i);
  });

  test('rejecting records the decision instead of deleting the row', async () => {
    const membership = await pending();
    const rejected = await rejectJoinRequest({
      tenantId: tenant._id,
      membershipId: membership._id,
      rejectedBy: admin._id,
    });

    expect(rejected.status).toBe('rejected');
    expect(rejected.roleIds).toHaveLength(0);
    expect(rejected.rejectedAt).toBeInstanceOf(Date);
  });

  test('a decided request cannot be decided twice', async () => {
    const membership = await pending();
    await rejectJoinRequest({
      tenantId: tenant._id,
      membershipId: membership._id,
      rejectedBy: admin._id,
    });
    await expect(
      approveJoinRequest({
        tenantId: tenant._id,
        membershipId: membership._id,
        roleIds: [teacherRole._id],
        approvedBy: admin._id,
      })
    ).rejects.toThrow(/no pending request/i);
  });

  test('another tenant cannot approve this tenant’s request', async () => {
    const membership = await pending();
    await expect(
      approveJoinRequest({
        tenantId: otherTenant._id,
        membershipId: membership._id,
        roleIds: [foreignRole._id],
        approvedBy: admin._id,
      })
    ).rejects.toThrow(/no pending request/i);
  });
});
