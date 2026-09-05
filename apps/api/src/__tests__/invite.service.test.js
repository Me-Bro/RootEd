import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Invite } from '../models/Invite.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { hashPassword } from '../services/auth.service.js';
import { createInvite, acceptInvite, revokeInvite } from '../services/invite.service.js';
import { redis } from '../config/redis.js';

let mongod;
let tenant;
let otherTenant;
let teacherRole;
let adminRole;
let foreignRole;
let inviter;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Invite.syncIndexes();

  tenant = await Tenant.create({ name: 'Invite School', subdomain: 'invite-school' });
  otherTenant = await Tenant.create({ name: 'Other School', subdomain: 'other-school' });
  teacherRole = await Role.create({
    tenantId: tenant._id,
    name: 'teacher',
    permissions: ['students:read'],
  });
  adminRole = await Role.create({
    tenantId: tenant._id,
    name: 'tenant admin',
    permissions: ['tenant:admin'],
  });
  foreignRole = await Role.create({
    tenantId: otherTenant._id,
    name: 'teacher',
    permissions: ['students:read'],
  });
  inviter = await makeUser('inviter@school.edu');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

let n = 0;
async function makeUser(email, extra = {}) {
  return User.create({
    email,
    username: `u${(n += 1)}-handle`,
    usernameLower: `u${n}-handle`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
    ...extra,
  });
}

const invite = (email, roleIds = [teacherRole._id]) =>
  createInvite({ tenantId: tenant._id, email, roleIds, invitedBy: inviter._id });

describe('createInvite', () => {
  test('rejects a role belonging to another tenant', async () => {
    await expect(invite('cross@school.edu', [foreignRole._id])).rejects.toThrow(
      /do not belong to this organization/i
    );
  });

  test('rejects inviting somebody who is already an active member', async () => {
    const member = await makeUser('already@school.edu');
    await TenantMembership.create({
      tenantId: tenant._id,
      userId: member._id,
      roleIds: [teacherRole._id],
      status: 'active',
    });
    await expect(invite('already@school.edu')).rejects.toThrow(/already a member/i);
  });

  test('refuses to re-invite a suspended member', async () => {
    const member = await makeUser('suspended-invite@school.edu');
    await TenantMembership.create({
      tenantId: tenant._id,
      userId: member._id,
      roleIds: [teacherRole._id],
      status: 'suspended',
    });
    await expect(invite('suspended-invite@school.edu')).rejects.toThrow(/suspended/i);
  });

  test('re-inviting rotates the token on the same row rather than adding another', async () => {
    const first = await invite('rotate@school.edu');
    const second = await invite('rotate@school.edu');

    expect(second.token).not.toBe(first.token);
    expect(String(second.invite._id)).toBe(String(first.invite._id));
    expect(await Invite.countDocuments({ tenantId: tenant._id, email: 'rotate@school.edu' })).toBe(
      1
    );

    // The superseded token must be dead.
    const user = await makeUser('rotate@school.edu');
    await expect(acceptInvite({ token: first.token, user })).rejects.toThrow(/invalid/i);
  });

  test('never stores the raw token', async () => {
    const { invite: doc, token } = await invite('raw@school.edu');
    expect(doc.tokenHash).not.toBe(token);
    expect(doc.tokenHash).toHaveLength(64);
  });
});

