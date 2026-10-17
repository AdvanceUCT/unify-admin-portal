import { notFound } from "next/navigation";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";
import { loadPaymentAccess } from "@/lib/payments/paymentAccess";
import { PaymentAccessPage } from "@/features/vendors/payment-access/PaymentAccessPage";
import { getPayoutBanksAction, savePaymentAccessPayoutAction, submitPaymentAccessAction } from "../../../payments/access/actions";
export default async function BranchPaymentAccessPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { context } = await requireVendorOwnerContextForRender();
  const { branchId } = await params;
  const data = await loadPaymentAccess(context.vendorProfileId);
  const branch = data.branches.find(branch => branch.id === branchId);
  if (!branch) notFound();
  return <PaymentAccessPage key={`${branch.id}:${data.context.payoutAccount?.reference}:${branch.applications[0]?.status}`} branch={branch} context={data.context} loadBanks={getPayoutBanksAction} saveAccount={savePaymentAccessPayoutAction} submitRequest={submitPaymentAccessAction} />;
}
