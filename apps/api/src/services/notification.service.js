import { Notification } from '../models/Notification.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { Role } from '../models/Role.js';
import { Student } from '../models/Student.js';

export async function createNotification({ tenantId, userId, title, body, type = 'info', link }) {
  return Notification.create({ tenantId, userId, title, body, type, link });
}

/**
 * In-app notice for each of these students that has a login. A student record
 * need not have one (see Student.userId), so those are skipped, not an error.
 */
export async function notifyStudents(tenantId, studentIds, { title, body, link }) {
  const students = await Student.find({
    tenantId,
    _id: { $in: studentIds },
    userId: { $type: 'objectId' },
  })
    .select('userId')
    .lean();
  if (!students.length) return 0;

  await Notification.insertMany(
    students.map((s) => ({ tenantId, userId: s.userId, title, body, type: 'info', link }))
  );
  return students.length;
}

export async function markRead(notificationId, userId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { read: true } },
    { new: true, _bypassTenantScope: true }
  ).lean();

  if (!notification) throw new Error('Notification not found');
  return notification;
}

export async function getUnread(userId, tenantId) {
  return Notification.find({ tenantId, userId, read: false })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
}

export async function broadcastToRole(tenantId, roleKey, title, body, link) {
  const roles = await Role.find({ tenantId, templateKey: roleKey }).lean();
  if (!roles.length) return;

  const roleIds = roles.map((r) => r._id);
  const memberships = await TenantMembership.find({
    tenantId,
    status: 'active',
    roleIds: { $in: roleIds },
  }).lean();

  const notifications = memberships.map((m) => ({
    tenantId,
    userId: m.userId,
    title,
    body,
    type: 'info',
    link,
  }));

  if (notifications.length) {
    await Notification.insertMany(notifications);
  }

  return notifications.length;
}
