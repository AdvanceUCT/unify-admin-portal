const CALLBACK_URL_BASE = "http://unify-admin.local";

/**
 * Sanitizes a post-login callback URL to prevent open redirect attacks.
 * Uses a fake base URL to parse the input so relative paths are accepted,
 * then rejects anything whose origin doesn't match. Returns only the
 * pathname, search, and hash — never the origin.
 *
 * @param callbackUrl - The raw callback URL from query params or a cookie.
 * @param fallback - The path to return if the URL is missing or invalid.
 * @returns A safe relative path, or `fallback` if the URL is missing or invalid.
 */
export function sanitizeCallbackUrl(
  callbackUrl: string | null | undefined,
  fallback = "/",
) {
  if (!callbackUrl) {
    return fallback;
  }

  try {
    const url = new URL(callbackUrl, CALLBACK_URL_BASE);

    if (url.origin !== CALLBACK_URL_BASE) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
