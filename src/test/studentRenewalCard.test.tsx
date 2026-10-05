import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enrolment: vi.fn(), session: vi.fn(), student: vi.fn() }));
vi.mock("@/lib/credentials/renewalOverview", () => ({ studentRenewalEnrolment: mocks.enrolment }));
vi.mock("@/lib/auth/session", () => ({ requireRoleForRender: mocks.session }));
vi.mock("@/lib/api/server", () => ({ getStudentById: mocks.student, getActivationDeliveryByCredentialId: vi.fn() }));
vi.mock("@/features/students/StudentCredentialIssueView", () => ({ StudentCredentialIssueView: () => <section data-testid="credential-details">Credential details</section> }));
vi.mock("@/features/credentials/RenewalAction", () => ({ RenewalAction: ({ label }: {label: string}) => <button>{label}</button> }));
import { StudentCredentialDetailPage } from "@/features/students/StudentCredentialDetailPage";
beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { role: "ADMIN" } });
  mocks.student.mockResolvedValue({ profile: { id: "student-1" }, credential: { id: "credential-1", studentNumber: "ST-1" } });
  mocks.enrolment.mockResolvedValue({ id: "enrolment-1", status: "ACTIVE", finalYear: 2028, cancellations: [], records: [{ status: "SCHEDULED", dueAt: new Date("2027-01-31T22:00:00Z") }] });
});
afterEach(cleanup);
it("places a concise renewal card below existing student details", async () => {
  render(await StudentCredentialDetailPage({ studentId: "student-1", backHref: "/students", backLabel: "Back to students" }));
  const heading = screen.getByRole("heading", { name: "Auto-renewal" });
  expect(screen.getByTestId("credential-details").compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("01 Feb 2027")).toBeInTheDocument();
  expect(screen.getByText("2028")).toBeInTheDocument();
  expect(heading.closest("section")).toHaveClass("bg-surface", "shadow-md");
  expect(screen.getByRole("button", { name: "Cancel auto-renewal" })).toBeInTheDocument();
});
it("keeps cancellation audit history available and issuer access read-only", async () => {
  mocks.session.mockResolvedValue({ user: { role: "ISSUER" } });
  const enrolment = await mocks.enrolment();
  mocks.enrolment.mockResolvedValue({ ...enrolment, cancellations: [{ id: "old-enrolment", cancelledAt: new Date("2026-01-01T10:00:00Z"), cancelledBy: "admin-1", finalYear: 2026 }] });
  render(await StudentCredentialDetailPage({ studentId: "student-1", backHref: "/students", backLabel: "Back to students" }));
  expect(screen.getByText("Cancellation history")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel auto-renewal" })).not.toBeInTheDocument();
});
