import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  session: vi.fn(),
  redirect: vi.fn(),
  programmes: vi.fn(),
}));
vi.mock("@/lib/credentials/renewalOverview", () => ({
  renewalOverview: mocks.overview,
}));
vi.mock("@/lib/students/repository", () => ({ getStudentProgrammesByFaculty: mocks.programmes }));
vi.mock("@/lib/auth/session", () => ({ requireRoleForRender: mocks.session }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  usePathname: () => "/credentials/issuance/renewals",
  useRouter: () => ({ refresh: vi.fn() }),
}));
import RenewalsPage from "@/app/(admin)/credentials/issuance/renewals/page";
import LegacyRenewalsPage from "@/app/(admin)/credentials/renewals/page";
import IssuanceLayout from "@/app/(admin)/credentials/issuance/layout";

const dueAt = new Date("2027-01-31T22:00:00Z"),
  expiresAt = new Date("2027-11-30T22:00:00Z");
const record = {
  id: "renewal-1",
  academicYear: 2027,
  dueAt,
  expiresAt,
  remainingYears: 2,
  status: "SCHEDULED",
  suspended: false,
  lastError: null,
  attemptCount: 0,
  attempts: [],
  deliveredAt: null,
  activatedAt: null,
  enrolmentId: "enrolment-1",
  enrolment: { status: "ACTIVE", studentId: "ST-1" },
  student: {
    id: "student-1",
    firstName: "Ada",
    lastName: "Student",
    studentNumber: "ST-1",
    faculty: "Science",
    programme: "Computer Science",
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.programmes.mockResolvedValue({ Science: ["Computer Science"], Arts: ["History"] });
  mocks.session.mockResolvedValue({ user: { role: "ADMIN" } });
  mocks.overview.mockResolvedValue({
    asOf: new Date("2026-10-03T10:00:00Z"),
    page: 1,
    total: 1,
    counts: { SCHEDULED: 10, NEEDS_ATTENTION: 2 },
    overdue: 0,
    periods: [
      { academicYear: 2027, dueAt, expiresAt, status: "SCHEDULED", count: 10 },
    ],
    records: [record],
    runs: [],
    lastCompleted: null,
    stale: true,
  });
});
afterEach(cleanup);

it("opens an operations summary without displaying student rows", async () => {
  render(await RenewalsPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.overview).toHaveBeenCalledWith({ view: "summary" });
  expect(screen.getByText("Queued renewal periods")).toBeInTheDocument();
  expect(screen.getByText("Academic year 2027")).toBeInTheDocument();
  expect(screen.queryByText("Daily processing")).not.toBeInTheDocument();
  expect(screen.queryByText("Awaiting activation")).not.toBeInTheDocument();
  expect(screen.queryByText("Ada Student")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Academic year 2027/ })).toHaveAttribute(
    "href",
    `/credentials/issuance/renewals?${new URLSearchParams({view: "upcoming", year: "2027", periodStart: dueAt.toISOString(), periodExpiry: expiresAt.toISOString()})}`,
  );
});
it("shows filtered student records only after opening the queue", async () => {
  render(
    await RenewalsPage({
      searchParams: Promise.resolve({ view: "upcoming", year: "2027", periodStart: dueAt.toISOString(), periodExpiry: expiresAt.toISOString() }),
    }),
  );
  expect(mocks.overview).toHaveBeenCalledWith({
    view: "upcoming",
    year: "2027",
    periodStart: dueAt.toISOString(),
    periodExpiry: expiresAt.toISOString(),
  });
  expect(screen.getByText("Ada Student")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Faculty" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Programme" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Renewal status" })).toBeInTheDocument();
  expect(screen.getByText(/01 Feb 2027 - 30 Nov 2027/)).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Period" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Academic year" })).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Programme" })).toBeInTheDocument();
  expect(screen.getByText("Ada Student").parentElement).toHaveClass("flex", "flex-col", "items-center");
  expect(screen.getByText("ST-1").parentElement).toBe(screen.getByText("Ada Student").parentElement);
  expect(
    screen.getByRole("button", { name: "Cancel" }),
  ).toBeInTheDocument();
});
it("keeps issuer drill-down views read-only", async () => {
  mocks.session.mockResolvedValue({ user: { role: "ISSUER" } });
  render(
    await RenewalsPage({ searchParams: Promise.resolve({ view: "history" }) }),
  );
  expect(screen.getByText("Ada Student")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancel" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("View only")).toBeInTheDocument();
});
it("does not render parent issuance tabs on the actual pages", () => {
  render(<IssuanceLayout><p>Issuance content</p></IssuanceLayout>);
  expect(screen.getByText("Issuance content")).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Issuance sections" })).not.toBeInTheDocument();
});
it("redirects existing renewal links while preserving filters", async () => {
  await LegacyRenewalsPage({
    searchParams: Promise.resolve({ view: "history", student: "ST-1" }),
  });
  expect(mocks.redirect).toHaveBeenCalledWith(
    "/credentials/issuance/renewals?view=history&student=ST-1",
  );
});
