import { Suspense } from "react";
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
      {imported !== null && updated !== null ? (
        <p className="rounded-md border border-success-border bg-success-bg px-4 py-3 text-sm text-success-fg">
          Import complete: {imported} created, {updated} updated.
        </p>
      ) : null}
      <Suspense>
        <StudentSearch initial={students} />
      </Suspense>
    </div>
  );
}
