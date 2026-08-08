import { cn } from "@/lib/cn";
import { toSafeImageSrc } from "@/lib/url";
import type { PortalBrandIdentity } from "@/components/layout/portalTypes";

function monogram(brandName: string): string {
  return brandName.trim().charAt(0).toUpperCase() || "U";
}

/**
 * Circular tenant logo + product wordmark, with the tenant name beneath it.
 * Rendered on the brand gradient, so all colours are the on-sidebar tokens.
 */
export function PortalBrand({
  brandName,
  className,
  logoUrl,
  tenantName,
}: PortalBrandIdentity & { className?: string }) {
  const safeLogoSrc = toSafeImageSrc(logoUrl);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {safeLogoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not compatible with next/image
        <img
          alt=""
          className="size-10 shrink-0 rounded-full border border-white/20 bg-white object-contain p-0.5"
          src={safeLogoSrc}
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-white/12 text-lg font-semibold text-sidebar-fg"
        >
          {monogram(brandName)}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-base font-semibold leading-tight tracking-tight text-sidebar-fg">
          {brandName}
        </p>
        <p className="truncate text-xs leading-tight text-sidebar-fg-subtle">{tenantName}</p>
      </div>
    </div>
  );
}
