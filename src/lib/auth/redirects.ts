const CALLBACK_URL_BASE = "http://unify-admin.local";

export function sanitizeCallbackUrl(callbackUrl: string | null | undefined) {
  if (!callbackUrl) {
    return "/";
  }

  try {
    const url = new URL(callbackUrl, CALLBACK_URL_BASE);

    if (url.origin !== CALLBACK_URL_BASE) {
      return "/";
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
