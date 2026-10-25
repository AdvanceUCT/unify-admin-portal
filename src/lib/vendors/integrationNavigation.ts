import { endpoints, integrationSteps } from "./integrationGuide";
export const verificationPath = "/vendor/integrations";
export const paymentsPath = "/vendor/integrations/payments";
/**
 * Map old guide/reference/webhook URLs to one canonical verification or payment workflow section.
 * Use shared endpoint and step definitions so old bookmarks do not introduce a second navigation structure.
 */
export function legacyIntegrationDestination(path: string, search = "", hash = "") {
  const params = new URLSearchParams(search);
  const fragment = hash.replace(/^#/, "");
  const endpoint = endpoints.find(item => item.id === fragment);
  if (path.endsWith("/reference")) return `${endpoint && endpoint.group !== "verification" ? paymentsPath : verificationPath}#${endpoint?.id ?? (fragment === "troubleshooting" ? fragment : "setup")}`;
  if (path.endsWith("/callbacks")) return `${params.get("type") === "payments" ? paymentsPath : verificationPath}#webhooks`;
  const guide = path.split("/guides/")[1];
  if (guide && !["verification", "payments", "refunds"].includes(guide)) return null;
  if (guide || path.endsWith("/guides")) {
    const target = guide === "payments" || guide === "refunds" ? paymentsPath : verificationPath;
    const group = guide === "refunds" ? "refunds" : guide === "payments" ? "payments" : "verification";
    const step = /^step-[1-9]\d*$/.test(fragment) && Number(fragment.slice(5)) <= integrationSteps[group].length ? fragment : null;
    return `${target}#${endpoint?.id ?? (step ? `${guide === "refunds" ? "refund-" : ""}${step}` : guide === "refunds" ? "refunds" : "setup")}`;
  }
  return null;
}
/**
 * Resolve a browser-only fragment, redirect hidden history anchors to Webhooks and open enclosing details.
 * Scroll and focus the section so a deep link is usable with the keyboard as well as visible on screen.
 */
export function revealIntegrationAnchor() {
  let id: string; try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
  if (id === "delivery-history") { id = "webhooks"; window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#webhooks`); }
  const target = document.getElementById(id);
  if (!target) return;
  let ancestor = target.parentElement;
  while (ancestor) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement; }
  target.scrollIntoView();
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}
