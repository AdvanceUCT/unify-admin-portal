import Link from "next/link";
import { ClipboardList, UserRoundCheck } from "lucide-react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { requireRole } from "@/lib/auth/session";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

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
];

export default async function IssuancePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);
  const profile = await getUniversityProfile();
  const activeSchema = profile ? await getActiveCredentialSchema(profile.id) : null;

  return (
    <div className="space-y-6">
      <SectionHeader title="Issue Credentials" description="Choose a batch or individual issuance workflow." />
      {!activeSchema ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Credential issuing requires an active schema.{" "}
          <Link className="font-medium underline underline-offset-2" href="/credentials/schemas">
            Configure credential schema
          </Link>
          .
        </div>
      ) : null}
      <section className="grid gap-4 md:grid-cols-2">
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
