import { SectionHeader } from "@/components/layout/SectionHeader";
import { StudentsTable } from "@/features/students/StudentsTable";
import { getAdminState } from "@/lib/api/client";

export default async function StudentsPage() {
  const initialState = await getAdminState();

  return (
    <div className="space-y-6">
      <SectionHeader title="Students" description="Simulated student records available for credential operations." />
      <StudentsTable initialState={initialState} />
    </div>
  );
}
