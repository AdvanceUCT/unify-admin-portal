import { notFound } from "next/navigation";
import { requireRoleForRender } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { loadPaymentAccess, paymentAccessAccountHistory } from "@/lib/payments/paymentAccess";
import { PaymentAccessReview } from "@/features/vendors/payment-access/PaymentAccessReview";
import { PaymentAccessRevokeButton } from "../../PaymentAccessRevokeButton";
import { revokeBranchPaymentAcceptanceAction } from "../../actions";
import { approvePaymentAccessAction, rejectPaymentAccessAction } from "../actions";
export default async function BranchPaymentAccessReviewPage({ params }: { params: Promise<{ branchId: string }> }) {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN"]);
  const { branchId } = await params;
  const found = await prisma.vendorBranch.findUnique({ where: { id: branchId }, select: { vendorProfileId: true } });
  if (!found) notFound();
  const data = await loadPaymentAccess(found.vendorProfileId);
  const branch = data.branches.find(branch => branch.id === branchId);
  if (!branch) notFound();
  const history = await paymentAccessAccountHistory(branch.applications.map(application => application.id));
  return <div className="space-y-6"><PaymentAccessReview key={`${branch.id}:${branch.applications[0]?.status}`} companyName={data.companyName} branch={branch} context={data.context} history={history} approve={approvePaymentAccessAction} reject={rejectPaymentAccessAction} />
    {branch.acceptanceStatus === "ACTIVE" && <div className="mx-auto max-w-4xl border-t border-border pt-5"><PaymentAccessRevokeButton action={revokeBranchPaymentAcceptanceAction} branchId={branch.id} branchName={branch.name} companyName={data.companyName} /></div>}
  </div>;
}
