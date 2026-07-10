import Link from "next/link";
import { ClipboardList, RefreshCw, UserRoundCheck } from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { requireRole } from "@/lib/auth/session";

const issuanceOptions = [
  {
    description: "Preview eligible cohorts, generate activation offers, and review batch delivery history.",
    href: "/credentials/issuance/batch",
    icon: ClipboardList,
    title: "Batch issuance",
  },
  {
    description: "Search for a single student, inspect their credential state, and issue an activation offer.",
    href: "/credentials/issuance/individual",
    icon: UserRoundCheck,
    title: "Individual issuance",
  },
  {
    description: "Set the cadence issued credentials renew on automatically, or turn auto-renewal off.",
    href: "/credentials/issuance/renewals",
    icon: RefreshCw,
    title: "Renewal settings",
  },
];

export default async function IssuancePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  return (
    <div className="space-y-6">
      <SectionHeader title="Issue Credentials" description="Choose a batch or individual issuance workflow." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {issuanceOptions.map((option) => {
          const Icon = option.icon;

          return (
            <Link
              className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:bg-zinc-50"
              href={option.href}
              key={option.href}
            >
              <span className="grid size-10 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-700 group-hover:text-zinc-950">
                <Icon aria-hidden className="size-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-zinc-950">{option.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{option.description}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
