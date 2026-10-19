import type { ReactNode } from "react";
import { IntegrationNav } from "./IntegrationNav";
export function IntegrationRouteShell({ children }: { children: ReactNode }) {
  return <div className="min-w-0 space-y-7 rounded-lg border border-border bg-surface p-4 text-base leading-relaxed text-fg sm:p-8">
    <header><h1 className="text-[2rem] font-bold leading-10 tracking-tight">Integrations</h1><p className="mt-2 text-fg-muted">Connect your website or POS to UNIFY.</p></header>
    <IntegrationNav />{children}
  </div>;
}
