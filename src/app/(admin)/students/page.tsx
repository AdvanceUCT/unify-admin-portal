import Link from "next/link";
import { Upload } from "lucide-react";
import { Suspense } from "react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getStudents } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { StudentSearch } from "@/features/students/StudentSearch";

export default async function StudentsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);
  const students = await getStudents();

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
      <Suspense>
        <StudentSearch initial={students} />
      </Suspense>
    </div>
  );
}