import { describe, expect, it } from "vitest";
import { paymentAccessSummary, type AccessBranch, type AccessContext } from "@/lib/payments/paymentAccessSummary";
export const account = { reference: "recipient-1", provider: "PAYSTACK", accountHolderName: "Campus Cafe", bankName: "Demo bank", bankCode: "001", accountMask: "•••• 1234" };
const context: AccessContext = { vendorApproved: true, walletEnabled: true, walletStatus: "ACTIVE", walletCurrency: "ZAR", paymentStatus: "APPROVED", suspensionCode: null, suspensionReason: null, payoutAccount: account };
const application = { id: "application", status: "PENDING", submittedAt: "2026-10-17T10:00:00Z", reviewedAt: null, reviewNotes: null, revokedNotes: null, acknowledged: true, payoutReference: account.reference, payoutProvider: account.provider, payoutAccount: account };
const branch: AccessBranch = { id: "branch", name: "Campus counter", address: "Main campus", active: true, status: "ACTIVE", acceptanceStatus: null, acceptanceReason: null, applications: [] };
describe("payment-access summary", () => {
  it("guides first and subsequent requests using the saved vendor account", () => {
    expect(paymentAccessSummary(branch, context)).toMatchObject({ requestLabel: "Not requested", canSubmit: true, actionLabel: "Set up" });
    expect(paymentAccessSummary(branch, { ...context, payoutAccount: null }).canSubmit).toBe(false);
  });
  it("distinguishes review from a changed or incomplete request", () => {
    const pending = { ...branch, applications: [application] };
    expect(paymentAccessSummary(pending, context)).toMatchObject({ requestLabel: "In review", canApprove: true, canSubmit: false });
    expect(paymentAccessSummary(pending, { ...context, payoutAccount: { ...account, reference: "new" } })).toMatchObject({ needsReconfirmation: true, canApprove: false, canReconfirm: true });
    expect(paymentAccessSummary({ ...pending, applications: [{ ...application, acknowledged: false }] }, context).needsReconfirmation).toBe(true);
  });
  it("keeps rejection feedback and revoked requests actionable", () => {
    for (const status of ["REJECTED", "REVOKED", "WITHDRAWN"]) expect(paymentAccessSummary({ ...branch, applications: [{ ...application, status }] }, context).canSubmit).toBe(true);
  });
  it("separates approval from payment readiness and retains overdraft recovery", () => {
    const approved = { ...branch, acceptanceStatus: "ACTIVE", applications: [{ ...application, status: "APPROVED" }] };
    expect(paymentAccessSummary(approved, context).paymentReady).toBe(true);
    expect(paymentAccessSummary(approved, { ...context, paymentStatus: "SUSPENDED", suspensionCode: "OVERDRAFT", suspensionReason: "Restore the negative balance." })).toMatchObject({ requestLabel: "Approved", paymentReady: false, paused: "Restore the negative balance.", recoveryHref: "/vendor/payments/top-up", canSubmit: false });
    for (const patch of [{ walletEnabled: false }, { vendorApproved: false }, { walletStatus: "CLOSED" }, { walletCurrency: "USD" }]) expect(paymentAccessSummary(approved, { ...context, ...patch }).paymentReady).toBe(false);
  });
  it("does not permit inactive or revoked vendors to submit or approve", () => {
    expect(paymentAccessSummary({ ...branch, active: false }, context).canSubmit).toBe(false);
    expect(paymentAccessSummary({ ...branch, applications: [application] }, { ...context, vendorApproved: false }).canApprove).toBe(false);
    expect(paymentAccessSummary({ ...branch, applications: [application] }, { ...context, walletEnabled: false }).canApprove).toBe(false);
  });
});
