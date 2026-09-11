/**
 * @fileoverview Renders the authenticated administrator page at `/students`.
 * @module app/(admin)/students/page
 */

import { Suspense } from "react";
import { getStudents } from "@/lib/api/server";
import { requireRoleForRender } from "@/lib/auth/session";
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
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN", "ISSUER"]);
  const [students, params] = await Promise.all([
    getStudents(),
    searchParams,
  ]);
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
