"use client";

import Link from "next/link";
import { Upload } from "lucide-react";

import { StudentPickerTable } from "@/features/students/StudentPickerTable";
import type { StudentRecord } from "@/lib/api/types";

export function StudentSearch({ initial }: { initial: StudentRecord[] }) {
  return (
    <StudentPickerTable
      getStudentHref={(student) => `/students/${student.profile.id}`}
      students={initial}
      toolbarAction={
        <Link
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
          href="/students/import"
        >
          <Upload aria-hidden className="size-4" />
          Import CSV
        </Link>
      }
    />
  );
}
