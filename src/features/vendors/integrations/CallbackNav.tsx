import Link from "next/link";
export function CallbackNav({ kind }: { kind: "verification" | "payments" }) {
  return <nav aria-label="Callback type" className="flex flex-wrap gap-4 text-sm">{(["verification", "payments"] as const).map(type => <Link key={type} href={`/vendor/integrations/callbacks?type=${type}`} aria-current={kind === type ? "page" : undefined} className={kind === type ? "font-medium text-brand-600 underline" : "text-fg-muted underline"}>{type === "verification" ? "Verification results" : "Payment and refund events"}</Link>)}</nav>;
}
