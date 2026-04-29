import Link from "next/link";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { getStudents } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { formatCredentialStatus } from "@/lib/formatters";

export default async function StudentsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const students = await getStudents();

  return (
    <div className="space-y-6">
      <SectionHeader title="Students" description="Simulated student records available for credential operations." />
      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Programme</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Credential</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {students.map((student) => (
                <tr key={student.profile.id}>
                  <td className="px-5 py-4">
                    <Link className="font-medium text-zinc-950 hover:underline" href={`/students/${student.profile.id}`}>
                      {student.profile.name}
                    </Link>
                    <p className="text-xs text-zinc-500">{student.credential.studentNumber}</p>
                  </td>
                  <td className="px-5 py-4 text-zinc-600">{student.credential.programme}</td>
                  <td className="px-5 py-4 text-zinc-600">{student.credential.enrolmentStatus}</td>
                  <td className="px-5 py-4">
                    <Badge tone={student.credential.lifecycleState === "Active" ? "success" : "neutral"}>
                      {formatCredentialStatus(student.credential.lifecycleState)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
