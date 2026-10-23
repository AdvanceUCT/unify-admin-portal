import { expect, it, vi } from "vitest";
import PDFDocument from "pdfkit";
import { renderInvoicePdf } from "@/lib/billing/invoicePdf";
it("prints the SAST issue date when the UTC timestamp is on the previous year", async () => {
  const text = vi.spyOn(PDFDocument.prototype, "text");
  try {
    const pdf = await renderInvoicePdf({ invoiceNumber: "SYNTHETIC", isDemo: true, documentStatus: "ISSUED", paymentStatus: "UNPAID", issuedAtIso: "2026-12-31T22:30:00Z", dueAtIso: null, periodLabel: "December 2026", currency: "ZAR", issuer: { name: "Synthetic University", abbreviation: "SU", contactEmail: "synthetic@example.test" }, customer: { companyName: "Synthetic Vendor", contactEmail: "vendor@example.test" }, items: [], totalDisplay: "0.00", platformShareDisplay: "0.00", universityShareDisplay: "0.00", templateVersion: 1 });
    expect(pdf.length).toBeGreaterThan(0);
    expect(text).toHaveBeenCalledWith("Issued: 2027-01-01");
  } finally { text.mockRestore(); }
});
