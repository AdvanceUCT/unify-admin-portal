import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getVendorPayoutDestinationSummary } from "./branchOnboarding";
import { PAYMENT_ACCESS_ACKNOWLEDGEMENT } from "./paymentAccessSummary";
import type { AccessApplication, AccessContext, PaymentAccessData, PayoutAccount } from "./paymentAccessSummary";

export function safePayoutAccount(value: unknown, reference: string | null, provider: string | null): PayoutAccount | null {
  if (!reference || !provider || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const text = (key: string) => typeof record[key] === "string" ? record[key] as string : null;
  return { reference, provider, accountHolderName: text("accountHolderName") ?? text("providerAccountName"), bankName: text("bankName"), bankCode: text("bankCode"), accountMask: text("accountMask") };
}

export async function loadPaymentAccess(vendorProfileId: string): Promise<PaymentAccessData> {
  const [vendor, university, destination] = await Promise.all([
    prisma.vendorProfile.findUniqueOrThrow({ where: { id: vendorProfileId }, select: {
      walletAccount: { select: { status: true, currency: true } }, companyName: true, applications: { where: { status: "APPROVED" }, take: 1, select: { id: true } },
      paymentProfile: { select: { status: true, suspensionCode: true, suspensionReason: true } },
      branches: { orderBy: { name: "asc" }, include: { paymentAcceptance: true, paymentApplications: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } } },
    } }),
    prisma.universityProfile.findMany({ take: 2, select: { paymentWalletEnabled: true } }),
    getVendorPayoutDestinationSummary(vendorProfileId),
  ]);
  const context: AccessContext = { vendorApproved: vendor.applications.length > 0, walletEnabled: university.length === 1 && university[0].paymentWalletEnabled,
    walletStatus: vendor.walletAccount?.status ?? null, walletCurrency: vendor.walletAccount?.currency ?? null, paymentStatus: vendor.paymentProfile?.status ?? null, suspensionCode: vendor.paymentProfile?.suspensionCode ?? null,
    suspensionReason: vendor.paymentProfile?.suspensionReason ?? null,
    payoutAccount: destination ? safePayoutAccount(destination.snapshot, destination.reference, destination.provider) : null };
  return { companyName: vendor.companyName, context, branches: vendor.branches.map(branch => ({ id: branch.id, name: branch.name, address: branch.address, active: branch.active, status: branch.status,
    acceptanceStatus: branch.paymentAcceptance?.status ?? null, acceptanceReason: branch.paymentAcceptance?.suspensionReason ?? null,
    applications: branch.paymentApplications.map((application): AccessApplication => ({ id: application.id, status: application.status, submittedAt: application.submittedAt?.toISOString() ?? null,
      reviewedAt: application.reviewedAt?.toISOString() ?? null, reviewNotes: application.reviewNotes, revokedNotes: application.revokedNotes,
      acknowledged: Boolean(application.studentDataAcknowledgedAt && application.studentDataAcknowledgementText === PAYMENT_ACCESS_ACKNOWLEDGEMENT),
      payoutReference: application.payoutDestinationReferenceSnapshot, payoutProvider: application.payoutProviderSnapshot,
      payoutAccount: safePayoutAccount(application.payoutDestinationSnapshot, application.payoutDestinationReferenceSnapshot, application.payoutProviderSnapshot) })) })) };
}

export async function paymentAccessAccountHistory(applicationIds: string[]) {
  if (!applicationIds.length) return [];
  const entries = await prisma.auditLog.findMany({ where: { targetType: "vendor_branch_payment_application", targetId: { in: applicationIds }, action: "VENDOR_BRANCH_PAYMENT_APPLICATION_SUBMITTED" }, orderBy: { createdAt: "asc" } });
  return entries.flatMap(entry => {
    const meta = entry.meta as Record<string, unknown> | null;
    if (meta?.kind !== "PAYOUT_RECONFIRMED") return [];
    const read = (key: string, referenceKey: string) => {
      try { const value = JSON.parse(String(meta[key])); return safePayoutAccount(value, typeof meta[referenceKey] === "string" ? meta[referenceKey] as string : null, typeof value?.provider === "string" ? value.provider : null); } catch { return null; }
    };
    return [{ id: entry.id, applicationId: entry.targetId, at: entry.createdAt.toISOString(), previous: read("previousSnapshot", "previousReference"), next: read("nextSnapshot", "nextReference") }];
  });
}