describe('acceptInvite', () => {
  test('binds the invitation to the address it was sent to', async () => {
    const { token } = await invite('intended@school.edu');
    const someoneElse = await makeUser('interloper@school.edu');

    await expect(acceptInvite({ token, user: someoneElse })).rejects.toThrow(
      /different email address/i
    );
    expect(
      await TenantMembership.countDocuments({ tenantId: tenant._id, userId: someoneElse._id })
    ).toBe(0);
  });

  test('creates an active membership carrying the invited roles', async () => {
    const { token } = await invite('joiner@school.edu', [teacherRole._id, adminRole._id]);
    const user = await makeUser('joiner@school.edu');

    const result = await acceptInvite({ token, user });
    expect(String(result.tenantId)).toBe(String(tenant._id));

    const membership = await TenantMembership.findOne({
      tenantId: tenant._id,
      userId: user._id,
    }).lean();
    expect(membership.status).toBe('active');
    expect(membership.joinMethod).toBe('invite');
    expect(membership.roleIds.map(String).sort()).toEqual(
      [String(teacherRole._id), String(adminRole._id)].sort()
    );
    expect(String(membership.invitedBy)).toBe(String(inviter._id));
  });

  test('a suspended member cannot launder the suspension through an invite', async () => {
    // The invite is created before the suspension, so createInvite's own guard
    // is not what is under test here.
    const user = await makeUser('launder@school.edu');
    const { token } = await invite('launder@school.edu');
    await TenantMembership.create({
      tenantId: tenant._id,
      userId: user._id,
      roleIds: [],
      status: 'suspended',
    });

    await expect(acceptInvite({ token, user })).rejects.toThrow(/suspended/i);
    const membership = await TenantMembership.findOne({
      tenantId: tenant._id,
      userId: user._id,
    }).lean();
    expect(membership.status).toBe('suspended');
  });

  test('verifies an account that arrived through the invitation', async () => {
    const { token } = await invite('unverified@school.edu');
    const user = await makeUser('unverified@school.edu', {
      emailVerified: false,
      status: 'pending_verification',
    });

    await acceptInvite({ token, user: user.toObject() });

    const after = await User.findById(user._id).lean();
    expect(after.emailVerified).toBe(true);
    expect(after.status).toBe('active');
  });

  test('re-opening your own acceptance link is a no-op; anyone else gets 410', async () => {
    const { token } = await invite('reuse@school.edu');
    const user = await makeUser('reuse@school.edu');
    await acceptInvite({ token, user });

    const again = await acceptInvite({ token, user });
    expect(again.alreadyAccepted).toBe(true);

    const other = await makeUser('reuse-other@school.edu');
    await expect(acceptInvite({ token, user: other })).rejects.toThrow(/already been used/i);
  });

  test('an expired invitation is refused and marked expired', async () => {
    const { invite: doc, token } = await invite('expired@school.edu');
    await Invite.updateOne(
      { _id: doc._id },
      { expiresAt: new Date(Date.now() - 1000) },
      { _bypassTenantScope: true }
    );
    const user = await makeUser('expired@school.edu');

    await expect(acceptInvite({ token, user })).rejects.toThrow(/expired/i);
    const after = await Invite.findById(doc._id).setOptions({ _bypassTenantScope: true }).lean();
    expect(after.status).toBe('expired');
  });

  test('a revoked invitation is refused', async () => {
    const { invite: doc, token } = await invite('revoked@school.edu');
    await revokeInvite(tenant._id, doc._id);
    const user = await makeUser('revoked@school.edu');

    await expect(acceptInvite({ token, user })).rejects.toThrow(/revoked/i);
  });

  test('an invitation into a suspended tenant is refused', async () => {
    const suspended = await Tenant.create({ name: 'Gone', subdomain: 'gone', status: 'suspended' });
    const role = await Role.create({
      tenantId: suspended._id,
      name: 'teacher',
      permissions: ['students:read'],
    });
    const { token } = await createInvite({
      tenantId: suspended._id,
      email: 'gone@school.edu',
      roleIds: [role._id],
      invitedBy: inviter._id,
    });
    const user = await makeUser('gone@school.edu');

    await expect(acceptInvite({ token, user })).rejects.toThrow(/not available/i);
  });
});

describe('revokeInvite', () => {
  test('only revokes within the calling tenant', async () => {
    const { invite: doc } = await invite('scoped@school.edu');
    await expect(revokeInvite(otherTenant._id, doc._id)).rejects.toThrow(/no pending/i);
  });
});
