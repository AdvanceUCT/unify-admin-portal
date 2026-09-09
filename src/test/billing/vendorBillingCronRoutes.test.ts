import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({ env: { CRON_SECRET: "test-cron-secret" } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/billing/jobLease", () => ({
  acquireJobLease: vi.fn(),
  completeJobLease: vi.fn(),
  failJobLease: vi.fn(),
}));
vi.mock("@/lib/billing/invoices", () => ({ runVendorInvoiceGeneration: vi.fn() }));
vi.mock("@/lib/billing/reconciliation", () => ({ runVendorBillingReconciliation: vi.fn() }));

import { GET as getVendorBilling } from "@/app/api/cron/vendor-billing/route";
import { GET as getVendorBillingReconcile } from "@/app/api/cron/vendor-billing-reconcile/route";
import { acquireJobLease, completeJobLease, failJobLease } from "@/lib/billing/jobLease";
import { runVendorInvoiceGeneration } from "@/lib/billing/invoices";
import { runVendorBillingReconciliation } from "@/lib/billing/reconciliation";

function authedRequest() {
  return new Request("http://localhost:3000/api/cron/vendor-billing", { headers: { authorization: "Bearer test-cron-secret" } });
}

describe("GET /api/cron/vendor-billing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a missing/wrong secret without touching any service", async () => {
    const response = await getVendorBilling(new Request("http://localhost:3000/api/cron/vendor-billing", { headers: { authorization: "Bearer wrong" } }));

    expect(response.status).toBe(401);
    expect(acquireJobLease).not.toHaveBeenCalled();
  });

  it("rejects a request with no authorization header at all", async () => {
    const response = await getVendorBilling(new Request("http://localhost:3000/api/cron/vendor-billing"));
    expect(response.status).toBe(401);
  });

  it("skips (202) without running anything when another run already holds the lease", async () => {
    vi.mocked(acquireJobLease).mockResolvedValue(null);

    const response = await getVendorBilling(authedRequest());

    expect(response.status).toBe(202);
    expect(runVendorInvoiceGeneration).not.toHaveBeenCalled();
    expect(runVendorBillingReconciliation).not.toHaveBeenCalled();
  });

  it("runs generation then reconciliation and completes the lease", async () => {
    vi.mocked(acquireJobLease).mockResolvedValue({ runId: "run-1", cursor: null });
    vi.mocked(runVendorInvoiceGeneration).mockResolvedValue({ vendorsScanned: 2, invoicesIssued: 1, zeroTotalInvoices: 0, skippedDisabled: false });
    vi.mocked(runVendorBillingReconciliation).mockResolvedValue({
      configured: true,
      attemptsSwept: 1,
      attemptsConfirmed: 1,
      attemptsStillUnresolved: 0,
      gatewayEventsRetried: 0,
      gatewayEventsRecovered: 0,
      gatewayEventsStillFailing: 0,
    });

    const response = await getVendorBilling(authedRequest());

    expect(response.status).toBe(200);
    expect(completeJobLease).toHaveBeenCalledWith({}, "run-1", expect.any(Object));
    expect(failJobLease).not.toHaveBeenCalled();
  });

  it("marks the lease FAILED and returns 500 when the job throws", async () => {
    vi.mocked(acquireJobLease).mockResolvedValue({ runId: "run-1", cursor: null });
    vi.mocked(runVendorInvoiceGeneration).mockRejectedValue(new Error("db down"));

    const response = await getVendorBilling(authedRequest());

    expect(response.status).toBe(500);
    expect(failJobLease).toHaveBeenCalledWith({}, "run-1", expect.any(Error));
    expect(completeJobLease).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/vendor-billing-reconcile", () => {
  beforeEach(() => vi.clearAllMocks());

  function authedReconcileRequest() {
    return new Request("http://localhost:3000/api/cron/vendor-billing-reconcile", { headers: { authorization: "Bearer test-cron-secret" } });
  }

  it("rejects a wrong secret", async () => {
    const response = await getVendorBillingReconcile(new Request("http://localhost:3000/x", { headers: { authorization: "Bearer wrong" } }));
    expect(response.status).toBe(401);
  });

  it("skips when another reconcile run already holds the lease", async () => {
    vi.mocked(acquireJobLease).mockResolvedValue(null);

    const response = await getVendorBillingReconcile(authedReconcileRequest());

    expect(response.status).toBe(202);
    expect(runVendorBillingReconciliation).not.toHaveBeenCalled();
  });

  it("runs the reconciliation sweep and completes the lease", async () => {
    vi.mocked(acquireJobLease).mockResolvedValue({ runId: "run-2", cursor: null });
    vi.mocked(runVendorBillingReconciliation).mockResolvedValue({
      configured: true,
      attemptsSwept: 3,
      attemptsConfirmed: 2,
      attemptsStillUnresolved: 1,
      gatewayEventsRetried: 0,
      gatewayEventsRecovered: 0,
      gatewayEventsStillFailing: 0,
    });

    const response = await getVendorBillingReconcile(authedReconcileRequest());

    expect(response.status).toBe(200);
    expect(completeJobLease).toHaveBeenCalledWith({}, "run-2", expect.any(Object));
  });

  it("marks the lease FAILED and returns 500 on an unexpected error", async () => {
    vi.mocked(acquireJobLease).mockResolvedValue({ runId: "run-2", cursor: null });
    vi.mocked(runVendorBillingReconciliation).mockRejectedValue(new Error("provider down"));

    const response = await getVendorBillingReconcile(authedReconcileRequest());

    expect(response.status).toBe(500);
    expect(failJobLease).toHaveBeenCalledWith({}, "run-2", expect.any(Error));
  });
});
