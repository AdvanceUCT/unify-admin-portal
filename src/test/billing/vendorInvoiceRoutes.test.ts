import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getInvoiceList } from "@/app/api/vendor/invoices/route";
import { GET as getInvoiceDetail } from "@/app/api/vendor/invoices/[invoiceId]/route";
import { GET as getInvoiceDownload } from "@/app/api/vendor/invoices/[invoiceId]/download/route";
import { getCurrentVendorSession } from "@/lib/auth/session";
import { getVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { getVendorInvoiceDocument, listVendorInvoices } from "@/lib/billing/invoiceQueries";
import { renderInvoicePdf } from "@/lib/billing/invoicePdf";

vi.mock("@/lib/auth/session", () => ({ getCurrentVendorSession: vi.fn() }));
vi.mock("@/lib/billing/vendorAuthorization", () => ({ getVendorInvoiceOwnerContext: vi.fn() }));
vi.mock("@/lib/billing/invoiceQueries", () => ({
  listVendorInvoices: vi.fn(),
  getVendorInvoiceDocument: vi.fn(),
}));
vi.mock("@/lib/billing/invoicePdf", () => ({ renderInvoicePdf: vi.fn() }));

const ownerSession = { user: { id: "owner-user", userType: "VENDOR" } } as Awaited<
  ReturnType<typeof getCurrentVendorSession>
>;
const ownerContext = { userId: "owner-user", vendorProfileId: "vendor-001", companyName: "Library Cafe" };

function params(invoiceId: string) {
  return { params: Promise.resolve({ invoiceId }) };
}

describe("GET /api/vendor/invoices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no vendor session", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(null);

    const response = await getInvoiceList();

    expect(response.status).toBe(401);
    expect(listVendorInvoices).not.toHaveBeenCalled();
  });

  it("returns 403 for staff (no active OWNER membership) instead of listing invoices", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(null);

    const response = await getInvoiceList();

    expect(response.status).toBe(403);
    expect(listVendorInvoices).not.toHaveBeenCalled();
  });

  it("returns the owner's own invoices only", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(listVendorInvoices).mockResolvedValue([
      { id: "invoice-1", invoiceNumber: "DEMO-2026-000001" } as never,
    ]);

    const response = await getInvoiceList();

    expect(response.status).toBe(200);
    expect(listVendorInvoices).toHaveBeenCalledWith("vendor-001");
    await expect(response.json()).resolves.toEqual({ invoices: [{ id: "invoice-1", invoiceNumber: "DEMO-2026-000001" }] });
  });
});

describe("GET /api/vendor/invoices/[invoiceId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated, not a redirect", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(null);

    const response = await getInvoiceDetail(new Request("http://localhost"), params("invoice-1"));

    expect(response.status).toBe(401);
    // A JSON auth failure, never an HTML sign-in redirect.
    expect(response.headers.get("location")).toBeNull();
  });

  it("returns 403 for a non-owner vendor user", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(null);

    const response = await getInvoiceDetail(new Request("http://localhost"), params("invoice-1"));

    expect(response.status).toBe(403);
    expect(getVendorInvoiceDocument).not.toHaveBeenCalled();
  });

  it("returns 404 for another vendor's invoice id rather than leaking its existence", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(getVendorInvoiceDocument).mockResolvedValue(null); // scoped query found nothing

    const response = await getInvoiceDetail(new Request("http://localhost"), params("someone-elses-invoice"));

    expect(response.status).toBe(404);
    expect(getVendorInvoiceDocument).toHaveBeenCalledWith("vendor-001", "someone-elses-invoice");
  });

  it("returns the invoice document for the owner's own invoice", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(getVendorInvoiceDocument).mockResolvedValue({
      id: "invoice-1",
      paymentStatus: "UNPAID",
      hasUnresolvedException: false,
      isPayable: true,
      document: { invoiceNumber: "DEMO-2026-000001" } as never,
    });

    const response = await getInvoiceDetail(new Request("http://localhost"), params("invoice-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "invoice-1", paymentStatus: "UNPAID" });
  });
});

describe("GET /api/vendor/invoices/[invoiceId]/download", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(null);

    const response = await getInvoiceDownload(new Request("http://localhost"), params("invoice-1"));

    expect(response.status).toBe(401);
    expect(renderInvoicePdf).not.toHaveBeenCalled();
  });

  it("returns 403 for staff", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(null);

    const response = await getInvoiceDownload(new Request("http://localhost"), params("invoice-1"));

    expect(response.status).toBe(403);
    expect(renderInvoicePdf).not.toHaveBeenCalled();
  });

  it("returns 404 for another vendor's invoice without rendering a PDF", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(getVendorInvoiceDocument).mockResolvedValue(null);

    const response = await getInvoiceDownload(new Request("http://localhost"), params("someone-elses-invoice"));

    expect(response.status).toBe(404);
    expect(renderInvoicePdf).not.toHaveBeenCalled();
  });

  it("streams a private, non-cached PDF attachment for the owner's own invoice", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(getVendorInvoiceDocument).mockResolvedValue({
      id: "invoice-1",
      paymentStatus: "UNPAID",
      hasUnresolvedException: false,
      isPayable: true,
      document: { invoiceNumber: "DEMO-2026-000001" } as never,
    });
    vi.mocked(renderInvoicePdf).mockResolvedValue(Buffer.from("%PDF-1.4 fake"));

    const response = await getInvoiceDownload(new Request("http://localhost"), params("invoice-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="DEMO-2026-000001.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });
});
