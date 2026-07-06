import "server-only";

import type { Student } from "@/generated/prisma/client";
import type { StudentRecord } from "@/lib/api/types";
import { prisma } from "@/lib/db/prisma";
import { getUniversityProfile } from "@/lib/university/profile";

const DEFAULT_CREDENTIAL_VALIDITY_DAYS = 365;

function attributesRecord(attributes: Student["attributes"]): Record<string, string | undefined> {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(attributes as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === "string" ? value : value == null ? undefined : String(value),
    ]),
  );
}

function expiresAtFrom(createdAt: Date) {
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_CREDENTIAL_VALIDITY_DAYS);
  return expiresAt.toISOString();
}

function toStudentRecord(student: Student, institution: string): StudentRecord {
  const attributes = attributesRecord(student.attributes);

  return {
    profile: {
      email: student.email,
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      institution,
    },
    credential: {
      id: student.id,
      holderName: `${student.firstName} ${student.lastName}`,
      issuer: institution,
      faculty: attributes.faculty,
      programme: attributes.programme ?? "",
      lifecycleState: "NOT_ISSUED",
      studentNumber: student.studentNumber,
      validFrom: student.createdAt.toISOString(),
      expiresAt: expiresAtFrom(student.createdAt),
      attributes,
    },
  };
}

async function institutionName(): Promise<string> {
  const profile = await getUniversityProfile();
  return profile?.name ?? "";
}

export async function getAllStudents(): Promise<StudentRecord[]> {
  const [students, institution] = await Promise.all([
    prisma.student.findMany({ orderBy: { lastName: "asc" } }),
    institutionName(),
  ]);
  return students.map((student) => toStudentRecord(student, institution));
}

export async function getStudentById(id: string): Promise<StudentRecord | undefined> {
  const [student, institution] = await Promise.all([
    prisma.student.findUnique({ where: { id } }),
    institutionName(),
  ]);
  return student ? toStudentRecord(student, institution) : undefined;
}

function matchesQuery(student: Student, normalizedQuery: string) {
  const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
  return [student.firstName, student.lastName, fullName, student.email, student.studentNumber].some((value) =>
    value.toLowerCase().includes(normalizedQuery),
  );
}

export async function searchStudents(query: string): Promise<StudentRecord[]> {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return getAllStudents();
  }

  const [students, institution] = await Promise.all([
    prisma.student.findMany({ orderBy: { lastName: "asc" } }),
    institutionName(),
  ]);
  return students
    .filter((student) => matchesQuery(student, normalizedQuery))
    .map((student) => toStudentRecord(student, institution));
}
