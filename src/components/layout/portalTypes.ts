/**
 * @fileoverview Provides the reusable portal Types used by portal navigation and page chrome.
 * @module components/layout/portalTypes
 */

import type { NavIconName } from "@/components/layout/navIcons";

/**
 * Plain, serializable data — nav arrays are declared in server layouts and
 * consumed by client components, so no function references (see navIcons.ts).
 */
export type PortalNavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  /**
   * Sub-routes shown as a collapsible group under this item (e.g. Batch /
   * Individual under "Issue Credentials"). `href` on the parent is a route
   * prefix used for active-state matching only — it doesn't need a page of
   * its own, and the parent renders as a disclosure toggle rather than a
   * link when children are present. Children never get their own active
   * styling; only the parent lights up.
   */
  children?: PortalNavChild[];
};

export type PortalNavChild = {
  href: string;
  label: string;
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
