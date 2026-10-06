import { refundOperationItem } from "@/lib/vendors/refundOperationRoutes";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return refundOperationItem(request, false, (await context.params).id, "read");
}
