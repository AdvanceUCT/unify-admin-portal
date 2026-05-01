const walletActivationRoute = "unifywallet://activate";

export function buildWalletActivationLink(token: string) {
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    throw new Error("Activation token is required.");
  }

  const params = new URLSearchParams({ token: trimmedToken });
  return `${walletActivationRoute}?${params.toString()}`;
}
