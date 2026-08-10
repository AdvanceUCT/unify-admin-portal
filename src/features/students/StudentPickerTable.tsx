/**
 * @fileoverview Provides the selectable student table used by issuance workflows.
 * @module features/students/StudentPickerTable
 */

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { StatusText } from "@/components/ui/StatusText";
import type { StudentRecord } from "@/lib/api/types";
import { credentialStatusTone, formatCredentialStatus } from "@/lib/formatters";

const PAGE_SIZE = 10;

const selectClassName =
  "h-9 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-8 text-sm text-fg transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:w-52";

/**
 * The student directory table + search/filter toolbar, shared by the
 * Students page and the individual-issuance student picker — the two were
 * near-identical copies (same filtering logic, same table shape) that had
 * drifted slightly out of style with each other. `getStudentHref` and
 * `toolbarAction` are the only things that differ between call sites.
 */
export function StudentPickerTable({
  students,
  getStudentHref,
  toolbarAction,
}: {
  students: StudentRecord[];
  getStudentHref: (student: StudentRecord) => string;
  toolbarAction?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState("");
  const [programme, setProgramme] = useState("");
  const [page, setPage] = useState(1);

  const faculties = useMemo(
    () => [...new Set(students.map((student) => student.credential.faculty).filter(Boolean))].sort(),
    [students],
  );

  const programmes = useMemo(
    () =>
      [
        ...new Set(
          students
            .filter((student) => !faculty || student.credential.faculty === faculty)
            .map((student) => student.credential.programme),
        ),
      ].sort(),
    [faculty, students],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return students.filter((student) => {
      const fullName = `${student.profile.firstName} ${student.profile.lastName}`.toLowerCase();
      const matchesSearch =
        !normalizedQuery ||
        student.profile.firstName.toLowerCase().includes(normalizedQuery) ||
        student.profile.lastName.toLowerCase().includes(normalizedQuery) ||
        fullName.includes(normalizedQuery) ||
        student.credential.studentNumber.toLowerCase().includes(normalizedQuery);
      const matchesFaculty = !faculty || student.credential.faculty === faculty;
      const matchesProgramme = !programme || student.credential.programme === programme;

      return matchesSearch && matchesFaculty && matchesProgramme;
    });
  }, [faculty, programme, query, students]);

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
      {/* Primary action — kept out of the filter toolbar entirely so a
          growing filter set (e.g. the Clear button appearing) can never push
          it around. */}
      {toolbarAction ? <div className="flex justify-end">{toolbarAction}</div> : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4 shadow-md">
        {/* Search input */}
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name or student number..."
            value={query}
          />
        </div>

        {/* Faculty filter */}
        <div className="relative w-full sm:w-auto">
          <select
            className={selectClassName}
            onChange={(event) => {
              setFaculty(event.target.value);
              setProgramme("");
              setPage(1);
            }}
            value={faculty}
          >
            <option value="">All faculties</option>
            {faculties.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          />
        </div>

        {/* Programme filter */}
        <div className="relative w-full sm:w-auto">
          <select
            className={selectClassName}
            onChange={(event) => {
              setProgramme(event.target.value);
              setPage(1);
            }}
            value={programme}
          >
            <option value="">All programmes</option>
            {programmes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          />
        </div>

        {/* Clear filters */}
        {hasFilters ? (
          <button
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-sm font-medium text-fg-muted transition hover:bg-brand-50 hover:text-brand-700"
            onClick={clearFilters}
            type="button"
          >
            <X aria-hidden="true" className="size-3.5" />
            Clear
          </button>
        ) : null}
      </div>

      {/* Results count */}
      <p className="text-xs text-fg-subtle">
        Showing {visibleStart}-{visibleEnd} of {filtered.length} students
      </p>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="overflow-x-auto">
          {/*
            table-fixed pins each column to the widths below instead of the
            default "auto" layout, which resizes every column to fit whatever
            rows happen to be visible — with live client-side filtering that
            meant the header shifted on every keystroke as the result set
            changed. Widths are approximate, sized for typical content.
          */}
          <table className="w-full table-fixed text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="w-[28%] px-5 py-3 font-medium">Student</th>
                <th className="w-[22%] px-5 py-3 font-medium">Faculty</th>
                <th className="w-[30%] px-5 py-3 font-medium">Programme</th>
                <th className="w-[20%] px-5 py-3 font-medium">Credential</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={4}>
                    No students found{query ? ` for "${query}"` : ""}.
                  </td>
                </tr>
              ) : (
                pageStudents.map((student) => (
                  <tr className="transition hover:bg-surface-muted/60" key={student.profile.id}>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-center">
                        <Link
                          className="font-medium text-fg hover:text-brand-700 hover:underline"
                          href={getStudentHref(student)}
                        >
                          {student.profile.firstName} {student.profile.lastName}
                        </Link>
                        <p className="text-xs tabular-nums text-fg-subtle">
                          {student.credential.studentNumber}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-fg-muted">{student.credential.faculty}</td>
                    <td className="px-5 py-4 text-fg-muted">{student.credential.programme}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-3">
                        <StatusText tone={credentialStatusTone(student.credential.lifecycleState)}>
                          {formatCredentialStatus(student.credential.lifecycleState)}
                        </StatusText>
                        {student.credential.lifecycleState !== "NOT_ISSUED" && student.credential.schemaVersion ? (
                          <span className="font-semibold tabular-nums text-info-fg">
                            v{student.credential.schemaVersion}
                          </span>
                        ) : null}
                      </div>
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
          <p className="text-xs text-fg-subtle">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              <ChevronLeft aria-hidden className="size-4" />
              Previous
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
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
