/**
 * @fileoverview Provides the shared Icon Button UI primitive used across portal screens.
 * @module components/ui/IconButton
 */

import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";

const toneClassName = {
  neutral:
    "border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-muted hover:text-fg",
  ghost: "border-transparent bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg",
  onBrand:
    "border-white/15 bg-white/10 text-sidebar-fg hover:border-white/25 hover:bg-white/20",
};

/**
 * Square icon-only button. Requires an aria-label — there is no visible text.
 */
export function IconButton({
  children,
  className,
  ref,
  tone = "neutral",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /* React 19 passes ref as a plain prop — no forwardRef needed. */
  ref?: Ref<HTMLButtonElement>;
  tone?: keyof typeof toneClassName;
}) {
  return (
    <button
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-md border transition",
        "disabled:cursor-not-allowed disabled:opacity-60",
        toneClassName[tone],
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
