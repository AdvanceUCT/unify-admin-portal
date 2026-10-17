import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentAccessPage } from "@/features/vendors/payment-access/PaymentAccessPage";
import { PaymentAccessReview } from "@/features/vendors/payment-access/PaymentAccessReview";
import type { AccessBranch, AccessContext } from "@/lib/payments/paymentAccessSummary";
const account = { reference: "recipient", provider: "PAYSTACK", accountHolderName: "Campus cafe", bankName: "Demo bank", bankCode: "001", accountMask: "•••• 1234" };
const context: AccessContext = { vendorApproved: true, walletEnabled: true, walletStatus: "ACTIVE", walletCurrency: "ZAR", paymentStatus: "APPROVED", suspensionCode: null, suspensionReason: null, payoutAccount: account };
const application = { id: "application", status: "PENDING", submittedAt: "2026-10-17T10:00:00Z", reviewedAt: null, reviewNotes: null, revokedNotes: null, acknowledged: true, payoutReference: account.reference, payoutProvider: account.provider, payoutAccount: account };
const branch: AccessBranch = { id: "branch", name: "Campus counter", address: "Campus", active: true, status: "ACTIVE", acceptanceStatus: null, acceptanceReason: null, applications: [] };
const actions = { saveAccount: vi.fn(), loadBanks: vi.fn(async () => ({ banks: [{ code: "001", name: "Demo bank" }] })), submitRequest: vi.fn() };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("payment-access screens", () => {
  it("shows a pending request without redirecting or offering duplicate submission", () => {
    render(<PaymentAccessPage branch={{ ...branch, applications: [application] }} context={context} {...actions} />);
    expect(screen.getByText("In review")).toBeVisible(); expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
  });
  it("keeps rejected feedback and saved bank details ready for resubmission", () => {
    render(<PaymentAccessPage branch={{ ...branch, applications: [{ ...application, status: "REJECTED", reviewNotes: "Update location" }] }} context={context} {...actions} />);
    expect(screen.getByText("Update location")).toBeVisible(); expect(screen.getByRole("button", { name: "Update and resubmit" })).toBeEnabled(); expect(screen.queryByLabelText("Account number")).not.toBeInTheDocument();
  });
  it("retains an unknown submission and does not retry automatically", async () => {
    actions.submitRequest.mockRejectedValueOnce(new Error("offline"));
    render(<PaymentAccessPage branch={branch} context={context} {...actions} />);
    fireEvent.submit(screen.getByRole("form", { name: "Submit payment-access request" }));
    await screen.findByRole("button", { name: "Reload request status" });
    expect(actions.submitRequest).toHaveBeenCalledTimes(1); expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
  });
  it("blocks admin approval until owner confirmation and requires a rejection reason", async () => {
    render(<PaymentAccessReview companyName="Cafe" branch={{ ...branch, applications: [application] }} context={{ ...context, payoutAccount: { ...account, reference: "changed" } }} history={[]} approve={vi.fn()} reject={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Approve branch" })).toBeDisabled(); fireEvent.click(screen.getByText("Reject request")); await waitFor(() => expect(screen.getByLabelText("Reason shown to vendor")).toBeRequired());
  });
});
