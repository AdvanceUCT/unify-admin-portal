export function buildWalletVerificationLink(publicServicePointId: string) {
  const normalizedId = publicServicePointId.trim();
  if (!normalizedId) return undefined;
  return `unifywallet://verify/${encodeURIComponent(normalizedId)}`;
}
