import { PortalChrome } from "@/components/layout/PortalChrome";
import type {
  PortalBrandIdentity,
  PortalNavItem,
  PortalUser,
  PortalVariant,
} from "@/components/layout/portalTypes";

export type {
  PortalBrandIdentity,
  PortalNavItem,
  PortalUser,
  PortalVariant,
} from "@/components/layout/portalTypes";

/**
 * Shared chrome for the admin and vendor portals.
 *
 * This component's only jobs are to set the page canvas and to declare which
 * accent palette is in play — `data-portal` is what the [data-portal] block in
 * globals.css keys off, so the vendor portal re-themes without any component
 * taking a colour prop. Everything interactive lives in PortalChrome.
 */
export function PortalShell({
  brand,
  children,
  fallbackTitle,
  navItems,
  portal,
  settingsHref,
  settingsLabel,
  signOutRedirectTo,
  status,
  user,
}: {
  brand: PortalBrandIdentity;
  children: React.ReactNode;
  fallbackTitle: string;
  navItems: PortalNavItem[];
  portal: PortalVariant;
  settingsHref: string;
  settingsLabel?: string;
  signOutRedirectTo?: string;
  /** Portal-specific header status slot. */
  status?: React.ReactNode;
  user: PortalUser;
}) {
  return (
    <div className="min-h-screen bg-canvas text-fg" data-portal={portal}>
      <PortalChrome
        brand={brand}
        fallbackTitle={fallbackTitle}
        navItems={navItems}
        settingsHref={settingsHref}
        settingsLabel={settingsLabel}
        signOutRedirectTo={signOutRedirectTo}
        status={status}
        user={user}
      >
        {children}
      </PortalChrome>
    </div>
  );
}
