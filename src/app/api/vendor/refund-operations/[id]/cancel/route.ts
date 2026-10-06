import { refundOperationItem } from "@/lib/vendors/refundOperationRoutes";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return refundOperationItem(request, false, (await context.params).id, "cancel");
}
