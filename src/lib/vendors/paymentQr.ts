/**
 * @fileoverview Generates the static campus payment QR code vendors display at their service point.
 * @module lib/vendors/paymentQr
 */

import "server-only";

import QRCode from "qrcode";

/**
 * The payload is static forever for a given vendor/service point: no amount,
 * no nonce. The student enters the amount and the wallet generates the nonce
 * at payment time, so this QR never needs to be reprinted.
 */
export async function generatePaymentQrSvg(vendorId: string, agentServicePointId: string) {
  const payload = JSON.stringify({
    type: "payment",
    vendorId,
    servicePointId: agentServicePointId,
  });
  return QRCode.toString(payload, { type: "svg", margin: 1 });
}
