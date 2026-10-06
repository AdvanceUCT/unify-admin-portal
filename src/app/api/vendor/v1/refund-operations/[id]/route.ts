import { refundOperationItem } from "@/lib/vendors/refundOperationRoutes";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return refundOperationItem(request, true, (await context.params).id, "read");
}
