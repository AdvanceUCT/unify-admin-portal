import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { loadPaymentAccess } from "@/lib/payments/paymentAccess";
import { PaymentAccessOverview } from "@/features/vendors/payment-access/PaymentAccessOverview";
export default async function PaymentAccessOverviewPage() {
  const { context } = await requireVendorOwnerContextForRender();
  return <PaymentAccessOverview data={await loadPaymentAccess(context.vendorProfileId)} />;
}
