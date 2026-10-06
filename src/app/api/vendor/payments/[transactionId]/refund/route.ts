import { refundAccess, refundJson } from "@/lib/vendors/refundOperationRoutes";
import { legacyRefundOperation } from "@/lib/vendors/refundOperations";
import { refundRegistrationSchema } from "@/lib/payments/refundOperationContract";
import { posErrorResponse } from "@/lib/payments/posErrors";

export async function POST(request: Request, context: { params: Promise<{ transactionId: string }> }) {
  try {
    const access = await refundAccess(request, false);
    const body = refundRegistrationSchema.parse(await request.json());
    const transactionId = (await context.params).transactionId;
    const op = await legacyRefundOperation(access, { target: { transactionId }, ...body });
    if (op.status !== "COMPLETED" || !op.result) return refundJson({ error: op.rejection ?? { code: "REFUND_CANCELLED", message: "This refund was cancelled." }, operation: op }, op.rejection?.status ?? 409);
    return refundJson({ ...op.result, operation: op });
  } catch (error) { return posErrorResponse(error); }
}
