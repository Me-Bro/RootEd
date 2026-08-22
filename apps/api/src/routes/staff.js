import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { Queue } from 'bullmq';
import {
  createStaffMemberSchema,
  patchStaffMemberSchema,
  staffCsvRowSchema,
  createLeaveRequestSchema,
  rejectLeaveRequestSchema,
  createLeaveTypeSchema,
  patchLeaveTypeSchema,
  createSalaryStructureSchema,
  updateSalaryStructureSchema,
  generateSalarySlipSchema,
  generateBulkSalarySlipSchema,
  markSalarySlipPaidSchema,
  payrollExportQuerySchema,
} from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { StaffMember } from '../models/StaffMember.js';
import { LeaveType } from '../models/LeaveType.js';
import { LeaveBalance } from '../models/LeaveBalance.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { SalarySlip } from '../models/SalarySlip.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Timetable } from '../models/Timetable.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { Role } from '../models/Role.js';
import { encryptField, decryptField } from '../utils/fieldEncryption.js';
import { uploadBuffer, getSignedUrl } from '../services/storage.service.js';
import { auditLog } from '../services/audit.service.js';
import { redis } from '../config/redis.js';
import {
  provisionStaffUser,
  assertStaffMemberNotLinked,
  setStaffAccessStatus,
  seedLeaveBalancesForStaff,
} from '../services/staffOnboarding.service.js';
import { isValidStaffStatusTransition } from '../services/staffStatusTransitions.js';
import {
  canFileLeaveForStaff,
  hasOverlappingLeaveRequest,
  isCurrentApprover,
} from '../services/leaveRequestRules.js';
import {
  encryptComponents,
  decryptStructure,
  decryptSlip,
  decryptSlipTotals,
  loadStaffAndStructure,
  SalarySlipInputError,
} from '../services/salary.service.js';
import { isValidSalarySlipStatusTransition } from '../services/salarySlipStatusTransitions.js';
import { findMatchingSalaryJob } from '../utils/salarySlipJobs.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const salarySlipQueue = new Queue('salary-slip', { connection: redis });

router.use(authenticate);

function hasPermission(req, perm) {
  if (req.user?.systemRole === 'super_admin') return true;
  return req._resolvedPermissions?.includes(perm) ?? false;
}

