import Link from "next/link";
import { requireApprovedVendorContextForRender } from "@/lib/vendors/context";
import { listPaymentRequests } from "@/lib/payments/paymentRequests";

export default async function PaymentRequestsPage({ searchParams }: { searchParams: Promise<{ cursor?: string; orderReference?: string }> }) {
  const { context } = await requireApprovedVendorContextForRender();
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.orderReference) query.set("orderReference", params.orderReference);
  const result = await listPaymentRequests({ id: context.vendorProfileId, branchIds: context.branchIds }, query);
  return <section className="space-y-5">
    <div className="flex justify-between"><h1 className="text-page-title">POS payment requests</h1><Link href="/vendor/payments">Payment history</Link></div>
    <form className="flex gap-3"><input aria-label="Exact order reference" name="orderReference" defaultValue={params.orderReference} placeholder="Exact order reference" className="rounded border border-border p-2" /><button type="submit">Find sale</button></form>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Order", "Branch", "Amount", "State", "Expires", "Receipt"].map((title) => <th key={title} className="border-b border-border p-3">{title}</th>)}</tr></thead><tbody>
      {result.items.map((item) => <tr key={item.id}><td className="border-b border-border p-3"><Link href={`/vendor/payment-requests/${item.id}`}>{item.orderReference}</Link></td><td>{item.branchName}</td><td>R{(item.amountMinor / 100).toFixed(2)}</td><td>{item.status}</td><td>{new Date(item.expiresAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}</td><td>{item.transactionId ?? "—"}</td></tr>)}
    </tbody></table></div>
    {!result.items.length && <p>No requests match this view.</p>}
    {result.nextCursor && <Link href={`?${new URLSearchParams({ ...params, cursor: result.nextCursor })}`}>Next page →</Link>}
  </section>;
}
