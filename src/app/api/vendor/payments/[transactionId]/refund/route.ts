import { refundAccess, refundJson } from "@/lib/vendors/refundOperationRoutes";
import { legacyRefundOperation } from "@/lib/vendors/refundOperations";
import { refundRegistrationSchema } from "@/lib/payments/refundOperationContract";
import { withRefundRequest } from "@/lib/payments/refundRequest";
import { refundStage } from "@/lib/payments/refundTrace";

export const maxDuration = 150;

export async function POST(request: Request, context: { params: Promise<{ transactionId: string }> }) {
  return withRefundRequest(request, "portal.compatibility", async () => {
    const access = await refundAccess(request, false);
    refundStage("registration.validation");
    const body = refundRegistrationSchema.parse(await request.json());
    const transactionId = (await context.params).transactionId;
    const op = await legacyRefundOperation(access, { target: { transactionId }, ...body });
    if (op.status !== "COMPLETED" || !op.result) return refundJson({ error: op.rejection ?? { code: "REFUND_CANCELLED", message: "This refund was cancelled." }, operation: op }, op.rejection?.status ?? 409);
    return refundJson({ ...op.result, operation: op });
  });
}
