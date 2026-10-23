import "server-only";
import { paymentAccessSummary } from "@/lib/payments/paymentAccessSummary";
import { prisma } from "@/lib/db/prisma";
import { listVendorApiCredentials } from "./integrations";
import { keyPresets } from "./integrationGuide";

export async function integrationOverview(vendorProfileId: string) {
  const [vendor, keys] = await Promise.all([
    prisma.vendorProfile.findUniqueOrThrow({ where: { id: vendorProfileId }, select: {
      defaultBranchId: true, walletAccount: { select: { status: true, currency: true } }, paymentProfile: { select: { status: true } }, webhookConfig: { select: { enabled: true } },
      branches: { orderBy: { name: "asc" }, select: { id: true, name: true, active: true, status: true, agentServicePointId: true, paymentAcceptance: { select: { status: true } } } },
      paymentWebhookConfigs: { where: { enabled: true }, select: { id: true, branchIds: true }, take: 1 },
    } }),
    listVendorApiCredentials(vendorProfileId),
  ]);
  const branches = vendor.branches.map(b => ({ id: b.id, name: b.name, active: b.active, status: b.status, paymentStatus: b.paymentAcceptance?.status ?? null, isDefault: b.id === vendor.defaultBranchId }));
  const eligibleBranches = branches.filter(b => b.active && b.status === "ACTIVE" && b.paymentStatus === "ACTIVE");
  const verificationBranch = vendor.branches.find(b => b.id === vendor.defaultBranchId);
  const verificationKey = keys.some(k => !k.revokedAt && keyPresets.verification.every(scope => k.scopes.includes(scope)) && (!k.branchIds.length || k.branchIds.includes(vendor.defaultBranchId ?? "")));
  const paymentKey = keys.some(k => !k.revokedAt && keyPresets.payments.every(scope => k.scopes.includes(scope)) && eligibleBranches.some(b => k.branchIds.includes(b.id)));
  const walletEnabled = (await prisma.universityProfile.findFirst({ select: { paymentWalletEnabled: true } }))?.paymentWalletEnabled ?? false;
  const paymentReady = branches.some(branch => paymentAccessSummary({ id: branch.id, name: branch.name, address: null, active: branch.active, status: branch.status, acceptanceStatus: branch.paymentStatus, acceptanceReason: null, applications: [] }, {
    vendorApproved: true, walletEnabled, walletStatus: vendor.walletAccount?.status ?? null, walletCurrency: vendor.walletAccount?.currency ?? null,
    paymentStatus: vendor.paymentProfile?.status ?? null, suspensionCode: null, suspensionReason: null, payoutAccount: null,
  }).paymentReady);
  return {
    branches,
    verification: { ready: Boolean(verificationBranch?.active && verificationBranch.status === "ACTIVE" && verificationBranch.agentServicePointId), key: verificationKey, callback: vendor.webhookConfig?.enabled ?? false },
    payments: { ready: paymentReady, key: paymentKey, callback: vendor.paymentWebhookConfigs.some(c => eligibleBranches.some(b => c.branchIds.includes(b.id))),
      reason: !walletEnabled ? "Wallet payments are disabled by the university." : vendor.paymentProfile?.status === "SUSPENDED" ? "Payments are suspended. Existing sale and refund recovery remains available." : vendor.paymentProfile?.status !== "APPROVED" ? "Your vendor payment application needs approval." : eligibleBranches.length === 0 ? "No active branch currently accepts payments." : !paymentReady ? "Your vendor wallet needs administrator attention." : null },
  };
}
