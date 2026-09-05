/**
 * @fileoverview Renders a vendor invoice as a downloadable PDF.
 * @module lib/billing/invoicePdf
 */

import "server-only";

import PDFDocument from "pdfkit";

type InvoicePdfInput = {
  vendorName: string;
  invoiceId: string;
  periodStart: Date;
  periodEnd: Date;
  verificationCount: number;
  ratePerVerification: number;
  totalCents: number;
  status: string;
  dueDate: Date;
  paidAt: Date | null;
};

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatZar(cents: number) {
  return `R ${(cents / 100).toFixed(2)}`;
}

/** Builds a single-page PDF summarizing an invoice, suitable for a vendor's records. */
export function generateInvoicePdfBuffer(invoice: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("Verification Invoice", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#666666").text(`Invoice ${invoice.invoiceId}`);
    doc.moveDown(1.5);

    doc.fillColor("#000000").fontSize(12);
    doc.text(`Vendor: ${invoice.vendorName}`);
    doc.text(`Billing period: ${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`);
    doc.moveDown(1);

    doc.text(`Verifications: ${invoice.verificationCount}`);
    doc.text(`Rate per verification: ${formatZar(invoice.ratePerVerification)}`);
    doc.moveDown(0.5);
    doc.fontSize(14).text(`Total due: ${formatZar(invoice.totalCents)}`, { continued: false });
    doc.fontSize(12).moveDown(1);

    doc.text(`Due date: ${formatDate(invoice.dueDate)}`);
    doc.text(`Status: ${invoice.status}`);
    if (invoice.paidAt) {
      doc.text(`Paid on: ${formatDate(invoice.paidAt)}`);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#666666").text(
      "This invoice covers student credential verifications performed through the UNIFY vendor portal.",
    );

    doc.end();
  });
}
