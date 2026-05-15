export const walletActivationRoute = "unifywallet://activate";
const activationPath = "/activate";

function defaultActivationBaseUrl() {
  return (
    process.env.ACTIVATION_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_ACTIVATION_PUBLIC_BASE_URL ??
    process.env.APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  );
}

function activationParams(token: string) {
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    throw new Error("Activation token is required.");
  }

  return new URLSearchParams({ token: trimmedToken });
}

export function buildWalletDeepLink(token: string) {
  return `${walletActivationRoute}?${activationParams(token).toString()}`;
}

export function buildWalletActivationLink(token: string, baseUrl = defaultActivationBaseUrl()) {
  const url = new URL(activationPath, baseUrl);
  url.search = activationParams(token).toString();
  return url.toString();
}

export function activationTokenFromUrl(activationUrl: string) {
  try {
    return new URL(activationUrl).searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}

export function toPublicWalletActivationLink(activationUrl: string, baseUrl = defaultActivationBaseUrl()) {
  const token = activationTokenFromUrl(activationUrl);
  return token ? buildWalletActivationLink(token, baseUrl) : activationUrl;
}
