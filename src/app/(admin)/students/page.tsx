import Link from "next/link";
import { Upload } from "lucide-react";
import { Suspense } from "react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getStudents } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { StudentSearch } from "@/features/students/StudentSearch";

function parseCount(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string | string[]; updated?: string | string[] }>;
}) {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);
  const students = await getStudents();
  const params = await searchParams;
  const imported = parseCount(params.imported);
  const updated = parseCount(params.updated);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader title="Students" description="Student records available for credential operations." />
        <Link
          className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          href="/students/import"
        >
          <Upload aria-hidden className="size-4" />
          Import CSV
        </Link>
      </div>
      {imported !== null && updated !== null ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Import complete: {imported} created, {updated} updated.
        </p>
      ) : null}
      <Suspense>
        <StudentSearch initial={students} />
      </Suspense>
    </div>
  );
}