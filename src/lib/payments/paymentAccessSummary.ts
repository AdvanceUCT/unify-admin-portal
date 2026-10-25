/** Shared, serializable payment-access state. This module is safe in browser components. */
export const PAYMENT_ACCESS_ACKNOWLEDGEMENT = "I will use student transaction data only to process payments and will not store or share it beyond that.";
export type PayoutAccount = { reference: string; provider: string; accountHolderName: string | null; bankName: string | null; bankCode: string | null; accountMask: string | null };
export type AccessApplication = { id: string; status: string; submittedAt: string | null; reviewedAt: string | null; reviewNotes: string | null; revokedNotes: string | null; acknowledged: boolean; payoutReference: string | null; payoutProvider: string | null; payoutAccount: PayoutAccount | null };
export type AccessBranch = { id: string; name: string; address: string | null; active: boolean; status: string; acceptanceStatus: string | null; acceptanceReason: string | null; applications: AccessApplication[] };
export type AccessContext = { vendorApproved: boolean; walletEnabled: boolean; walletStatus: string | null; walletCurrency: string | null; paymentStatus: string | null; suspensionCode: string | null; suspensionReason: string | null; payoutAccount: PayoutAccount | null };
export type PaymentAccessData = { companyName: string; context: AccessContext; branches: AccessBranch[] };
export type AccessActionResult = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string; applicationId?: string; uncertain?: boolean; account?: PayoutAccount };
export type BankOption = { code: string; name: string };

/**
 * Derive the request label, next action and current payment blockers from shared server data.
 * Keep application approval separate from operational eligibility: an approved branch may still have paused payments.
 */
export function paymentAccessSummary(branch: AccessBranch, context: AccessContext) {
  const application = branch.applications[0] ?? null;
  const branchActive = branch.active && branch.status === "ACTIVE";
  const complete = Boolean(application?.acknowledged && application.payoutReference && application.payoutAccount);
  const needsReconfirmation = application?.status === "PENDING" && (!complete || application.payoutReference !== context.payoutAccount?.reference || application.payoutProvider !== context.payoutAccount?.provider);
  const approved = application?.status === "APPROVED" || branch.acceptanceStatus === "ACTIVE" || branch.acceptanceStatus === "SUSPENDED";
  const blockers: string[] = [];
  if (!context.vendorApproved) blockers.push("Vendor approval is no longer active.");
  if (!branchActive) blockers.push(branch.status === "PROVISIONING_FAILED" ? "Branch setup failed. Retry setup on the branch page." : "Activate this branch before requesting payment access.");
  if (!context.walletEnabled) blockers.push("Wallet payments are disabled by the university.");
  const paused = !context.vendorApproved ? "Vendor approval is no longer active." : !context.walletEnabled ? "Wallet payments are disabled by the university." : !branchActive ? "This branch is inactive." : context.paymentStatus === "SUSPENDED" ? context.suspensionReason || "Payments are suspended for this vendor." : context.paymentStatus !== "APPROVED" ? "The vendor payment profile needs administrator attention." : context.walletStatus !== "ACTIVE" || context.walletCurrency !== "ZAR" ? "The vendor wallet needs administrator attention." : branch.acceptanceStatus !== "ACTIVE" ? branch.acceptanceReason || "Payment acceptance is inactive for this branch." : null;
  const canSubmit = context.vendorApproved && branchActive && !approved && application?.status !== "PENDING" && Boolean(context.payoutAccount);
  const canReconfirm = context.vendorApproved && branchActive && Boolean(needsReconfirmation && context.payoutAccount);
  const canApprove = context.vendorApproved && context.walletEnabled && branchActive && application?.status === "PENDING" && complete && !needsReconfirmation;
  const requestLabel = needsReconfirmation ? "Review changes" : application?.status === "PENDING" ? "In review" : approved ? "Approved" : application?.status === "REJECTED" ? "Not approved" : application?.status === "REVOKED" ? "Access revoked" : application?.status === "WITHDRAWN" ? "Withdrawn" : "Not requested";
  return { application, approved, needsReconfirmation: Boolean(needsReconfirmation), canSubmit, canReconfirm, canApprove, requestLabel,
    paymentReady: approved && !paused, paused: approved ? paused : null, blockers,
    actionLabel: needsReconfirmation ? "Review changes" : application?.status === "PENDING" || application?.status === "REJECTED" ? "View request" : approved ? "View payment setup" : "Request access",
    recoveryHref: context.suspensionCode === "OVERDRAFT" ? "/vendor/payments/top-up" : "/vendor/help" };
}
