export function usePathname() {
  const url = new URL(window.location.href); const screen = url.searchParams.get("screen");
  if (!screen || ["overview", "loading", "error"].includes(screen)) return url.pathname;
  return ["verification", "payments", "refunds"].includes(screen) ? `/vendor/integrations/guides/${screen}` : `/vendor/integrations/${screen}`;
}
