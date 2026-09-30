import { walletJson } from "@/lib/payments/walletApi";

/** Retired static checkout endpoint. Historical receipt routes remain available. */
export async function POST(_request: Request) {
  return walletJson({ error: { code: "STATIC_PAYMENT_REMOVED", message: "Static payment QR codes are no longer supported. Ask the cashier for a POS sale QR." } }, { status: 410 });
}
