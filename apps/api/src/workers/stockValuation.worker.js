import { Worker } from 'bullmq';
import PDFDocument from 'pdfkit';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { InventoryItem, Consumable, FixedAsset } from '../models/InventoryItem.js';
import { calculateDepreciation } from '../services/inventory.service.js';
import { uploadBuffer, getSignedUrl } from '../services/storage.service.js';

async function generateValuationPdf(tenantId, year, month) {
  const consumables = await Consumable.find({ tenantId, itemType: 'consumable' }).lean();
  const fixedAssets = await FixedAsset.find({ tenantId, itemType: 'fixed_asset' }).lean();

  const asOfDate = new Date(year, month - 1 + 1, 0);

  const consumableRows = consumables.map((item) => ({
    name: item.name,
    sku: item.sku,
    quantity: item.quantity ?? 0,
    unitCost: item.unitCost ?? 0,
    totalValue: (item.quantity ?? 0) * (item.unitCost ?? 0),
  }));

  const fixedAssetRows = fixedAssets.map((item) => {
    const depreciation = calculateDepreciation(item, asOfDate);
    const currentValue = item.currentValue != null ? item.currentValue - depreciation : (item.unitCost ?? 0);
    return {
      name: item.name,
      sku: item.sku,
      depreciationMethod: item.depreciationMethod || 'slm',
      currentValue: Math.max(0, currentValue),
    };
  });

  const consumablesTotal = consumableRows.reduce((s, r) => s + r.totalValue, 0);
  const fixedAssetsTotal = fixedAssetRows.reduce((s, r) => s + r.currentValue, 0);
  const grandTotal = consumablesTotal + fixedAssetsTotal;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(`Stock Valuation Report — ${month}/${year}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(13).text('Consumables', { underline: true });
    doc.moveDown(0.5);

    const consumableHeaders = ['Name', 'SKU', 'Qty', 'Unit Cost', 'Total Value'];
    const consumableWidths = [160, 80, 50, 80, 80];
    let x = 50;
    const headerY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    consumableHeaders.forEach((h, i) => {
      doc.text(h, x, headerY, { width: consumableWidths[i] });
      x += consumableWidths[i];
    });
    doc.font('Helvetica');
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.3);

    for (const row of consumableRows) {
      x = 50;
      const rowY = doc.y;
      doc.fontSize(9);
      doc.text(row.name, x, rowY, { width: 160 }); x += 160;
      doc.text(row.sku, x, rowY, { width: 80 }); x += 80;
      doc.text(String(row.quantity), x, rowY, { width: 50 }); x += 50;
      doc.text(row.unitCost.toFixed(2), x, rowY, { width: 80 }); x += 80;
      doc.text(row.totalValue.toFixed(2), x, rowY, { width: 80 });
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold').text(`Consumables Total: ${consumablesTotal.toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(1.5);

    doc.fontSize(13).text('Fixed Assets', { underline: true });
    doc.moveDown(0.5);

    const assetHeaders = ['Name', 'SKU', 'Method', 'Current Value'];
    const assetWidths = [180, 80, 80, 100];
    x = 50;
    const assetHeaderY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    assetHeaders.forEach((h, i) => {
      doc.text(h, x, assetHeaderY, { width: assetWidths[i] });
      x += assetWidths[i];
    });
    doc.font('Helvetica');
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.3);

    for (const row of fixedAssetRows) {
      x = 50;
      const rowY = doc.y;
      doc.fontSize(9);
      doc.text(row.name, x, rowY, { width: 180 }); x += 180;
      doc.text(row.sku, x, rowY, { width: 80 }); x += 80;
      doc.text(row.depreciationMethod.toUpperCase(), x, rowY, { width: 80 }); x += 80;
      doc.text(row.currentValue.toFixed(2), x, rowY, { width: 100 });
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold').text(`Fixed Assets Total: ${fixedAssetsTotal.toFixed(2)}`, { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Grand Total Portfolio Value: ${grandTotal.toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica');

    doc.end();
  });
}

export function startStockValuationWorker() {
  const worker = new Worker(
    'stock-valuation',
    async (job) => {
      const { tenantId, period: { year, month }, requestedBy } = job.data;

      logger.info({ tenantId, year, month, requestedBy }, 'Stock valuation job started');

      const pdfBuffer = await generateValuationPdf(tenantId, year, month);
      const key = `stock-reports/${tenantId}/${year}-${String(month).padStart(2, '0')}.pdf`;

      await uploadBuffer(key, pdfBuffer, 'application/pdf');
      const url = await getSignedUrl(key, 3600);

      return { url };
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Stock valuation job failed');
  });

  logger.info('Stock valuation worker started');
  return worker;
}
