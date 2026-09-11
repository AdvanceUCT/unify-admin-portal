/**
 * @fileoverview Server-only request helpers for calling internal portal APIs.
 * @module lib/api/server
 */

import "server-only";

import { mockBatchIssuancePreview } from "@/lib/api/mockData";
import type { ActivationDelivery, BatchIssuancePreview, StudentRecord } from "@/lib/api/types";
import { getRecentCredentialAuditActivityEvents } from "@/lib/credentials/audit";
import {
  getCredentialDeliveryByIssuanceId,
  getDashboardCredentialSummary,
  overlayCredentialStatusForStudent,
  overlayCredentialStatuses,
} from "@/lib/credentials/status";
import {
  getAllStudents,
  getStudentById as getStudentRecordById,
  getStudentProgrammesByFaculty,
  searchStudents,
} from "@/lib/students/repository";

export async function getDashboardSummary() {
  return getDashboardCredentialSummary();
}

export async function getRecentCredentialEvents() {
  return getRecentCredentialAuditActivityEvents(10);
}

export async function getActivationDeliveryByCredentialId(
  credentialId: string,
): Promise<ActivationDelivery | undefined> {
  return getCredentialDeliveryByIssuanceId(credentialId);
}

export async function getStudents(params?: { q?: string }): Promise<StudentRecord[]> {
  const query = params?.q?.trim();
  const students = query ? await searchStudents(query) : await getAllStudents();

  return overlayCredentialStatuses(students);
}

export async function getStudentById(studentId: string): Promise<StudentRecord | undefined> {
  const student = await getStudentRecordById(studentId);

  return student ? overlayCredentialStatusForStudent(student) : undefined;
}

export async function getInitialBatchIssuancePreview(): Promise<BatchIssuancePreview> {
  return mockBatchIssuancePreview;
}

export async function getProgrammesByFaculty(): Promise<Record<string, string[]>> {
  return getStudentProgrammesByFaculty();
}
