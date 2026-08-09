type ClassValue = string | false | null | undefined;

/**
 * Joins class names, dropping falsy values. Dependency-free — the project does
 * not use clsx or tailwind-merge. There is no conflict resolution, so avoid
 * passing two competing utilities for the same property; use the object-lookup
 * variant pattern (see components/ui/Badge.tsx) instead.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
