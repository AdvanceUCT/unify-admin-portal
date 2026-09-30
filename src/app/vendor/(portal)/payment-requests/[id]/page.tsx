import Link from "next/link";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import { getMerchantPaymentRequest } from "@/lib/payments/paymentRequests";
export default async function PaymentRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { context } = await requireApprovedVendorContextForRender();
  const record = await getMerchantPaymentRequest({ id: context.vendorProfileId, branchIds: context.branchIds }, (await params).id);
  return <section className="space-y-5"><Link href="/vendor/payment-requests">← Payment requests</Link><h1 className="text-page-title">{record.orderReference}</h1>
    <dl className="space-y-3">{Object.entries({ Branch: record.branchName, Amount: `R${(record.amountMinor / 100).toFixed(2)}`, Status: record.status, Created: record.createdAt, Expires: record.expiresAt, Completed: record.completedAt ?? "—", Transaction: record.transactionId ?? "—" }).map(([label, value]) => <div key={label} className="flex gap-6"><dt className="w-28 text-fg-subtle">{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}
