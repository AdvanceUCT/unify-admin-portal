"use client";

import { StudentPickerTable } from "@/features/students/StudentPickerTable";
import type { StudentRecord } from "@/lib/api/types";

export function IndividualIssuanceSearch({ students }: { students: StudentRecord[] }) {
  return (
    <StudentPickerTable
      getStudentHref={(student) => `/credentials/issuance/individual/${student.profile.id}`}
      students={students}
    />
  );
}
