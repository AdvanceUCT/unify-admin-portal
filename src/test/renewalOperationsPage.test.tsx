import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  session: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/credentials/renewalOverview", () => ({
  renewalOverview: mocks.overview,
}));
vi.mock("@/lib/auth/session", () => ({ requireRoleForRender: mocks.session }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  usePathname: () => "/credentials/issuance/renewals",
  useRouter: () => ({ refresh: vi.fn() }),
}));
import RenewalsPage from "@/app/(admin)/credentials/issuance/renewals/page";
import LegacyRenewalsPage from "@/app/(admin)/credentials/renewals/page";
import { IssuanceTabs } from "@/features/credentials/IssuanceTabs";

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
  },
};
beforeEach(() => {
  vi.clearAllMocks();
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
  expect(screen.getByText("Renewal periods")).toBeInTheDocument();
  expect(screen.getByText("Academic year 2027")).toBeInTheDocument();
  expect(screen.getByText("Daily processing")).toBeInTheDocument();
  expect(screen.queryByText("Ada Student")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
    "href",
    "/credentials/issuance/renewals?view=upcoming&year=2027",
  );
});
it("shows filtered student records only after opening the queue", async () => {
  render(
    await RenewalsPage({
      searchParams: Promise.resolve({ view: "upcoming", year: "2027" }),
    }),
  );
  expect(mocks.overview).toHaveBeenCalledWith({
    view: "upcoming",
    year: "2027",
  });
  expect(screen.getByText("Ada Student")).toBeInTheDocument();
  expect(screen.getByText(/to 30 Nov 2027/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Cancel auto-renewal" }),
  ).toBeInTheDocument();
});
it("keeps issuer drill-down views read-only", async () => {
  mocks.session.mockResolvedValue({ user: { role: "ISSUER" } });
  render(
    await RenewalsPage({ searchParams: Promise.resolve({ view: "history" }) }),
  );
  expect(screen.getByText("Ada Student")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancel auto-renewal" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("View only")).toBeInTheDocument();
});
it("places Renewals in the issuance tabs", () => {
  render(<IssuanceTabs />);
  expect(screen.getByRole("link", { name: "Renewals" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    screen.getByRole("link", { name: "Batch issuance" }),
  ).toBeInTheDocument();
});
it("redirects existing renewal links while preserving filters", async () => {
  await LegacyRenewalsPage({
    searchParams: Promise.resolve({ view: "history", student: "ST-1" }),
  });
  expect(mocks.redirect).toHaveBeenCalledWith(
    "/credentials/issuance/renewals?view=history&student=ST-1",
  );
});

it("surfaces a failed scheduler run even when it completed recently", async () => {
  const base = await mocks.overview();
  const run = {
    id: "run-1",
    startedAt: base.asOf,
    completedAt: base.asOf,
    status: "FAILED",
    processed: 0,
    failed: 0,
    error: "Agent unavailable",
  };
  mocks.overview.mockResolvedValue({
    ...base,
    runs: [run],
    lastCompleted: run,
    stale: false,
  });
  render(await RenewalsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Last run failed")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Agent unavailable");
  expect(screen.queryByText("Running on schedule")).not.toBeInTheDocument();
});
