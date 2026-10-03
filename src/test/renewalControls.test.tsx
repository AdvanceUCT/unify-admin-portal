import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenewalOptionsFields } from "@/features/credentials/RenewalOptionsFields";
import { RenewalAction } from "@/features/credentials/RenewalAction";
import { StudentCredentialActions } from "@/features/students/StudentCredentialActions";
import { getSimulatedUniversityStudentRecordById } from "@/lib/student-records/simulatedUniversityRecords";
const preview = {
  validFrom: "2026-01-10T10:00:00Z",
  expiresAt: "2026-11-30T22:00:00Z",
  academicYear: 2026,
  finalYear: 2028,
  renewalDates: ["2027-01-31T22:00:00Z", "2028-01-31T22:00:00Z"],
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(preview), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("renewal controls", () => {
  it("starts unchecked and previews enrolment choices", async () => {
    const change = vi.fn();
    render(
      <RenewalOptionsFields
        value={{ autoRenew: false, renewalYears: 3 }}
        onChange={change}
      />,
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await screen.findByText(/Valid from/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(change).toHaveBeenCalledWith({ autoRenew: true, renewalYears: 3 });
  });
  it("displays future renewal dates and the inclusive final year", async () => {
    render(
      <RenewalOptionsFields
        value={{ autoRenew: true, renewalYears: 3 }}
        onChange={vi.fn()}
      />,
    );
    await screen.findByText(/through 2028/);
    expect(screen.getByText("30 Nov 2026")).toBeInTheDocument();
    const schedule = screen.getByText("Renewal schedule").closest("details")!;
    expect(schedule).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Renewal schedule"));
    expect(screen.getByText("01 Feb 2027")).toBeInTheDocument();
    expect(screen.getByText("01 Feb 2028")).toBeInTheDocument();
  });
  it("keeps a retained enrolment read-only during manual renewal", async () => {
    render(
      <RenewalOptionsFields
        value={{ autoRenew: false }}
        onChange={vi.fn()}
        existingFinalYear={2028}
      />,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/Original allowance retained/)).toBeInTheDocument();
    await screen.findByText(/Future renewals/);
  });
  it("never offers manual renewal for active credentials", () => {
    const student =
      getSimulatedUniversityStudentRecordById("student-demo-100")!;
    render(
      <StudentCredentialActions
        student={{
          ...student,
          credential: { ...student.credential, lifecycleState: "ACTIVE" },
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Renew credential" }),
    ).not.toBeInTheDocument();
  });
  it("cancels remaining renewals through the protected action endpoint", async () => {
    const browserConfirm = vi.spyOn(window, "confirm");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    );
    render(
      <RenewalAction
        id="enrolment-1"
        action="cancel"
        label="Cancel auto-renewal"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel auto-renewal" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(browserConfirm).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/credentials/renewals/enrolment-1/cancel",
        { method: "POST" },
      ),
    );
  });
});
