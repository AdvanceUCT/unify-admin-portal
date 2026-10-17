import { endpoints } from "./integrationGuide";
export const verificationPath = "/vendor/integrations";
export const paymentsPath = "/vendor/integrations/payments";
export function legacyIntegrationDestination(path: string, search = "", hash = "") {
  const params = new URLSearchParams(search);
  const fragment = hash.replace(/^#/, "");
  const endpoint = endpoints.find(item => item.id === fragment);
  if (path.endsWith("/reference")) return `${endpoint && endpoint.group !== "verification" ? paymentsPath : verificationPath}#${endpoint?.id ?? (fragment === "troubleshooting" ? fragment : "setup")}`;
  if (path.endsWith("/callbacks")) return `${params.get("type") === "payments" ? paymentsPath : verificationPath}#${fragment === "delivery-history" ? fragment : "webhooks"}`;
  const guide = path.split("/guides/")[1];
  if (guide && !["verification", "payments", "refunds"].includes(guide)) return null;
  if (guide || path.endsWith("/guides")) {
    const target = guide === "payments" || guide === "refunds" ? paymentsPath : verificationPath;
    const step = /^step-[1-9]\d*$/.test(fragment) ? fragment : null;
    return `${target}#${endpoint?.id ?? (step ? `${guide === "refunds" ? "refund-" : ""}${step}` : guide === "refunds" ? "refunds" : "setup")}`;
  }
  return null;
}
export function revealIntegrationAnchor() {
  let id: string; try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (!target) return;
  let ancestor = target.parentElement;
  while (ancestor) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement; }
  target.scrollIntoView();
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}
