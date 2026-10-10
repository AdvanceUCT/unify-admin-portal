"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IntegrationNav } from "./IntegrationNav";

/** The tabbed landing page has its own heading; retain navigation on existing deep links. */
export function IntegrationRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.replace(/\/$/, "") === "/vendor/integrations")
    return <>{children}</>;
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-page-title text-fg">Integrations</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Connect your website or till to UNIFY.
        </p>
      </header>
      <IntegrationNav />
      {children}
    </div>
  );
}