async function resolveAndCachePermissions(req, _res, next) {
  try {
    if (req.user?.systemRole === 'super_admin') {
      req._resolvedPermissions = [];
      return next();
    }
    const { TenantMembership: TM } = await import('../models/TenantMembership.js');
    const { Role: R } = await import('../models/Role.js');
    const { redis } = await import('../config/redis.js');
    const tenantId = req.tenant._id.toString();
    const userId = req.user.sub;
    const cacheKey = `perms:${tenantId}:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      req._resolvedPermissions = JSON.parse(cached);
      return next();
    }
    const membership = await TM.findOne({ userId, tenantId, status: 'active' }).lean();
    if (!membership) {
      req._resolvedPermissions = [];
      return next();
    }
    const roles = await R.find({ _id: { $in: membership.roleIds }, tenantId }).lean();
    const permissions = [...new Set(roles.flatMap((r) => r.permissions))];
    await redis.setex(cacheKey, 60, JSON.stringify(permissions));
    req._resolvedPermissions = permissions;
    next();
  } catch (err) {
    next(err);
  }
}

router.use(resolveAndCachePermissions);

function calcTotalDays(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const diff = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

async function buildLeaveApprovalChain(staff, tenantId) {
  const chain = [];

  if (staff.reportingManagerId) {
    chain.push({ approverId: staff.reportingManagerId, status: 'pending' });
  }

  const memberships = await TenantMembership.find({ tenantId, status: 'active' }).lean();
  const roleIds = memberships.flatMap((m) => m.roleIds.map((id) => id.toString()));
  const adminRoles = await Role.find({
    _id: { $in: roleIds },
    tenantId,
    permissions: 'tenant:admin',
  }).lean();
  const adminRoleIds = new Set(adminRoles.map((r) => r._id.toString()));

  const adminUserIds = new Set();
  for (const m of memberships) {
    if (m.roleIds.some((id) => adminRoleIds.has(id.toString()))) {
      adminUserIds.add(m.userId.toString());
    }
  }

  const existingApproverIds = new Set(chain.map((c) => c.approverId?.toString()));
  for (const uid of adminUserIds) {
    if (!existingApproverIds.has(uid)) {
      chain.push({ approverId: uid, status: 'pending' });
    }
  }

  return chain;
}

// ── Staff Members ─────────────────────────────────────────────────────────────

router.post(
  '/members',
  requirePermission('staff:write'),
  validate(createStaffMemberSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { email, ...body } = req.body;

      const userId = await provisionStaffUser({ tenantId, email });
      await assertStaffMemberNotLinked(tenantId, userId);

      if (body.governmentId) body.governmentId = encryptField(body.governmentId, tenantId);
      if (body.bankAccount) body.bankAccount = encryptField(body.bankAccount, tenantId);

      const staff = await StaffMember.create({ tenantId, userId, ...body });
      await seedLeaveBalancesForStaff(tenantId, staff._id, new Date().getFullYear());
      const result = staff.toObject();
      delete result.governmentId;
      delete result.bankAccount;

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'staff.created',
        target: { model: 'StaffMember', id: staff._id.toString() },
        after: { ...body, email },
        ip: req.ip,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/members', requirePermission('staff:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const filter = { tenantId };
    if (req.query.department) filter.department = req.query.department;
    if (req.query.status) filter.employmentStatus = req.query.status;
    if (req.query.search) {
      const re = new RegExp(req.query.search, 'i');
      filter.$or = [{ firstName: re }, { lastName: re }, { employeeId: re }];
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);

    const [members, total] = await Promise.all([
      StaffMember.find(filter)
        .select('-governmentId -bankAccount')
        .sort({ lastName: 1, firstName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StaffMember.countDocuments(filter),
    ]);

    res.json({ members, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// No staff:read requirement — any tenant member may look up their own linked
// staff record (needed to self-file leave without staff-directory access).
router.get('/members/me', async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const staff = await StaffMember.findOne({ tenantId, userId: req.user.sub })
      .select('-governmentId -bankAccount')
      .lean();
    if (!staff) return res.status(404).json({ error: 'No staff record linked to this account' });
    res.json(staff);
  } catch (err) {
    next(err);
  }
});

router.get('/members/:id', requirePermission('staff:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const staff = await StaffMember.findOne({ _id: req.params.id, tenantId }).lean();
    if (!staff) return res.status(404).json({ error: 'Not found' });

    if (hasPermission(req, 'staff:write')) {
      if (staff.governmentId) staff.governmentId = decryptField(staff.governmentId, tenantId);
      if (staff.bankAccount) staff.bankAccount = decryptField(staff.bankAccount, tenantId);
    } else {
      delete staff.governmentId;
      delete staff.bankAccount;
    }

    res.json(staff);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/members/:id',
  requirePermission('staff:write'),
  validate(patchStaffMemberSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const updates = { ...req.body };

      const existing = await StaffMember.findOne({ _id: req.params.id, tenantId });
      if (!existing) return res.status(404).json({ error: 'Not found' });

      if (updates.employmentStatus && updates.employmentStatus !== existing.employmentStatus) {
        if (!isValidStaffStatusTransition(existing.employmentStatus, updates.employmentStatus)) {
          return res.status(400).json({
            error: `Cannot move staff from ${existing.employmentStatus} to ${updates.employmentStatus}`,
          });
        }
      }

      const before = {
        firstName: existing.firstName,
        lastName: existing.lastName,
        designation: existing.designation,
        department: existing.department,
        employmentStatus: existing.employmentStatus,
      };

      if (updates.governmentId) updates.governmentId = encryptField(updates.governmentId, tenantId);
      if (updates.bankAccount) updates.bankAccount = encryptField(updates.bankAccount, tenantId);

      const staff = await StaffMember.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { $set: updates },
        { new: true }
      ).select('-governmentId -bankAccount');

      if (updates.employmentStatus === 'resigned' || updates.employmentStatus === 'terminated') {
        await setStaffAccessStatus(tenantId, existing.userId, 'suspended');
      } else if (updates.employmentStatus === 'active') {
        await setStaffAccessStatus(tenantId, existing.userId, 'active');
      }

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'staff.updated',
        target: { model: 'StaffMember', id: staff._id.toString() },
        before,
        after: {
          firstName: updates.firstName ?? before.firstName,
          lastName: updates.lastName ?? before.lastName,
          designation: updates.designation ?? before.designation,
          department: updates.department ?? before.department,
          employmentStatus: updates.employmentStatus ?? before.employmentStatus,
        },
        ip: req.ip,
      });

      res.json(staff);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/members/:id/documents',
  requirePermission('staff:write'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('No file uploaded', 400);
      const tenantId = req.tenant._id;
      const staff = await StaffMember.findOne({ _id: req.params.id, tenantId });
      if (!staff) return res.status(404).json({ error: 'Not found' });

      const key = `staff/${tenantId}/${staff._id}/docs/${Date.now()}-${req.file.originalname}`;
      await uploadBuffer(key, req.file.buffer, req.file.mimetype);

      staff.documents.push({
        name: req.body.name || req.file.originalname,
        key,
        uploadedAt: new Date(),
      });
      await staff.save();

      res.json({ document: staff.documents[staff.documents.length - 1] });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/members/:id/documents/:index/download',
  requirePermission('staff:read'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const staff = await StaffMember.findOne({ _id: req.params.id, tenantId }).lean();
      if (!staff) return res.status(404).json({ error: 'Not found' });

      const doc = staff.documents?.[Number(req.params.index)];
      if (!doc?.key) return res.status(404).json({ error: 'Document not found' });

      const url = await getSignedUrl(doc.key, 3600);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/members/import',
  requirePermission('staff:write'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const records = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const tenantId = req.tenant._id;
      let created = 0;
      let skipped = 0;
      const errors = [];

      for (const row of records) {
        try {
          const parsedRow = staffCsvRowSchema.parse(row);
          const {
            email,
            employeeId,
            designation,
            department,
            joiningDate,
            phone,
            firstName,
            lastName,
          } = parsedRow;

          const userId = await provisionStaffUser({ tenantId, email });
          const existing = await StaffMember.findOne({ tenantId, userId }).lean();
          if (existing) {
            skipped++;
            continue;
          }

          await StaffMember.create({
            tenantId,
            userId,
            firstName,
            lastName,
            employeeId: employeeId || undefined,
            designation: designation || undefined,
            department: department || undefined,
            joiningDate: joiningDate ? new Date(joiningDate) : undefined,
            phone: phone || undefined,
          });
          created++;
        } catch (rowErr) {
          errors.push({ row, reason: rowErr.message });
        }
      }

      res.json({ created, skipped, errors });
    } catch (err) {
      next(err);
    }
  }
);

// ── Leave Types ───────────────────────────────────────────────────────────────

router.get('/leave-types', requirePermission('leave:read'), async (req, res, next) => {
  try {
    const types = await LeaveType.find({ tenantId: req.tenant._id }).lean();
    res.json(types);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/leave-types',
  requirePermission('tenant:admin'),
  validate(createLeaveTypeSchema),
  async (req, res, next) => {
    try {
      const { name, maxDaysPerYear, isPaid, requiresApproval } = req.body;
      const lt = await LeaveType.create({
        tenantId: req.tenant._id,
        name,
        maxDaysPerYear,
        isPaid,
        requiresApproval,
      });
      res.status(201).json(lt);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/leave-types/:id',
  requirePermission('tenant:admin'),
  validate(patchLeaveTypeSchema),
  async (req, res, next) => {
    try {
      const lt = await LeaveType.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenant._id },
        { $set: req.body },
        { new: true }
      );
      if (!lt) return res.status(404).json({ error: 'Not found' });
      res.json(lt);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/leave-balances', requirePermission('leave:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.staffId) filter.staffId = req.query.staffId;
    filter.year = req.query.year ? Number(req.query.year) : new Date().getFullYear();

    const balances = await LeaveBalance.find(filter).populate('leaveTypeId', 'name').lean();
    res.json(balances);
  } catch (err) {
    next(err);
  }
});

// ── Leave Requests ────────────────────────────────────────────────────────────

router.post(
  '/leave-requests',
  requirePermission('leave:write'),
  validate(createLeaveRequestSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { staffId, leaveTypeId, fromDate, toDate, reason } = req.body;

      if (req.user?.systemRole !== 'super_admin') {
        const actorStaff = await StaffMember.findOne({ tenantId, userId: req.user.sub }).lean();
        const allowed = canFileLeaveForStaff({
          staffId,
          actorStaffId: actorStaff?._id,
          actorPermissions: req._resolvedPermissions ?? [],
        });
        if (!allowed) {
          return res
            .status(403)
            .json({ error: 'Cannot file leave on behalf of this staff member' });
        }
      }

      const totalDays = calcTotalDays(fromDate, toDate);

      const year = new Date(fromDate).getFullYear();
      const balance = await LeaveBalance.findOne({ tenantId, staffId, leaveTypeId, year });
      if (balance) {
        const remaining = balance.total - balance.used;
        if (totalDays > remaining) {
          return res
            .status(400)
            .json({ error: `Insufficient leave balance. Available: ${remaining} days` });
        }
      }

      const staff = await StaffMember.findOne({ _id: staffId, tenantId }).lean();
      if (!staff) return res.status(404).json({ error: 'Staff not found' });

      const existingRequests = await LeaveRequest.find({
        tenantId,
        staffId,
        status: { $in: ['pending', 'approved'] },
      })
        .select('fromDate toDate status')
        .lean();
      if (hasOverlappingLeaveRequest(existingRequests, new Date(fromDate), new Date(toDate))) {
        return res.status(409).json({
          error: 'Staff member already has a pending or approved leave request in this date range',
        });
      }

      const approvalChain = await buildLeaveApprovalChain(staff, tenantId);

      const from = new Date(fromDate);
      const to = new Date(toDate);
      const conflictFlags = [];

      const timetableEntries = await Timetable.find({ tenantId, teacherId: staff.userId }).lean();
      for (const entry of timetableEntries) {
        let current = new Date(from);
        while (current <= to) {
          if (current.getDay() === entry.dayOfWeek) {
            const dateStr = current.toISOString().split('T')[0];
            conflictFlags.push(`has_classes_on_${dateStr}`);
          }
          current.setDate(current.getDate() + 1);
        }
      }

      const uniqueFlags = [...new Set(conflictFlags)];

      const leaveReq = await LeaveRequest.create({
        tenantId,
        staffId,
        leaveTypeId,
        fromDate: from,
        toDate: to,
        totalDays,
        reason,
        approvalChain,
        conflictFlags: uniqueFlags,
      });

      res.status(201).json(leaveReq);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/leave-requests', requirePermission('leave:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.staffId) filter.staffId = req.query.staffId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.fromDate = {};
      if (req.query.from) filter.fromDate.$gte = new Date(req.query.from);
      if (req.query.to) filter.fromDate.$lte = new Date(req.query.to);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);

    const [requests, total] = await Promise.all([
      LeaveRequest.find(filter)
        .populate('staffId', 'firstName lastName employeeId')
        .populate('leaveTypeId', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LeaveRequest.countDocuments(filter),
    ]);

    res.json({ requests, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/leave-requests/:id/approve',
  requirePermission('leave:approve'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const lr = await LeaveRequest.findOne({ _id: req.params.id, tenantId });
      if (!lr) return res.status(404).json({ error: 'Not found' });
      if (lr.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });
      if (req.user?.systemRole !== 'super_admin' && !isCurrentApprover(lr, req.user.sub)) {
        return res.status(403).json({ error: 'You are not the current approver for this request' });
      }

      const step = lr.approvalChain[lr.currentApproverIndex];
      if (!step) return res.status(400).json({ error: 'No pending approver step' });

      step.status = 'approved';
      step.actedAt = new Date();

      const nextIndex = lr.currentApproverIndex + 1;
      if (nextIndex >= lr.approvalChain.length) {
        lr.status = 'approved';

        const year = lr.fromDate.getFullYear();
        await LeaveBalance.findOneAndUpdate(
          { tenantId, staffId: lr.staffId, leaveTypeId: lr.leaveTypeId, year },
          { $inc: { used: lr.totalDays } }
        );
      } else {
        lr.currentApproverIndex = nextIndex;
      }

      await lr.save();

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'leave.approved',
        target: { type: 'LeaveRequest', id: lr._id.toString() },
        ip: req.ip,
      });

      res.json(lr);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/leave-requests/:id/reject',
  requirePermission('leave:approve'),
  validate(rejectLeaveRequestSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { comment } = req.body;
      const lr = await LeaveRequest.findOne({ _id: req.params.id, tenantId });
      if (!lr) return res.status(404).json({ error: 'Not found' });
      if (lr.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });
      if (req.user?.systemRole !== 'super_admin' && !isCurrentApprover(lr, req.user.sub)) {
        return res.status(403).json({ error: 'You are not the current approver for this request' });
      }

      const step = lr.approvalChain[lr.currentApproverIndex];
      if (step) {
        step.status = 'rejected';
        step.actedAt = new Date();
        step.comment = comment;
      }
      lr.status = 'rejected';
      await lr.save();

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'leave.rejected',
        target: { type: 'LeaveRequest', id: lr._id.toString() },
        ip: req.ip,
      });

      res.json(lr);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/leave-requests/:id/cancel',
  requirePermission('leave:write'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const lr = await LeaveRequest.findOne({ _id: req.params.id, tenantId });
      if (!lr) return res.status(404).json({ error: 'Not found' });
      if (lr.status !== 'pending')
        return res.status(400).json({ error: 'Only pending requests can be cancelled' });

      if (req.user?.systemRole !== 'super_admin') {
        const actorStaff = await StaffMember.findOne({ tenantId, userId: req.user.sub }).lean();
        const allowed = canFileLeaveForStaff({
          staffId: lr.staffId,
          actorStaffId: actorStaff?._id,
          actorPermissions: req._resolvedPermissions ?? [],
        });
        if (!allowed) {
          return res.status(403).json({ error: 'Cannot cancel this leave request' });
        }
      }

      lr.status = 'cancelled';
      await lr.save();

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'leave.cancelled',
        target: { type: 'LeaveRequest', id: lr._id.toString() },
        ip: req.ip,
      });

      res.json(lr);
    } catch (err) {
      next(err);
    }
  }
);

// ── Salary Structures ─────────────────────────────────────────────────────────

router.post(
  '/salary-structures',
  requirePermission('tenant:admin'),
  validate(createSalaryStructureSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { name, components } = req.body;
      const ss = await SalaryStructure.create({
        tenantId,
        name,
        components: encryptComponents(components, tenantId),
      });

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'salaryStructure.create',
        target: { model: 'SalaryStructure', id: ss._id },
        after: ss.toObject(),
        ip: req.ip,
      });

      res.status(201).json(decryptStructure(ss.toObject(), tenantId));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/salary-structures', requirePermission('payroll:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const structures = await SalaryStructure.find({ tenantId }).lean();

    // tenantScopePlugin doesn't hook `aggregate`, so tenantId is explicit here.
    const counts = await StaffMember.aggregate([
      { $match: { tenantId, salaryStructureId: { $ne: null } } },
      { $group: { _id: '$salaryStructureId', count: { $sum: 1 } } },
    ]);
    const countByStructureId = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json(
      structures.map((s) => ({
        ...decryptStructure(s, tenantId),
        staffCount: countByStructureId.get(String(s._id)) ?? 0,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/salary-structures/:id',
  requirePermission('tenant:admin'),
  validate(updateSalaryStructureSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await SalaryStructure.findOne({ _id: req.params.id, tenantId }).lean();
      if (!before) return res.status(404).json({ error: 'Salary structure not found' });

      const update = { ...req.body };
      if (update.components) update.components = encryptComponents(update.components, tenantId);

      const structure = await SalaryStructure.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { $set: update },
        { new: true }
      );

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'salaryStructure.update',
        target: { model: 'SalaryStructure', id: structure._id },
        before,
        after: structure.toObject(),
        ip: req.ip,
      });

      res.json(decryptStructure(structure.toObject(), tenantId));
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/salary-structures/:id',
  requirePermission('tenant:admin'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const structure = await SalaryStructure.findOne({ _id: req.params.id, tenantId }).lean();
      if (!structure) return res.status(404).json({ error: 'Salary structure not found' });

      const staffCount = await StaffMember.countDocuments({
        tenantId,
        salaryStructureId: structure._id,
      });
      if (staffCount > 0) {
        return res.status(409).json({
          error: `Cannot delete: ${staffCount} staff member(s) are assigned to this salary structure`,
        });
      }

      await SalaryStructure.deleteOne({ _id: structure._id, tenantId });

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'salaryStructure.delete',
        target: { model: 'SalaryStructure', id: structure._id },
        before: structure,
        ip: req.ip,
      });

      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  }
);

// ── Salary Slips ──────────────────────────────────────────────────────────────
// PDF generation runs asynchronously via workers/salarySlip.worker.js — see
// that file for resolveComponents/PDF-rendering logic (moved out of this route).

router.post(
  '/salary-slips/generate',
  requirePermission('payroll:write'),
  validate(generateSalarySlipSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { staffId, month, year } = req.body;

      await loadStaffAndStructure(tenantId, staffId);

      const pendingJobs = await salarySlipQueue.getJobs(['waiting', 'active'], 0, 50);
      const existing = findMatchingSalaryJob(pendingJobs, {
        tenantId: tenantId.toString(),
        month,
        year,
        staffId,
      });
      if (existing) {
        return res.json({ jobId: existing.id, existing: true });
      }

      // Upsert to 'queued' first — this is the real concurrency guard (the
      // unique {tenantId,staffId,month,year} index makes it atomic), the
      // in-flight-job check above is only a best-effort optimization.
      const slip = await SalarySlip.findOneAndUpdate(
        { tenantId, staffId, month, year },
        { $set: { status: 'queued', error: null } },
        { upsert: true, new: true }
      );

      const job = await salarySlipQueue.add('generate', {
        tenantId: tenantId.toString(),
        month,
        year,
        staffIds: [staffId],
        requestedBy: req.user.sub,
      });

      slip.jobId = job.id;
      await slip.save();

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'salarySlip.generate',
        target: { model: 'SalarySlip', id: slip._id },
        after: { staffId, month, year, jobId: job.id },
        ip: req.ip,
      });

      res.status(202).json({ jobId: job.id, slipId: slip._id, existing: false });
    } catch (err) {
      if (err instanceof SalarySlipInputError) {
        return res
          .status(err.message.includes('not found') ? 404 : 400)
          .json({ error: err.message });
      }
      next(err);
    }
  }
);

router.post(
  '/salary-slips/generate-all',
  requirePermission('payroll:write'),
  validate(generateBulkSalarySlipSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { month, year, staffIds: requestedStaffIds } = req.body;

      let staffIds = requestedStaffIds;
      if (!staffIds?.length) {
        const members = await StaffMember.find({
          tenantId,
          employmentStatus: 'active',
          salaryStructureId: { $ne: null },
        })
          .select('_id')
          .lean();
        staffIds = members.map((m) => m._id.toString());
      }

      if (staffIds.length === 0) {
        return res.status(400).json({ error: 'No staff with a salary structure assigned' });
      }

      await SalarySlip.bulkWrite(
        staffIds.map((staffId) => ({
          updateOne: {
            filter: { tenantId, staffId, month, year },
            update: { $set: { status: 'queued', error: null } },
            upsert: true,
          },
        }))
      );

      const job = await salarySlipQueue.add('generate', {
        tenantId: tenantId.toString(),
        month,
        year,
        staffIds,
        requestedBy: req.user.sub,
      });

      await SalarySlip.updateMany(
        { tenantId, staffId: { $in: staffIds }, month, year },
        { $set: { jobId: job.id } }
      );

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'salarySlip.generateAll',
        target: { model: 'SalarySlip', id: null },
        after: { month, year, staffCount: staffIds.length, jobId: job.id },
        ip: req.ip,
      });

      res.status(202).json({ jobId: job.id, staffCount: staffIds.length });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/salary-slips/status/:jobId',
  requirePermission('payroll:read'),
  async (req, res, next) => {
    try {
      const job = await salarySlipQueue.getJob(req.params.jobId);
      if (!job || job.data?.tenantId !== req.tenant._id.toString()) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const state = await job.getState();
      const result = job.returnvalue;
      // job.progress is BullMQ's built-in per-job progress field — the worker calls
      // job.updateProgress({ completed, total }) once per staff member; defaults to
      // the number 0 until the worker's first update lands, so only surface it once
      // it's actually the { completed, total } shape the mobile progress bar expects.
      const progress = job.progress && typeof job.progress === 'object' ? job.progress : null;

      res.json({ jobId: job.id, state, result, progress });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/salary-slips', requirePermission('payroll:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const filter = { tenantId };
    if (req.query.staffId) filter.staffId = req.query.staffId;
    if (req.query.month) filter.month = Number(req.query.month);
    if (req.query.year) filter.year = Number(req.query.year);

    const slips = await SalarySlip.find(filter)
      .populate('staffId', 'firstName lastName employeeId')
      .sort({ year: -1, month: -1 })
      .lean();

    res.json(slips.map((s) => decryptSlip(s, tenantId)));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/salary-slips/:id/mark-paid',
  requirePermission('payroll:write'),
  validate(markSalarySlipPaidSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const slip = await SalarySlip.findOne({ _id: req.params.id, tenantId });
      if (!slip) return res.status(404).json({ error: 'Not found' });

      if (!isValidSalarySlipStatusTransition(slip.status, 'paid')) {
        return res
          .status(400)
          .json({ error: `Cannot mark slip as paid from status "${slip.status}"` });
      }

      const before = slip.toObject();
      slip.status = 'paid';
      slip.paidOn = req.body.paidOn ?? new Date();
      slip.paidBy = req.user.sub;
      await slip.save();

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'salarySlip.markPaid',
        target: { model: 'SalarySlip', id: slip._id },
        before,
        after: slip.toObject(),
        ip: req.ip,
      });

      res.json(decryptSlip(slip.toObject(), tenantId));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/salary-slips/:id/download',
  requirePermission('payroll:read'),
  async (req, res, next) => {
    try {
      const slip = await SalarySlip.findOne({
        _id: req.params.id,
        tenantId: req.tenant._id,
      }).lean();
      if (!slip) return res.status(404).json({ error: 'Not found' });
      if (!slip.pdfKey) return res.status(404).json({ error: 'PDF not generated' });

      const url = await getSignedUrl(slip.pdfKey, 3600);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }
);

// ── Staff Attendance ──────────────────────────────────────────────────────────

router.post('/attendance', requirePermission('attendance:write'), async (req, res, next) => {
  try {
    const { date, records } = req.body;
    const tenantId = req.tenant._id;
    const markedBy = req.user.sub;

    const ops = records.map(({ entityId, status, note }) => ({
      updateOne: {
        filter: { tenantId, date: new Date(date), entityType: 'staff', entityId },
        update: {
          $set: {
            tenantId,
            date: new Date(date),
            entityType: 'staff',
            entityId,
            status,
            markedBy,
            note,
          },
        },
        upsert: true,
      },
    }));

    await AttendanceRecord.bulkWrite(ops);
    res.json({ saved: ops.length });
  } catch (err) {
    next(err);
  }
});

router.get('/attendance', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id, entityType: 'staff' };
    if (req.query.staffId) filter.entityId = req.query.staffId;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }

    const records = await AttendanceRecord.find(filter).sort({ date: -1 }).lean();
    res.json(records);
  } catch (err) {
    next(err);
  }
});

// ── Payroll Export ────────────────────────────────────────────────────────────

router.get('/export/payroll', requirePermission('payroll:write'), async (req, res, next) => {
  try {
    const { month, year } = payrollExportQuerySchema.parse(req.query);
    const tenantId = req.tenant._id;

    const slips = await SalarySlip.find({ tenantId, month, year })
      .populate('staffId', 'firstName lastName employeeId')
      .lean();

    const lines = ['Name,Employee ID,Net Pay'];
    for (const slip of slips) {
      const name = slip.staffId ? `${slip.staffId.firstName} ${slip.staffId.lastName}` : 'Unknown';
      const empId = slip.staffId?.employeeId ?? '';
      const { netPay } = decryptSlipTotals(slip, tenantId);
      lines.push(`"${name}","${empId}",${netPay.toFixed(2)}`);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll-${month}-${year}.csv`);
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

export default router;
