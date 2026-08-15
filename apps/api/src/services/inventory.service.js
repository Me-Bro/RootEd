import QRCode from 'qrcode';
import { InventoryItem, Consumable } from '../models/InventoryItem.js';
import { StockMovement } from '../models/StockMovement.js';
import { PurchaseRequisition } from '../models/PurchaseRequisition.js';

export async function issueItem(itemId, quantity, issuedTo, dueDate, movedBy, tenantId) {
  const item = await InventoryItem.findOne({ _id: itemId, tenantId });
  if (!item) throw new Error('Item not found');

  if (item.itemType === 'consumable') {
    if (item.quantity < quantity) throw new Error('Insufficient quantity');
  }

  const movement = await StockMovement.create({
    tenantId,
    itemId,
    movementType: 'issue',
    quantity,
    issuedTo,
    dueDate,
    movedBy,
    fromLocation: item.location,
  });

  if (item.itemType === 'consumable') {
    await Consumable.findOneAndUpdate(
      { _id: itemId, tenantId },
      { $inc: { quantity: -quantity } }
    );
  }

  return movement;
}

export async function returnItem(movementId, tenantId) {
  const issueMovement = await StockMovement.findOne({
    _id: movementId,
    tenantId,
    movementType: 'issue',
  });
  if (!issueMovement) throw new Error('Issue movement not found');
  if (issueMovement.returnedAt) throw new Error('Already returned');

  const returnMovement = await StockMovement.create({
    tenantId,
    itemId: issueMovement.itemId,
    movementType: 'return',
    quantity: issueMovement.quantity,
    movedBy: issueMovement.movedBy,
    toLocation: issueMovement.fromLocation,
    referenceId: movementId.toString(),
  });

  issueMovement.returnedAt = new Date();
  await issueMovement.save();

  const item = await InventoryItem.findOne({ _id: issueMovement.itemId, tenantId });
  if (item && item.itemType === 'consumable') {
    await Consumable.findOneAndUpdate(
      { _id: issueMovement.itemId, tenantId },
      { $inc: { quantity: issueMovement.quantity } }
    );
  }

  return returnMovement;
}

export async function checkLowStock(tenantId) {
  const lowStockItems = await Consumable.find({
    tenantId,
    $expr: { $lte: ['$quantity', '$reorderLevel'] },
  }).lean();

  for (const item of lowStockItems) {
    const existing = await PurchaseRequisition.findOne({
      tenantId,
      itemId: item._id,
      status: 'pending',
    }).lean();

    if (!existing) {
      await PurchaseRequisition.create({
        tenantId,
        itemId: item._id,
        requestedQuantity: item.reorderLevel * 2 || 10,
        reason: 'Auto-generated: low stock alert',
        requestedBy: item.custodianId || item._id,
      });
    }
  }

  return lowStockItems;
}

export function calculateDepreciation(item, asAsOfDate = new Date()) {
  if (item.itemType !== 'fixed_asset') return 0;

  const usefulLifeYears = item.usefulLifeYears || 5;
  const originalCost = item.unitCost || 0;

  if (item.depreciationMethod === 'wdv') {
    const rate = 1 - Math.pow(1 / usefulLifeYears, 1);
    const currentValue = item.currentValue != null ? item.currentValue : originalCost;
    return currentValue * (1 - 1 / usefulLifeYears);
  }

  return originalCost / usefulLifeYears;
}

export async function generateQrCode(itemId, sku) {
  const data = `${sku}:${itemId}`;
  const dataUrl = await QRCode.toDataURL(data);
  return dataUrl;
}
