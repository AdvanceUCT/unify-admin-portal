import { paymentAccessSummary } from "@/lib/payments/paymentAccessSummary";
import { PaymentAccessQueue, type AccessQueueItem } from "./PaymentAccessQueue";
export async function AdminPaymentAccessQueue() {
  const { prisma } = await import("@/lib/db/prisma");
  const { loadPaymentAccess } = await import("@/lib/payments/paymentAccess");
  const vendors = await prisma.vendorProfile.findMany({ where: { branches: { some: { paymentApplications: { some: {} } } } }, select: { id: true } });
  const data = await Promise.all(vendors.map(vendor => loadPaymentAccess(vendor.id)));
  const items: AccessQueueItem[] = data.flatMap(vendor => vendor.branches.filter(branch => branch.applications.length).map(branch => {
    const summary = paymentAccessSummary(branch, vendor.context);
    return { branchId: branch.id, branchName: branch.name, companyName: vendor.companyName, status: summary.application!.status, requestLabel: summary.requestLabel, submittedAt: summary.application!.submittedAt, needsReconfirmation: summary.needsReconfirmation, paused: Boolean(summary.paused) };
  })).sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  return <PaymentAccessQueue items={items} now={new Date().toISOString()} />;
}
