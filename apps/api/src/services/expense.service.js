import { TenantMembership } from '../models/TenantMembership.js';
import { Role } from '../models/Role.js';
import { Budget } from '../models/Budget.js';
import { ExpenseEntry } from '../models/ExpenseEntry.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { auditLog } from './audit.service.js';
import { sendBudgetAlert } from './email.service.js';

export async function buildApprovalChain(amount, tenantId) {
  if (amount < 1000) return [];

  const memberships = await TenantMembership.find({ tenantId, status: 'active' }).lean();
  const allRoleIds = memberships.flatMap((m) => m.roleIds.map((id) => id.toString()));
  const roles = await Role.find({ _id: { $in: allRoleIds }, tenantId }).lean();

  const approveRoles = roles.filter((r) => r.permissions.includes('expense:approve'));
  const approveRoleIds = new Set(approveRoles.map((r) => r._id.toString()));

  const adminRoles = roles.filter((r) => r.permissions.includes('tenant:admin'));
  const adminRoleIds = new Set(adminRoles.map((r) => r._id.toString()));

  const approverUserIds = [];
  const adminUserIds = [];

  for (const m of memberships) {
    const hasApprove = m.roleIds.some((id) => approveRoleIds.has(id.toString()));
    const isAdmin = m.roleIds.some((id) => adminRoleIds.has(id.toString()));

    if (hasApprove && !isAdmin) approverUserIds.push(m.userId.toString());
    if (isAdmin) adminUserIds.push(m.userId.toString());
  }

  const chain = [];

  if (amount >= 1000 && amount <= 10000) {
    const managerId = approverUserIds[0] || adminUserIds[0];
    if (managerId) chain.push({ approverId: managerId, role: 'manager', status: 'pending' });
  } else if (amount > 10000) {
    const managerId = approverUserIds[0];
    if (managerId) chain.push({ approverId: managerId, role: 'manager', status: 'pending' });
    const adminId = adminUserIds[0];
    if (adminId && adminId !== managerId) {
      chain.push({ approverId: adminId, role: 'tenant_admin', status: 'pending' });
    }
  }

  return chain;
}

export async function checkBudgetAlert(costCenterId, tenantId, amount) {
  if (!costCenterId) return;

  const now = new Date();
  const budget = await Budget.findOne({
    tenantId,
    costCenterId,
    year: now.getFullYear(),
  }).lean();

  if (!budget) return;

  const newSpent = budget.spent + amount;
  const pct = (newSpent / budget.cap) * 100;

  if (pct >= 100) {
    logger.warn({ costCenterId: costCenterId.toString(), pct: pct.toFixed(1) }, 'Budget 100% utilized');
    await auditLog({
      actorId: 'system',
      tenantId: tenantId.toString(),
      action: 'budget.alert',
      target: { type: 'Budget', id: budget._id.toString() },
      after: { spent: newSpent, cap: budget.cap, pct },
    });
  } else if (pct >= 80) {
    logger.warn({ costCenterId: costCenterId.toString(), pct: pct.toFixed(1) }, 'Budget 80% utilized');
    await auditLog({
      actorId: 'system',
      tenantId: tenantId.toString(),
      action: 'budget.alert',
      target: { type: 'Budget', id: budget._id.toString() },
      after: { spent: newSpent, cap: budget.cap, pct },
    });

    const memberships = await TenantMembership.find({ tenantId, status: 'active' }).lean();
    const allRoleIds = memberships.flatMap((m) => m.roleIds.map((id) => id.toString()));
    const adminRoles = await Role.find({ _id: { $in: allRoleIds }, tenantId, permissions: 'tenant:admin' }).lean();
    const adminRoleIds = new Set(adminRoles.map((r) => r._id.toString()));
    const adminUserIds = memberships
      .filter((m) => m.roleIds.some((id) => adminRoleIds.has(id.toString())))
      .map((m) => m.userId.toString());

    if (adminUserIds.length) {
      const adminUsers = await User.find({ _id: { $in: adminUserIds } }).lean();
      const category = budget.category || costCenterId.toString();
      for (const u of adminUsers) {
        if (u.email) {
          sendBudgetAlert(u.email, category, pct, budget.cap).catch(() => {});
        }
      }
    }
  }
}

export async function advanceApproval(expenseId, approverId, decision, comment) {
  const expense = await ExpenseEntry.findById(expenseId);
  if (!expense) throw new Error('Expense not found');

  const step = expense.approvalChain[expense.currentApproverIndex];
  if (!step) throw new Error('No pending approver step');

  step.status = decision;
  step.actedAt = new Date();
  if (comment) step.comment = comment;

  if (decision === 'rejected') {
    expense.status = 'rejected';
  } else {
    const nextIndex = expense.currentApproverIndex + 1;
    if (nextIndex >= expense.approvalChain.length) {
      expense.status = 'approved';

      if (expense.costCenterId) {
        await Budget.findOneAndUpdate(
          { tenantId: expense.tenantId, costCenterId: expense.costCenterId, year: new Date().getFullYear() },
          { $inc: { spent: expense.amount } }
        );
      }
    } else {
      expense.currentApproverIndex = nextIndex;
    }
  }

  await expense.save();
  return expense;
}
