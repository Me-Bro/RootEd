import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { AppError } from '../middleware/errorHandler.js';
import { CostCenter } from '../models/CostCenter.js';
import { ExpenseEntry } from '../models/ExpenseEntry.js';
import { Budget } from '../models/Budget.js';
import { StaffMember } from '../models/StaffMember.js';
import {
  buildApprovalChain,
  checkBudgetAlert,
  advanceApproval,
} from '../services/expense.service.js';
import { uploadBuffer } from '../services/storage.service.js';
import { auditLog } from '../services/audit.service.js';
import { validate } from '../middleware/validate.js';
import { decryptField } from '../utils/fieldEncryption.js';
import { scheduleEscalation } from '../workers/expenseEscalation.worker.js';
import { hasSeats } from '@rooted/shared/utils';
import {
  createCentreExpenseSchema,
  financeMonthQuerySchema,
  updateCentreExpenseSchema,
} from '@rooted/shared/schemas';
import { dayKeyInTz } from '../utils/dayKey.js';
import { requireSeatsOrg } from '../middleware/requireSeatsOrg.js';
import { expenseSummary, resolveMonth } from '../services/centreFinance.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

// ── Cost Centers ──────────────────────────────────────────────────────────────

router.post('/cost-centers', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { name, code, budget } = req.body;
    const cc = await CostCenter.create({ tenantId: req.tenant._id, name, code, budget });
    res.status(201).json(cc);
  } catch (err) {
    next(err);
  }
});

router.get('/cost-centers', requirePermission('expense:read'), async (req, res, next) => {
  try {
    const centers = await CostCenter.find({ tenantId: req.tenant._id }).lean();
    res.json(centers);
  } catch (err) {
    next(err);
  }
});

// ── Expense Entries ───────────────────────────────────────────────────────────

// A study center has one owner and no approval chain: an expense is recorded as
// approved straight away, against the fixed category list, on a centre-calendar day
// (`invoiceDate` holds that day as a UTC-midnight Date, like every other day key).
// These handlers sit in front of the school ones and call next('route') for other orgs.
const centreOnly = (req, _res, next) => (hasSeats(req.tenant.orgType) ? next() : next('route'));

function centreEntryFields(body, timezone, { creating = false } = {}) {
  const fields = {};
  if (body.category !== undefined) fields.category = body.category;
  if (body.amount !== undefined) fields.amount = body.amount;
  if (body.paymentMethod !== undefined) fields.paymentMethod = body.paymentMethod;
  if (body.vendor !== undefined) fields.vendor = body.vendor || undefined;
  if (body.title !== undefined) fields.title = body.title;
  if (body.date !== undefined) fields.invoiceDate = new Date(body.date);
  else if (creating) fields.invoiceDate = dayKeyInTz(new Date(), timezone);
  return fields;
}

// A month's spending by category, with the last six months beside it.
router.get(
  '/summary',
  requireSeatsOrg,
  requirePermission('expense:read'),
  async (req, res, next) => {
    try {
      const { month } = financeMonthQuerySchema.parse(req.query);
      res.json(await expenseSummary(req.tenant, resolveMonth(req.tenant, month)));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/entries',
  requirePermission('expense:write'),
  centreOnly,
  validate(createCentreExpenseSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const fields = centreEntryFields(req.body, req.tenant.timezone, { creating: true });
      const entry = await ExpenseEntry.create({
        tenantId,
        ...fields,
        title: fields.title || fields.category,
        submittedBy: req.user.sub,
        status: 'approved',
        approvalChain: [],
      });
      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'expense.create',
        target: { model: 'ExpenseEntry', id: entry._id },
        after: entry.toObject(),
        ip: req.ip,
      });
      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/entries/:id',
  requirePermission('expense:write'),
  centreOnly,
  validate(updateCentreExpenseSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await ExpenseEntry.findOne({ _id: req.params.id, tenantId }).lean();
      if (!before) return res.status(404).json({ error: 'Not found' });
      const fields = centreEntryFields(req.body, req.tenant.timezone);
      // Changing the category without a title keeps the title in step with it.
      if (fields.category && fields.title === undefined && before.title === before.category) {
        fields.title = fields.category;
      }
      const entry = await ExpenseEntry.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { $set: fields },
        { new: true }
      );
      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'expense.update',
        target: { model: 'ExpenseEntry', id: entry._id },
        before,
        after: entry.toObject(),
        ip: req.ip,
      });
      res.json(entry);
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/entries/:id',
  requirePermission('expense:write'),
  centreOnly,
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await ExpenseEntry.findOneAndDelete({ _id: req.params.id, tenantId }).lean();
      if (!before) return res.status(404).json({ error: 'Not found' });
      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'expense.delete',
        target: { model: 'ExpenseEntry', id: before._id },
        before,
        ip: req.ip,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

router.post('/entries', requirePermission('expense:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const {
      title,
      category,
      amount,
      currency,
      paymentMethod,
      vendor,
      invoiceDate,
      costCenterId,
      isReimbursement,
    } = req.body;

    const chain = await buildApprovalChain(amount, tenantId);

    const status = chain.length === 0 ? 'approved' : 'pending';

    const entry = await ExpenseEntry.create({
      tenantId,
      title,
      category,
      amount,
      currency: currency || undefined,
      paymentMethod: paymentMethod || undefined,
      vendor: vendor || undefined,
      invoiceDate: invoiceDate || undefined,
      costCenterId: costCenterId || undefined,
      isReimbursement: !!isReimbursement,
      submittedBy: req.user.sub,
      approvalChain: chain,
      currentApproverIndex: 0,
      status,
    });

    if (costCenterId) {
      await checkBudgetAlert(costCenterId, tenantId, amount);
    }

    if (status === 'pending') {
      await scheduleEscalation(entry._id);
    }

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

router.get('/entries', requirePermission('expense:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.costCenterId) filter.costCenterId = req.query.costCenterId;
    if (req.query.submittedBy) filter.submittedBy = req.query.submittedBy;
    if (req.query.from || req.query.to) {
      filter.invoiceDate = {};
      if (req.query.from) filter.invoiceDate.$gte = new Date(req.query.from);
      if (req.query.to) filter.invoiceDate.$lte = new Date(req.query.to);
    }

    const entries = await ExpenseEntry.find(filter)
      .populate('submittedBy', 'firstName lastName email')
      .populate('costCenterId', 'name code')
      .sort({ invoiceDate: -1, createdAt: -1 })
      .lean();

    res.json(entries);
  } catch (err) {
    next(err);
  }
});

