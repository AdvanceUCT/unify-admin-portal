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
      <SectionHeader title="Students" description="Simulated student records available for credential operations." />
      <Suspense>
        <StudentSearch initial={students} />
      </Suspense>
    </div>
  );
}