/**
 * @fileoverview Builds wallet deep links for service-point and checkout verification.
 * @module lib/verification/walletLink
 */

export function buildWalletVerificationLink(publicServicePointId: string) {
  const normalizedId = publicServicePointId.trim();
  if (!normalizedId) return undefined;
  return `unifywallet://verify/${encodeURIComponent(normalizedId)}`;
}

const CHECKOUT_VALUE = /^[A-Za-z0-9_-]+$/;
const CLAIM_TOKEN = /^[A-Za-z0-9_-]{20,256}$/;

export function buildWalletCheckoutVerificationLink(verificationRequestId: string, claimToken: string) {
  const normalizedId = verificationRequestId.trim();
  const normalizedToken = claimToken.trim();
  if (!CHECKOUT_VALUE.test(normalizedId) || !CLAIM_TOKEN.test(normalizedToken)) return undefined;

  return `unifywallet://verify/checkout/${encodeURIComponent(normalizedId)}?token=${encodeURIComponent(normalizedToken)}`;
}
