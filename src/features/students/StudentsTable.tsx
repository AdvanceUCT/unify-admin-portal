"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { useAdminState } from "@/lib/api/useAdminState";
import type { AdminState } from "@/lib/api/types";
import { credentialStatusTone, formatCredentialStatus } from "@/lib/formatters";

export function StudentsTable({ initialState }: { initialState: AdminState }) {
  const { error, state } = useAdminState({ initialState });
  const students = state?.students ?? initialState.students;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      {error ? <p className="border-b border-zinc-200 px-5 py-3 text-sm text-amber-700">{error}</p> : null}
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
                    {student.profile.firstName} {student.profile.lastName}
                  </Link>
                  <p className="text-xs text-zinc-500">{student.credential.studentNumber}</p>
                </td>
                <td className="px-5 py-4 text-zinc-600">{student.credential.programme}</td>
                <td className="px-5 py-4 text-zinc-600">{student.credential.enrolmentStatus}</td>
                <td className="px-5 py-4">
                  <Badge tone={credentialStatusTone(student.credential.lifecycleState)}>
                    {formatCredentialStatus(student.credential.lifecycleState)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
