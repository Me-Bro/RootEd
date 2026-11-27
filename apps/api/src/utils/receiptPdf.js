import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/fonts');
const REGULAR = path.join(FONT_DIR, 'NotoSans-Regular.ttf');
const BOLD = path.join(FONT_DIR, 'NotoSans-Bold.ttf');
const GREY = '#6b7280';
const INK = '#111827';
const LINE = '#d1d5db';

/** Lays a buildReceiptView() result out on an A4 pdfkit doc. The caller ends the doc. */
export function drawReceipt(doc, view, logo) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  doc.registerFont('r', REGULAR).registerFont('b', BOLD);

  // Header: logo on the left, organisation block beside it.
  let textX = left;
  if (logo) {
    try {
      doc.image(logo, left, 50, { fit: [60, 60] });
      textX = left + 75;
    } catch {
      // ponytail: an image pdfkit can't read (webp/svg) just drops the logo
    }
  }
  const headW = right - textX;
  doc
    .font('b')
    .fontSize(16)
    .fillColor(INK)
    .text(view.organization || '', textX, 50, { width: headW });
  doc.font('r').fontSize(9).fillColor(GREY);
  for (const l of view.address) doc.text(l, textX, doc.y, { width: headW });
  if (view.contact) doc.text(view.contact, textX, doc.y, { width: headW });
  if (view.registrationNumber)
    doc.text(`Reg. No: ${view.registrationNumber}`, textX, doc.y, { width: headW });

  let y = Math.max(doc.y, logo ? 115 : 0) + 12;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).stroke();
  y += 14;
  doc
    .font('b')
    .fontSize(14)
    .fillColor(INK)
    .text('FEE RECEIPT', left, y, { width, align: 'center', characterSpacing: 2 });
  y = doc.y + 16;

  // Two detail columns: receipt meta left, payer right.
  const colW = width / 2 - 10;
  const column = (rows, x) => {
    let cy = y;
    for (const [label, value] of rows) {
      doc.font('r').fontSize(8).fillColor(GREY).text(label.toUpperCase(), x, cy, { width: colW });
      doc
        .font('b')
        .fontSize(11)
        .fillColor(INK)
        .text(String(value ?? '-'), x, doc.y, { width: colW });
      cy = doc.y + 8;
    }
    return cy;
  };
  y = Math.max(column(view.meta, left), column(view.payer, left + width / 2 + 10));

  // Table: Description | Period | Amount
  y += 4;
  const descW = width * 0.45;
  const periodX = left + 8 + descW;
  const periodW = width - descW - 8 - 108;
  const amtX = right - 100;
  doc.rect(left, y, width, 24).fill('#f3f4f6');
  doc.font('b').fontSize(9).fillColor('#374151');
  doc.text('DESCRIPTION', left + 8, y + 8, { width: descW - 8 });
  doc.text('PERIOD', periodX, y + 8, { width: periodW });
  doc.text('AMOUNT', amtX, y + 8, { width: 92, align: 'right' });
  y += 24;
  const rowTop = y + 10;
  doc.font('r').fontSize(11).fillColor(INK);
  doc.text(view.item.description, left + 8, rowTop, { width: descW - 8 });
  const descBottom = doc.y;
  doc.text(view.item.period, periodX, rowTop, { width: periodW });
  const periodBottom = doc.y;
  doc.text(view.item.amount, amtX, rowTop, { width: 92, align: 'right' });
  y = Math.max(descBottom, periodBottom) + 10;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).stroke();

  // Totals
  y += 14;
  const method = `Payment method: ${view.method}${view.transactionId ? `   Ref: ${view.transactionId}` : ''}`;
  doc
    .font('r')
    .fontSize(10)
    .fillColor(GREY)
    .text(method, left, y, { width: width - 180 });
  const methodBottom = doc.y;
  doc
    .font('b')
    .fontSize(9)
    .fillColor(GREY)
    .text('TOTAL PAID', right - 170, y, { width: 170, align: 'right' });
  doc
    .font('b')
    .fontSize(18)
    .fillColor(INK)
    .text(view.total, right - 170, y + 12, { width: 170, align: 'right' });
  y = Math.max(doc.y, methodBottom) + 14;
  doc
    .font('r')
    .fontSize(10)
    .fillColor(INK)
    .text(`Amount in words: ${view.words}`, left, y, { width });

  doc
    .font('r')
    .fontSize(8)
    .fillColor(GREY)
    .text(
      'This is a computer-generated receipt and does not require a signature.',
      left,
      doc.page.height - 80,
      {
        width,
        align: 'center',
      }
    );
}
