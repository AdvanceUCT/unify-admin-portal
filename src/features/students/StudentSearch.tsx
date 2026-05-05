"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatCredentialStatus } from "@/lib/formatters";
import type { StudentRecord } from "@/lib/api/types";

export function StudentSearch({ initial }: { initial: StudentRecord[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return initial;
    const q = query.toLowerCase();
    return initial.filter((s) =>
      s.profile.firstName.toLowerCase().includes(q) ||
      s.profile.lastName.toLowerCase().includes(q) ||
      `${s.profile.firstName} ${s.profile.lastName}`.toLowerCase().includes(q) ||
      s.credential.studentNumber.toLowerCase().includes(q)
    );
  }, [query, initial]);

  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-sm">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          fill="none"
          height="15"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="15"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or student number..."
          value={query}
        />
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Faculty</th>
                <th className="px-5 py-3 font-medium">Programme</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Credential</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center text-sm text-zinc-500" colSpan={5}>
                    No students found{query ? ` for "${query}"` : ""}.
                  </td>
                </tr>
              ) : (
                filtered.map((student) => (
                  <tr key={student.profile.id}>
                    <td className="px-5 py-4">
                      <Link className="font-medium text-zinc-950 hover:underline" href={`/students/${student.profile.id}`}>
                        {student.profile.firstName} {student.profile.lastName}
                      </Link>
                      <p className="text-xs text-zinc-500">{student.credential.studentNumber}</p>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{student.credential.faculty}</td>
                    <td className="px-5 py-4 text-zinc-600">{student.credential.programme}</td>
                    <td className="px-5 py-4 text-zinc-600">{student.credential.enrolmentStatus}</td>
                    <td className="px-5 py-4">
                      <Badge tone={student.credential.lifecycleState === "Active" ? "success" : "neutral"}>
                        {formatCredentialStatus(student.credential.lifecycleState)}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}