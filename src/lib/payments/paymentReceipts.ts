import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getMobileWalletBalance } from "./walletMobile";
import { PosApiError } from "./posErrors";

export async function getPayerPaymentReceipt(studentId: string, lookup: { transactionId: string } | { idempotencyKey: string }) {
  const transaction = await prisma.walletTransaction.findFirst({
    where: { type: "SPEND", status: "COMPLETED", initiatorAccount: { studentId }, ...("transactionId" in lookup ? { id: lookup.transactionId } : { idempotencyKey: lookup.idempotencyKey }) },
    include: { vendorBranch: { include: { vendorProfile: { select: { companyName: true } } } } },
  });
  if (!transaction?.completedAt || !transaction.vendorBranch) {
    if ("idempotencyKey" in lookup) return { status: "NOT_RECORDED" as const };
    throw new PosApiError("RECEIPT_NOT_FOUND", "Payment receipt was not found.", 404);
  }
  const balance = await getMobileWalletBalance(studentId);
  return {
    status: "COMPLETED" as const, transactionId: transaction.id, amountMinor: Number(transaction.amountMinor), currency: "ZAR" as const,
    vendorBranchId: transaction.vendorBranchId, vendorName: transaction.vendorBranch.vendorProfile.companyName, branchName: transaction.vendorBranch.name,
    orderReference: transaction.reference, completedAt: transaction.completedAt.toISOString(), resultingBalanceMinor: balance.postedBalanceMinor,
  };
}
