"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatCredentialStatus } from "@/lib/formatters";
import type { StudentRecord } from "@/lib/api/types";

const PAGE_SIZE = 10;

export function StudentSearch({ initial }: { initial: StudentRecord[] }) {
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState("");
  const [programme, setProgramme] = useState("");
  const [page, setPage] = useState(1);

  const faculties = useMemo(() =>
    [...new Set(initial.map((s) => s.credential.faculty).filter(Boolean))].sort(),
    [initial]
  );

  const programmes = useMemo(() =>
    [...new Set(
      initial
        .filter((s) => !faculty || s.credential.faculty === faculty)
        .map((s) => s.credential.programme)
    )].sort(),
    [initial, faculty]
  );

  const filtered = useMemo(() => {
    return initial.filter((s) => {
      const q = query.toLowerCase();
      const matchesSearch =
        !query.trim() ||
        s.profile.firstName.toLowerCase().includes(q) ||
        s.profile.lastName.toLowerCase().includes(q) ||
        `${s.profile.firstName} ${s.profile.lastName}`.toLowerCase().includes(q) ||
        s.credential.studentNumber.toLowerCase().includes(q);

      const matchesFaculty = !faculty || s.credential.faculty === faculty;
      const matchesProgramme = !programme || s.credential.programme === programme;

      return matchesSearch && matchesFaculty && matchesProgramme;
    });
  }, [query, faculty, programme, initial]);

  function clearFilters() {
    setQuery("");
    setFaculty("");
    setProgramme("");
    setPage(1);
  }

  const hasFilters = query || faculty || programme;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageStudents = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const visibleStart = filtered.length === 0 ? 0 : pageStart + 1;
  const visibleEnd = pageStart + pageStudents.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative w-72">
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
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or student number..."
            value={query}
          />
        </div>

        {/* Faculty filter */}
        <select
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none"
          onChange={(e) => {
            setFaculty(e.target.value);
            setProgramme("");
            setPage(1);
          }}
          value={faculty}
        >
          <option value="">All faculties</option>
          {faculties.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {/* Programme filter */}
        <select
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none"
          onChange={(e) => {
            setProgramme(e.target.value);
            setPage(1);
          }}
          value={programme}
        >
          <option value="">All programmes</option>
          {programmes.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <button
            className="h-9 rounded-md border border-zinc-300 px-3 text-sm text-zinc-600 transition hover:border-zinc-500 hover:text-zinc-950"
            onClick={clearFilters}
            type="button"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-zinc-500">
        Showing {visibleStart}-{visibleEnd} of {filtered.length} students
      </p>

      {/* Table */}
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
                pageStudents.map((student) => (
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
                      <Badge tone={student.credential.lifecycleState === "ISSUED" ? "success" : "neutral"}>
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

      {filtered.length > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              <ChevronLeft aria-hidden className="size-4" />
              Previous
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              type="button"
            >
              Next
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
