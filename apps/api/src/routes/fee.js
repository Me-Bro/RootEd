import crypto from 'crypto';
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { FeeDiscount } from '../models/FeeDiscount.js';
import {
  assignFeesToSection,
  assignFeesToStudents,
  resolveStudentIdsForStructure,
  recordPayment,
  getDefaulters,
  initiateOnlinePayment,
} from '../services/fee.service.js';
import { getSignedUrl } from '../services/storage.service.js';
import { env } from '../config/env.js';
import { auditLog } from '../services/audit.service.js';
import {
  createFeeStructureSchema,
  updateFeeStructureSchema,
  assignFeeStructureSchema,
  createFeeDiscountSchema,
} from '@rooted/shared/schemas';

const router = Router();

router.use(authenticate);

router.post(
  '/structures',
  requirePermission('fees:write'),
  validate(createFeeStructureSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { name, academicYearId } = req.body;

      const existing = await FeeStructure.findOne({ tenantId, name, academicYearId });
      if (existing) {
        return res
          .status(409)
          .json({ error: 'A fee structure with this name already exists for this academic year' });
      }

      const structure = await FeeStructure.create({ tenantId, ...req.body });

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'feeStructure.create',
        target: { model: 'FeeStructure', id: structure._id },
        after: structure.toObject(),
        ip: req.ip,
      });

      let autoAssign = { created: 0, skipped: 0 };
      if (structure.applicableTo === 'all' || structure.applicableTo === 'class') {
        const studentIds = await resolveStudentIdsForStructure(structure, tenantId);
        autoAssign = await assignFeesToStudents({
          studentIds,
          feeStructureId: structure._id,
          tenantId,
        });
      }

      res.status(201).json({ ...structure.toObject(), autoAssign });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/structures/:id',
  requirePermission('fees:write'),
  validate(updateFeeStructureSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await FeeStructure.findOne({ _id: req.params.id, tenantId }).lean();
      if (!before) return res.status(404).json({ error: 'Not found' });

      const doc = await FeeStructure.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { $set: req.body },
        { new: true }
      );

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'feeStructure.update',
        target: { model: 'FeeStructure', id: doc._id },
        before,
        after: doc.toObject(),
        ip: req.ip,
      });

      res.json(doc);
    } catch (err) {
      next(err);
    }
  }
);

async function setStructureActive(req, res, next, isActive) {
  try {
    const tenantId = req.tenant._id;
    const doc = await FeeStructure.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { isActive } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });

    await auditLog({
      actorId: req.user.sub,
      tenantId: tenantId.toString(),
      action: isActive ? 'feeStructure.activate' : 'feeStructure.deactivate',
      target: { model: 'FeeStructure', id: doc._id },
      after: doc.toObject(),
      ip: req.ip,
    });

    res.json(doc);
  } catch (err) {
    next(err);
  }
}
router.patch('/structures/:id/activate', requirePermission('fees:write'), (req, res, next) =>
  setStructureActive(req, res, next, true)
);
router.patch('/structures/:id/deactivate', requirePermission('fees:write'), (req, res, next) =>
  setStructureActive(req, res, next, false)
);

router.get('/structures', requirePermission('fees:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.yearId) filter.academicYearId = req.query.yearId;

    const structures = await FeeStructure.find(filter)
      .populate('academicYearId', 'name')
      .populate('classId', 'name')
      .lean();

    res.json(structures);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/structures/:id/assign',
  requirePermission('fees:write'),
  validate(assignFeeStructureSchema),
  async (req, res, next) => {
    try {
      const { sectionId, dueDate } = req.body;
      const result = await assignFeesToSection(sectionId, req.params.id, req.tenant._id, dueDate);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/assignments', requirePermission('fees:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.yearId) filter.academicYearId = req.query.yearId;
    if (req.query.status) filter.status = req.query.status;

    const assignments = await FeeAssignment.find(filter)
      .populate('studentId', 'firstName lastName admissionNo')
      .populate('feeStructureId', 'name components')
      .populate('academicYearId', 'name')
      .lean();

    res.json(assignments);
  } catch (err) {
    next(err);
  }
});

router.post('/payments', requirePermission('fees:collect'), async (req, res, next) => {
  try {
    const { assignmentId, amount, paymentMethod, transactionId, notes, installmentIndex } =
      req.body;

    const payment = await recordPayment({
      assignmentId,
      amount: Number(amount),
      paymentMethod,
      transactionId,
      notes,
      installmentIndex,
      collectedBy: req.user.sub,
      tenantId: req.tenant._id,
    });

    let receiptUrl = null;
    if (payment.receiptPdfKey) {
      receiptUrl = await getSignedUrl(payment.receiptPdfKey);
    }

    res.status(201).json({ payment, receiptUrl });
  } catch (err) {
    next(err);
  }
});

