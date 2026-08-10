/**
 * @fileoverview Builds trusted absolute portal URLs from configured origins.
 * @module lib/url
 */

const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:", "blob:"]);

/**
 * Parses a value and returns its canonical form only if it's safe to use as an
 * `<img src>` — blocks `javascript:` and other dangerous schemes. Returns null
 * otherwise. The caller must render the *returned* value, not the original
 * input, so no unvalidated string ever reaches the DOM sink.
 */
export function toSafeImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!SAFE_IMAGE_PROTOCOLS.has(parsed.protocol)) return null;

  return parsed.href;
}
