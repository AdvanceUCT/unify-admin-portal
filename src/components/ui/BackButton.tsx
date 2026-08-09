import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Standard "leave this flow" link — used at the top of a sub-step page
 * (individual issuance, a batch run, a student/vendor detail page) to return
 * to the page it was reached from. Always the first element in the page
 * body, on its own line, left-aligned — don't pair it inline with page
 * actions or push it into a toolbar.
 */
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-50 px-3 text-sm font-medium text-brand-700 transition hover:bg-brand-100"
      href={href}
    >
      <ChevronLeft aria-hidden="true" size={16} />
      {label}
    </Link>
  );
}
