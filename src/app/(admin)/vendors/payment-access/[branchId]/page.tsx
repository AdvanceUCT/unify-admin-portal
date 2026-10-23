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
  return <PaymentAccessReview
    key={`${branch.id}:${branch.applications[0]?.status}`}
    companyName={data.companyName}
    branch={branch}
    context={data.context}
    history={history}
    approve={approvePaymentAccessAction}
    reject={rejectPaymentAccessAction}
    headerActions={branch.acceptanceStatus === "ACTIVE" ? <PaymentAccessRevokeButton action={revokeBranchPaymentAcceptanceAction} branchId={branch.id} branchName={branch.name} companyName={data.companyName} /> : null}
  />;
}
