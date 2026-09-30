import { walletJson } from "@/lib/payments/walletApi";

export async function GET(_request: Request, _context: { params: Promise<{ qrIdentifier: string }> }) {
  return walletJson({ error: { code: "STATIC_PAYMENT_REMOVED", message: "Static payment QR codes are no longer supported. Ask the cashier for a POS sale QR." } }, { status: 410 });
}
