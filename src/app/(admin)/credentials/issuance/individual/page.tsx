import Link from "next/link";
import { Suspense } from "react";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { IndividualIssuanceSearch } from "@/features/credentials/IndividualIssuanceSearch";
import { getStudents } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function IndividualIssuancePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const students = await getStudents();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader title="Individual issue" description="Search for a student before issuing their credential." />
        <Link
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          href="/credentials/issuance"
        >
          Back to issuance
        </Link>
      </div>
      <Suspense>
        <IndividualIssuanceSearch students={students} />
      </Suspense>
    </div>
  );
}
