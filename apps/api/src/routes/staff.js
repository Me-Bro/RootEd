import { Router } from 'express';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
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

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

function hasPermission(req, perm) {
  if (req.user?.systemRole === 'super_admin') return true;
  return req._resolvedPermissions?.includes(perm) ?? false;
}

async function resolveAndCachePermissions(req, _res, next) {
  try {
    if (req.user?.systemRole === 'super_admin') { req._resolvedPermissions = []; return next(); }
    const { TenantMembership: TM } = await import('../models/TenantMembership.js');
    const { Role: R } = await import('../models/Role.js');
    const { redis } = await import('../config/redis.js');
    const tenantId = req.tenant._id.toString();
    const userId = req.user.sub;
    const cacheKey = `perms:${tenantId}:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) { req._resolvedPermissions = JSON.parse(cached); return next(); }
    const membership = await TM.findOne({ userId, tenantId, status: 'active' }).lean();
    if (!membership) { req._resolvedPermissions = []; return next(); }
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

router.post('/members', requirePermission('staff:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const body = { ...req.body };

    if (body.governmentId) body.governmentId = encryptField(body.governmentId, tenantId);
    if (body.bankAccount) body.bankAccount = encryptField(body.bankAccount, tenantId);

    const staff = await StaffMember.create({ tenantId, ...body });
    const result = staff.toObject();
    delete result.governmentId;
    delete result.bankAccount;
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

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

    const members = await StaffMember.find(filter)
      .select('-governmentId -bankAccount')
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    res.json(members);
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

router.patch('/members/:id', requirePermission('staff:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const updates = { ...req.body };

    if (updates.governmentId) updates.governmentId = encryptField(updates.governmentId, tenantId);
    if (updates.bankAccount) updates.bankAccount = encryptField(updates.bankAccount, tenantId);

    const staff = await StaffMember.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: updates },
      { new: true }
    ).select('-governmentId -bankAccount');

    if (!staff) return res.status(404).json({ error: 'Not found' });
    res.json(staff);
  } catch (err) {
    next(err);
  }
});

router.post('/members/:id/documents', requirePermission('staff:write'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const tenantId = req.tenant._id;
    const staff = await StaffMember.findOne({ _id: req.params.id, tenantId });
    if (!staff) return res.status(404).json({ error: 'Not found' });

    const key = `staff/${tenantId}/${staff._id}/docs/${Date.now()}-${req.file.originalname}`;
    await uploadBuffer(key, req.file.buffer, req.file.mimetype);

    staff.documents.push({ name: req.body.name || req.file.originalname, key, uploadedAt: new Date() });
    await staff.save();

    res.json({ document: staff.documents[staff.documents.length - 1] });
  } catch (err) {
    next(err);
  }
});

// ── Leave Types ───────────────────────────────────────────────────────────────

router.get('/leave-types', async (req, res, next) => {
  try {
    const types = await LeaveType.find({ tenantId: req.tenant._id }).lean();
    res.json(types);
  } catch (err) {
    next(err);
  }
});

router.post('/leave-types', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, maxDaysPerYear, isPaid, requiresApproval } = req.body;
    const lt = await LeaveType.create({ tenantId: req.tenant._id, name, maxDaysPerYear, isPaid, requiresApproval });
    res.status(201).json(lt);
  } catch (err) {
    next(err);
  }
});

router.patch('/leave-types/:id', requirePermission('tenant:admin'), async (req, res, next) => {
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
});

// ── Leave Requests ────────────────────────────────────────────────────────────

router.post('/leave-requests', requirePermission('leave:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const { staffId, leaveTypeId, fromDate, toDate, reason } = req.body;

    const totalDays = calcTotalDays(fromDate, toDate);

    const year = new Date(fromDate).getFullYear();
    const balance = await LeaveBalance.findOne({ tenantId, staffId, leaveTypeId, year });
    if (balance) {
      const remaining = balance.total - balance.used;
      if (totalDays > remaining) {
        return res.status(400).json({ error: `Insufficient leave balance. Available: ${remaining} days` });
      }
    }

    const staff = await StaffMember.findOne({ _id: staffId, tenantId }).lean();
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

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
});

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

    const requests = await LeaveRequest.find(filter)
      .populate('staffId', 'firstName lastName employeeId')
      .populate('leaveTypeId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json(requests);
  } catch (err) {
    next(err);
  }
});

router.patch('/leave-requests/:id/approve', requirePermission('leave:approve'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const lr = await LeaveRequest.findOne({ _id: req.params.id, tenantId });
    if (!lr) return res.status(404).json({ error: 'Not found' });
    if (lr.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

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
});

router.patch('/leave-requests/:id/reject', requirePermission('leave:approve'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const { comment } = req.body;
    const lr = await LeaveRequest.findOne({ _id: req.params.id, tenantId });
    if (!lr) return res.status(404).json({ error: 'Not found' });
    if (lr.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

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
});

// ── Salary Structures ─────────────────────────────────────────────────────────

router.post('/salary-structures', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, components } = req.body;
    const ss = await SalaryStructure.create({ tenantId: req.tenant._id, name, components });
    res.status(201).json(ss);
  } catch (err) {
    next(err);
  }
});

router.get('/salary-structures', async (req, res, next) => {
  try {
    const structures = await SalaryStructure.find({ tenantId: req.tenant._id }).lean();
    res.json(structures);
  } catch (err) {
    next(err);
  }
});

// ── Salary Slips ──────────────────────────────────────────────────────────────

function resolveComponents(components) {
  const resolved = [];
  const labelMap = {};

  for (const comp of components) {
    if (!comp.isPercentage) {
      labelMap[comp.label] = comp.amount;
      resolved.push({ label: comp.label, type: comp.type, amount: comp.amount });
    }
  }

  for (const comp of components) {
    if (comp.isPercentage) {
      const base = labelMap[comp.baseRef] ?? 0;
      const amount = parseFloat(((comp.amount / 100) * base).toFixed(2));
      labelMap[comp.label] = amount;
      resolved.push({ label: comp.label, type: comp.type, amount });
    }
  }

  return resolved;
}

async function generateSalaryPdf(staff, slip, month, year) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Salary Slip', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`${staff.firstName} ${staff.lastName}`);
    if (staff.employeeId) doc.text(`Employee ID: ${staff.employeeId}`);
    if (staff.designation) doc.text(`Designation: ${staff.designation}`);
    if (staff.department) doc.text(`Department: ${staff.department}`);
    doc.text(`Period: ${monthName} ${year}`);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).text('Component', 50, tableTop, { width: 250 });
    doc.text('Type', 310, tableTop, { width: 100 });
    doc.text('Amount', 420, tableTop, { width: 100 });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.5);

    for (const comp of slip.components) {
      const y = doc.y;
      doc.text(comp.label, 50, y, { width: 250 });
      doc.text(comp.type, 310, y, { width: 100 });
      doc.text(comp.amount.toFixed(2), 420, y, { width: 100 });
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Gross Earnings: ${slip.grossEarnings.toFixed(2)}`, { align: 'right' });
    doc.text(`Total Deductions: ${slip.totalDeductions.toFixed(2)}`, { align: 'right' });
    doc.fontSize(13).text(`Net Pay: ${slip.netPay.toFixed(2)}`, { align: 'right' });

    doc.end();
  });
}