router.get('/payments', requirePermission('fees:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.from || req.query.to) {
      filter.paymentDate = {};
      if (req.query.from) filter.paymentDate.$gte = new Date(req.query.from);
      if (req.query.to) filter.paymentDate.$lte = new Date(req.query.to);
    }

    const payments = await FeePayment.find(filter)
      .populate('studentId', 'firstName lastName admissionNo')
      .populate('collectedBy', 'email')
      .sort({ paymentDate: -1 })
      .lean();

    res.json(payments);
  } catch (err) {
    next(err);
  }
});

router.get('/payments/:id/receipt', requirePermission('fees:read'), async (req, res, next) => {
  try {
    const payment = await FeePayment.findOne({
      _id: req.params.id,
      tenantId: req.tenant._id,
    }).lean();
    if (!payment) return res.status(404).json({ error: 'Not found' });
    if (!payment.receiptPdfKey) return res.status(404).json({ error: 'Receipt not generated yet' });

    const url = await getSignedUrl(payment.receiptPdfKey);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

router.get('/defaulters', requirePermission('fees:read'), async (req, res, next) => {
  try {
    const defaulters = await getDefaulters(req.tenant._id, req.query.yearId);
    res.json(defaulters);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/discounts',
  requirePermission('tenant:admin'),
  validate(createFeeDiscountSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const discount = await FeeDiscount.create({ tenantId, ...req.body });

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'feeDiscount.create',
        target: { model: 'FeeDiscount', id: discount._id },
        after: discount.toObject(),
        ip: req.ip,
      });

      res.status(201).json(discount);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/discounts', requirePermission('fees:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.yearId) filter.academicYearId = req.query.yearId;

    const discounts = await FeeDiscount.find(filter).lean();
    res.json(discounts);
  } catch (err) {
    next(err);
  }
});

router.post('/payments/initiate', requirePermission('fees:collect'), async (req, res, next) => {
  try {
    const { assignmentId } = req.body;
    if (!assignmentId) throw new AppError('assignmentId required', 400);
    const result = await initiateOnlinePayment(assignmentId, req.tenant._id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/payments/verify', requirePermission('fees:collect'), async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, assignmentId } = req.body;

    if (!env.RAZORPAY_KEY_SECRET) throw new AppError('Razorpay not configured', 500);

    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) throw new AppError('Invalid payment signature', 400);

    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const amount = order.amount / 100; // paise -> rupees

    const payment = await recordPayment({
      assignmentId,
      amount,
      paymentMethod: 'upi',
      transactionId: razorpay_payment_id,
      notes: `Razorpay order: ${razorpay_order_id}`,
      collectedBy: req.user.sub,
      tenantId: req.tenant._id,
    });

    let receiptUrl = null;
    if (payment.receiptPdfKey) {
      receiptUrl = await getSignedUrl(payment.receiptPdfKey);
    }

    res.json({ payment, receiptUrl });
  } catch (err) {
    next(err);
  }
});

router.get('/export/collection', requirePermission('fees:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const filter = { tenantId };

    if (req.query.from || req.query.to) {
      filter.paymentDate = {};
      if (req.query.from) filter.paymentDate.$gte = new Date(req.query.from);
      if (req.query.to) filter.paymentDate.$lte = new Date(req.query.to);
    }

    const payments = await FeePayment.find(filter)
      .populate({
        path: 'studentId',
        select: 'firstName lastName admissionNo sectionId',
        populate: {
          path: 'sectionId',
          select: 'name classId',
          populate: { path: 'classId', select: 'name' },
        },
      })
      .lean();

    const filtered = req.query.classId
      ? payments.filter(
          (p) => p.studentId?.sectionId?.classId?._id?.toString() === req.query.classId
        )
      : payments;

    const lines = ['studentName,admissionNo,class,amount,date,method'];
    for (const p of filtered) {
      const s = p.studentId;
      const name = s ? `${s.firstName} ${s.lastName}` : '';
      const admissionNo = s?.admissionNo || '';
      const className = s?.sectionId?.classId?.name || '';
      const date = p.paymentDate ? new Date(p.paymentDate).toISOString().split('T')[0] : '';
      lines.push(
        `"${name}","${admissionNo}","${className}",${p.amount},"${date}","${p.paymentMethod}"`
      );
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=fee-collection.csv');
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

export default router;
