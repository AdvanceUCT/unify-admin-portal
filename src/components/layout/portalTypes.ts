import type { NavIconName } from "@/components/layout/navIcons";

/**
 * Plain, serializable data — nav arrays are declared in server layouts and
 * consumed by client components, so no function references (see navIcons.ts).
 */
export type PortalNavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

export type PortalUser = {
  name: string;
  email: string;
  image?: string | null;
  roleLabel: string;
};

export type PortalBrandIdentity = {
  /** Product wordmark, e.g. "Unify". */
  brandName: string;
  /** Tenant shown beneath the wordmark — university or vendor company name. */
  tenantName: string;
  /** Tenant logo; falls back to a monogram built from brandName. */
  logoUrl?: string | null;
};

/** Selects the accent palette. See the [data-portal] block in globals.css. */
export type PortalVariant = "admin" | "vendor";
