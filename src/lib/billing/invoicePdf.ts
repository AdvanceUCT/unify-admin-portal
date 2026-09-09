/**
 * @fileoverview Renders the frozen invoice document model to a PDF buffer using pdfkit.
 *
 * pdfkit draws glyphs directly (no HTML/markup parsing), so there is no
 * markup-injection surface the way there would be with an HTML-to-PDF
 * approach — every `.text()` call renders its string literally. No remote
 * resources (images, fonts) are ever fetched; only the bundled base font is
 * used.
 * @module lib/billing/invoicePdf
 */

import PDFDocument from "pdfkit";

import type { InvoiceDocumentData } from "@/lib/billing/invoiceDocument";

const PAGE_MARGIN = 50;
const COLUMN = {
  branch: PAGE_MARGIN,
  period: 220,
  quantity: 340,
  unitPrice: 390,
  lineTotal: 470,
};

function ensureRoom(doc: PDFKit.PDFDocument, rowHeight: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + rowHeight > bottom) {
    doc.addPage();
    return true;
  }
  return false;
}

function drawTableHeader(doc: PDFKit.PDFDocument) {
  doc.fontSize(9).font("Helvetica-Bold");
  const y = doc.y;
  doc.text("Branch", COLUMN.branch, y, { width: COLUMN.period - COLUMN.branch - 10 });
  doc.text("Service period", COLUMN.period, y, { width: COLUMN.quantity - COLUMN.period - 10 });
  doc.text("Qty", COLUMN.quantity, y, { width: COLUMN.unitPrice - COLUMN.quantity - 10 });
  doc.text("Unit price", COLUMN.unitPrice, y, { width: COLUMN.lineTotal - COLUMN.unitPrice - 10 });
  doc.text("Line total", COLUMN.lineTotal, y, { width: 545 - COLUMN.lineTotal });
  doc.moveDown(0.5);
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(545, doc.y).strokeColor("#999999").stroke();
  doc.moveDown(0.5);
  doc.font("Helvetica");
}

/** Renders the invoice to a PDF buffer. Deterministic given the same document data. */
export function renderInvoicePdf(data: InvoiceDocumentData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).font("Helvetica-Bold").text(data.issuer.name || "University");
    doc.fontSize(10).font("Helvetica").text(data.issuer.contactEmail || "");
    doc.moveDown(1);

    doc.fontSize(14).font("Helvetica-Bold").text(`Invoice ${data.invoiceNumber}`);
    doc.fontSize(10).font("Helvetica");
    doc.text(`Period: ${data.periodLabel}`);
    doc.text(`Issued: ${data.issuedAtIso ? new Date(data.issuedAtIso).toISOString().slice(0, 10) : "Not yet issued"}`);
    doc.text(`Status: ${data.paymentStatus}`);
    if (data.isDemo) {
      doc.fillColor("#b45309").text("Demo invoice — no real payment required.").fillColor("black");
    }
    doc.moveDown(1);

    doc.font("Helvetica-Bold").text("Bill to");
    doc.font("Helvetica").text(data.customer.companyName || "Vendor");
    if (data.customer.contactEmail) doc.text(data.customer.contactEmail);
    doc.moveDown(1);

    drawTableHeader(doc);

    for (const item of data.items) {
      const rowHeight = 16;
      if (ensureRoom(doc, rowHeight)) {
        drawTableHeader(doc);
      }
      const y = doc.y;
      doc.fontSize(9);
      doc.text(item.branchName, COLUMN.branch, y, { width: COLUMN.period - COLUMN.branch - 10 });
      doc.text(item.servicePeriodLabel, COLUMN.period, y, { width: COLUMN.quantity - COLUMN.period - 10 });
      doc.text(String(item.quantity), COLUMN.quantity, y, { width: COLUMN.unitPrice - COLUMN.quantity - 10 });
      doc.text(item.unitPriceDisplay, COLUMN.unitPrice, y, { width: COLUMN.lineTotal - COLUMN.unitPrice - 10 });
      doc.text(item.lineTotalDisplay, COLUMN.lineTotal, y, { width: 545 - COLUMN.lineTotal });
      doc.y = y + rowHeight;
    }

    ensureRoom(doc, 90);
    doc.moveDown(1);
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(545, doc.y).strokeColor("#999999").stroke();
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`University share: ${data.currency} ${data.universityShareDisplay}`, { align: "right" });
    doc.text(`Platform share: ${data.currency} ${data.platformShareDisplay}`, { align: "right" });
    doc.font("Helvetica-Bold").text(`Total: ${data.currency} ${data.totalDisplay}`, { align: "right" });

    // Page numbers, added last so bufferPages can report the final count.
    const pageCount = doc.bufferedPageRange().count;
    for (let index = 0; index < pageCount; index += 1) {
      doc.switchToPage(index);
      doc.fontSize(8).fillColor("#666666").text(
        `Page ${index + 1} of ${pageCount} — template v${data.templateVersion}`,
        PAGE_MARGIN,
        doc.page.height - 30,
        { align: "center", width: 545 - PAGE_MARGIN },
      );
    }

    doc.end();
  });
}
