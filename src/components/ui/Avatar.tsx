import { cn } from "@/lib/cn";
import { toSafeImageSrc } from "@/lib/url";

const sizeClassName = {
  sm: "size-8 text-xs",
  md: "size-9 text-sm",
  lg: "size-11 text-base",
};

export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Avatar({
  className,
  imageUrl,
  name,
  size = "md",
}: {
  className?: string;
  imageUrl?: string | null;
  name: string;
  size?: keyof typeof sizeClassName;
}) {
  const safeSrc = toSafeImageSrc(imageUrl);

  if (safeSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external/signed avatar URL, not compatible with next/image
      <img
        alt=""
        className={cn(
          "shrink-0 rounded-full border border-border object-cover",
          sizeClassName[size],
          className,
        )}
        src={safeSrc}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700",
        sizeClassName[size],
        className,
      )}
    >
      {initialsFromName(name)}
    </span>
  );
}
