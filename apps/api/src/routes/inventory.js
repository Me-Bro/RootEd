import { Router } from 'express';
import { Queue } from 'bullmq';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { AppError } from '../middleware/errorHandler.js';
import { InventoryItem, Consumable, FixedAsset } from '../models/InventoryItem.js';
import { StockMovement } from '../models/StockMovement.js';
import { PurchaseRequisition } from '../models/PurchaseRequisition.js';
import { ExpenseEntry } from '../models/ExpenseEntry.js';
import { issueItem, returnItem, checkLowStock, calculateDepreciation, generateQrCode } from '../services/inventory.service.js';
import { auditLog } from '../services/audit.service.js';
import { redis } from '../config/redis.js';

const stockValuationQueue = new Queue('stock-valuation', { connection: redis });

const router = Router();

router.use(authenticate);

function generateSku(category) {
  const prefix = (category || 'GEN').substring(0, 3).toUpperCase();
  const num = String(Math.floor(1000 + Math.random() * 9000));
  return `SKU-${prefix}-${num}`;
}

router.post('/items', requirePermission('inventory:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const { itemType, category, name, unitCost, location, custodianId, sku: skuInput, ...rest } = req.body;

    const sku = skuInput || generateSku(category);

    const ItemModel = itemType === 'consumable' ? Consumable : FixedAsset;
    const item = await ItemModel.create({
      tenantId,
      sku,
      name,
      category,
      unitCost,
      location,
      custodianId,
      itemType,
      ...rest,
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

router.get('/items', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.itemType) filter.itemType = req.query.itemType;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { sku: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const items = await InventoryItem.find(filter).lean();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/items/:id', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const item = await InventoryItem.findOne({ _id: req.params.id, tenantId: req.tenant._id }).lean();
    if (!item) return res.status(404).json({ error: 'Not found' });

    const qrCodeDataUrl = await generateQrCode(item._id.toString(), item.sku);
    res.json({ ...item, qrCodeDataUrl });
  } catch (err) {
    next(err);
  }
});

router.patch('/items/:id', requirePermission('inventory:write'), async (req, res, next) => {
  try {
    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenant._id },
      { $set: req.body },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.post('/items/:id/issue', requirePermission('inventory:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const { quantity, issuedTo, dueDate } = req.body;

    const movement = await issueItem(
      req.params.id,
      Number(quantity),
      issuedTo,
      dueDate,
      req.user.sub,
      tenantId
    );

    const item = await InventoryItem.findOne({ _id: req.params.id, tenantId }).lean();
    if (item?.itemType === 'consumable' && item.quantity <= item.reorderLevel) {
      await checkLowStock(tenantId);
    }

    res.status(201).json(movement);
  } catch (err) {
    next(err);
  }
});

router.post('/movements/:movementId/return', requirePermission('inventory:write'), async (req, res, next) => {
  try {
    const movement = await returnItem(req.params.movementId, req.tenant._id);
    res.json(movement);
  } catch (err) {
    next(err);
  }
});

router.get('/movements', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.itemId) filter.itemId = req.query.itemId;
    if (req.query.type) filter.movementType = req.query.type;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const movements = await StockMovement.find(filter)
      .populate('itemId', 'name sku')
      .populate('movedBy', 'email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(movements);
  } catch (err) {
    next(err);
  }
});

router.get('/requisitions', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.status) filter.status = req.query.status;

    const requisitions = await PurchaseRequisition.find(filter)
      .populate('itemId', 'name sku category')
      .populate('requestedBy', 'email')
      .lean();

    res.json(requisitions);
  } catch (err) {
    next(err);
  }
});

router.patch('/requisitions/:id/approve', requirePermission('expense:approve'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const requisition = await PurchaseRequisition.findOne({ _id: req.params.id, tenantId });
    if (!requisition) return res.status(404).json({ error: 'Not found' });

    requisition.status = 'approved';
    requisition.approvedBy = req.user.sub;

    const item = await InventoryItem.findOne({ _id: requisition.itemId, tenantId }).lean();
    if (item) {
      const expense = await ExpenseEntry.create({
        tenantId,
        title: `Purchase: ${item.name}`,
        category: 'inventory',
        amount: (item.unitCost || 0) * requisition.requestedQuantity,
        submittedBy: req.user.sub,
        status: 'draft',
        approvalChain: [],
        currentApproverIndex: 0,
      });

      requisition.linkedExpenseId = expense._id;
    }

    await requisition.save();

    await auditLog({
      actorId: req.user.sub,
      tenantId: tenantId.toString(),
      action: 'inventory.requisition.approved',
      target: { type: 'PurchaseRequisition', id: req.params.id },
      ip: req.ip,
    });

    res.json(requisition);
  } catch (err) {
    next(err);
  }
});

router.get('/depreciation', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const asOfDate = new Date(year, 11, 31);

    const assets = await FixedAsset.find({ tenantId, itemType: 'fixed_asset' }).lean();

    const result = assets.map((item) => ({
      item: { _id: item._id, name: item.name, sku: item.sku, depreciationMethod: item.depreciationMethod },
      annualDepreciation: calculateDepreciation(item, asOfDate),
      currentValue: item.currentValue ?? item.unitCost ?? 0,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/low-stock', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const items = await Consumable.find({
      tenantId: req.tenant._id,
      $expr: { $lte: ['$quantity', '$reorderLevel'] },
    }).lean();

    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post('/valuation/generate', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const { year, month } = req.body;
    if (!year || !month) throw new AppError('year and month required', 400);

    const job = await stockValuationQueue.add('generate', {
      tenantId: req.tenant._id.toString(),
      period: { year: Number(year), month: Number(month) },
      requestedBy: req.user.sub,
    });

    res.status(202).json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
});

router.get('/valuation/status/:jobId', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const job = await stockValuationQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();
    const result = job.returnvalue;

    res.json({ jobId: job.id, state, result: result ?? null });
  } catch (err) {
    next(err);
  }
});

export default router;
