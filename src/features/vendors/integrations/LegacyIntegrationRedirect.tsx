"use client";
import { useEffect } from "react";
import Link from "next/link";
import { legacyIntegrationDestination } from "@/lib/vendors/integrationNavigation";
export function LegacyIntegrationRedirect() {
  useEffect(() => { const url = window.location; const target = legacyIntegrationDestination(url.pathname, url.search, url.hash); if (target) window.location.replace(target); }, []);
  return <p role="status">Opening the matching integration section… <Link href="/vendor/integrations" className="underline">Open integrations</Link></p>;
}