router.post('/salary-slips/generate', requirePermission('payroll:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const { staffId, month, year } = req.body;

    const staff = await StaffMember.findOne({ _id: staffId, tenantId }).lean();
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    if (!staff.salaryStructureId) return res.status(400).json({ error: 'Staff has no salary structure assigned' });

    const structure = await SalaryStructure.findOne({ _id: staff.salaryStructureId, tenantId }).lean();
    if (!structure) return res.status(404).json({ error: 'Salary structure not found' });

    const resolvedComponents = resolveComponents(structure.components);

    const grossEarnings = resolvedComponents
      .filter((c) => c.type === 'earning')
      .reduce((sum, c) => sum + c.amount, 0);
    const totalDeductions = resolvedComponents
      .filter((c) => c.type === 'deduction')
      .reduce((sum, c) => sum + c.amount, 0);
    const netPay = grossEarnings - totalDeductions;

    const slipData = {
      tenantId,
      staffId,
      month,
      year,
      components: resolvedComponents,
      grossEarnings,
      totalDeductions,
      netPay,
      status: 'generated',
    };

    const pdfBuffer = await generateSalaryPdf(staff, slipData, month, year);
    const pdfKey = `salary-slips/${tenantId}/${staffId}/${year}-${month}.pdf`;
    await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
    slipData.pdfKey = pdfKey;

    const slip = await SalarySlip.findOneAndUpdate(
      { tenantId, staffId, month, year },
      { $set: slipData },
      { upsert: true, new: true }
    );

    res.status(201).json(slip);
  } catch (err) {
    next(err);
  }
});

router.get('/salary-slips', requirePermission('payroll:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.staffId) filter.staffId = req.query.staffId;
    if (req.query.month) filter.month = Number(req.query.month);
    if (req.query.year) filter.year = Number(req.query.year);

    const slips = await SalarySlip.find(filter)
      .populate('staffId', 'firstName lastName employeeId')
      .sort({ year: -1, month: -1 })
      .lean();

    res.json(slips);
  } catch (err) {
    next(err);
  }
});

router.get('/salary-slips/:id/download', requirePermission('payroll:read'), async (req, res, next) => {
  try {
    const slip = await SalarySlip.findOne({ _id: req.params.id, tenantId: req.tenant._id }).lean();
    if (!slip) return res.status(404).json({ error: 'Not found' });
    if (!slip.pdfKey) return res.status(404).json({ error: 'PDF not generated' });

    const url = await getSignedUrl(slip.pdfKey, 3600);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

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
    const { month, year } = req.query;
    const tenantId = req.tenant._id;

    const slips = await SalarySlip.find({ tenantId, month: Number(month), year: Number(year) })
      .populate('staffId', 'firstName lastName employeeId')
      .lean();

    const lines = ['Name,Employee ID,Net Pay'];
    for (const slip of slips) {
      const name = slip.staffId ? `${slip.staffId.firstName} ${slip.staffId.lastName}` : 'Unknown';
      const empId = slip.staffId?.employeeId ?? '';
      lines.push(`"${name}","${empId}",${slip.netPay.toFixed(2)}`);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll-${month}-${year}.csv`);
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

export default router;