router.get('/entries/:id', requirePermission('expense:read'), async (req, res, next) => {
  try {
    const entry = await ExpenseEntry.findOne({ _id: req.params.id, tenantId: req.tenant._id })
      .populate('submittedBy', 'firstName lastName email')
      .populate('costCenterId', 'name code')
      .lean();
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

router.patch('/entries/:id', requirePermission('expense:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const existing = await ExpenseEntry.findOne({ _id: req.params.id, tenantId }).lean();
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.status !== 'draft')
      return res.status(400).json({ error: 'Only draft entries can be updated' });

    const entry = await ExpenseEntry.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: req.body },
      { new: true }
    );
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/entries/:id/attachments',
  requirePermission('expense:write'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('No file uploaded', 400);
      const tenantId = req.tenant._id;

      const entry = await ExpenseEntry.findOne({ _id: req.params.id, tenantId });
      if (!entry) return res.status(404).json({ error: 'Not found' });

      const key = `expenses/${tenantId}/${entry._id}/${Date.now()}-${req.file.originalname}`;
      await uploadBuffer(key, req.file.buffer, req.file.mimetype);

      entry.attachments.push({ name: req.body.name || req.file.originalname, key });
      await entry.save();

      res.json({ attachment: entry.attachments[entry.attachments.length - 1] });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/entries/:id/approve',
  requirePermission('expense:approve'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const entry = await advanceApproval(
        req.params.id,
        req.user.sub,
        'approved',
        req.body.comment
      );

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'expense.approved',
        target: { type: 'ExpenseEntry', id: req.params.id },
        ip: req.ip,
      });

      res.json(entry);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/entries/:id/reject',
  requirePermission('expense:approve'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { comment } = req.body;
      const entry = await advanceApproval(req.params.id, req.user.sub, 'rejected', comment);

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'expense.rejected',
        target: { type: 'ExpenseEntry', id: req.params.id },
        ip: req.ip,
      });

      res.json(entry);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/entries/:id/mark-paid',
  requirePermission('expense:approve'),
  async (req, res, next) => {
    try {
      const entry = await ExpenseEntry.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenant._id },
        { $set: { status: 'paid', paidAt: new Date() } },
        { new: true }
      );
      if (!entry) return res.status(404).json({ error: 'Not found' });
      res.json(entry);
    } catch (err) {
      next(err);
    }
  }
);

// ── Budgets ───────────────────────────────────────────────────────────────────

router.post('/budgets', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { costCenterId, category, period, year, month, cap } = req.body;
    const tenantId = req.tenant._id;

    const budget = await Budget.findOneAndUpdate(
      { tenantId, costCenterId, year, month: month ?? null },
      { $set: { category, period, cap } },
      { upsert: true, new: true }
    );

    res.status(201).json(budget);
  } catch (err) {
    next(err);
  }
});

router.get('/budgets', requirePermission('expense:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.costCenterId) filter.costCenterId = req.query.costCenterId;
    if (req.query.year) filter.year = Number(req.query.year);

    const budgets = await Budget.find(filter).populate('costCenterId', 'name code').lean();

    res.json(budgets);
  } catch (err) {
    next(err);
  }
});

// ── Reimbursement Export ──────────────────────────────────────────────────────

router.get(
  '/export/reimbursements',
  requirePermission('expense:approve'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const filter = {
        tenantId,
        isReimbursement: true,
        status: 'approved',
      };
      if (req.query.from || req.query.to) {
        filter.invoiceDate = {};
        if (req.query.from) filter.invoiceDate.$gte = new Date(req.query.from);
        if (req.query.to) filter.invoiceDate.$lte = new Date(req.query.to);
      }

      const entries = await ExpenseEntry.find(filter)
        .populate('submittedBy', 'firstName lastName email')
        .lean();

      const userIds = [
        ...new Set(entries.map((e) => e.submittedBy?._id?.toString()).filter(Boolean)),
      ];
      const staffMembers = await StaffMember.find({ tenantId, userId: { $in: userIds } }).lean();
      const staffByUserId = Object.fromEntries(staffMembers.map((s) => [s.userId.toString(), s]));

      const lines = ['Staff Name,Amount,Bank Account,Date'];
      for (const entry of entries) {
        const userId = entry.submittedBy?._id?.toString();
        const staffMember = staffByUserId[userId];
        const name = entry.submittedBy
          ? `${entry.submittedBy.firstName ?? ''} ${entry.submittedBy.lastName ?? ''}`.trim()
          : 'Unknown';

        let bankAccount = '';
        if (staffMember?.bankAccount) {
          try {
            bankAccount = decryptField(staffMember.bankAccount, tenantId);
          } catch {
            bankAccount = '[encrypted]';
          }
        }

        const date = entry.invoiceDate ? entry.invoiceDate.toISOString().split('T')[0] : '';
        lines.push(`"${name}",${entry.amount},"${bankAccount}","${date}"`);
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=reimbursements.csv`);
      res.send(lines.join('\n'));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
