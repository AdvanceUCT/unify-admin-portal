import { refundOperationCollection } from "@/lib/vendors/refundOperationRoutes";
export const GET = (request: Request) => refundOperationCollection(request, false);
export const POST = (request: Request) => refundOperationCollection(request, false);
