import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudentCredentialActions } from "@/features/students/StudentCredentialActions";
import type { ActivationDelivery } from "@/lib/api/types";
import { getSimulatedUniversityStudentRecordById } from "@/lib/student-records/simulatedUniversityRecords";

const caleb = getSimulatedUniversityStudentRecordById("student-demo-100");

describe("StudentCredentialActions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows issue as available and explains why revoke is disabled before issuance", () => {
    if (!caleb) throw new Error("Caleb test record missing.");

    render(<StudentCredentialActions student={caleb} />);

    expect(screen.getByRole("button", { name: "Issue credential" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reinstate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();
    expect(screen.getByText("No issued credential exists for this student yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renew" })).not.toBeInTheDocument();
  });

  it("explains why legacy non-revocable credentials cannot use lifecycle actions yet", () => {
    if (!caleb) throw new Error("Caleb test record missing.");
    const legacyStudent = {
      ...caleb,
      credential: {
        ...caleb.credential,
        lifecycleState: "LEGACY_NON_REVOCABLE" as const,
      },
    };

    render(<StudentCredentialActions student={legacyStudent} />);

    expect(screen.queryByRole("button", { name: "Issue credential" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();
    expect(
      screen.getByText(
        "This credential was issued before revocation support was enabled. Reissue it under a revocation-enabled schema first.",
      ),
    ).toBeInTheDocument();
  });

  it("requires a reason before suspending an active credential", async () => {
    if (!caleb) throw new Error("Caleb test record missing.");
    const activeStudent = {
      ...caleb,
      credential: { ...caleb.credential, lifecycleState: "ACTIVE" as const },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ lifecycleState: "SUSPENDED" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentCredentialActions student={activeStudent} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Enrolment review" } });
    fireEvent.click(confirm);

    await screen.findByText("Credential suspended.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/students/student-demo-100/credentials/lifecycle",
      {
        body: JSON.stringify({ action: "suspend", reason: "Enrolment review" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
  });

  it("requires a reason before permanently revoking an active credential", async () => {
    if (!caleb) throw new Error("Caleb test record missing.");
    const activeStudent = {
      ...caleb,
      credential: { ...caleb.credential, lifecycleState: "ACTIVE" as const },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ lifecycleState: "REVOKED" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentCredentialActions student={activeStudent} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Student left the university" } });
    fireEvent.click(confirm);

    await screen.findByText("Credential revoked.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/students/student-demo-100/credentials/lifecycle",
      {
        body: JSON.stringify({ action: "revoke", reason: "Student left the university" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
  });

  it("allows revoking an offer-sent credential when revocation metadata exists", async () => {
    if (!caleb) throw new Error("Caleb test record missing.");
    const offerSentStudent = {
      ...caleb,
      credential: {
        ...caleb.credential,
        isRevocable: true,
        lifecycleState: "OFFER_SENT" as const,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ lifecycleState: "REVOKED" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentCredentialActions student={offerSentStudent} />);

    expect(screen.getByRole("button", { name: "Revoke" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Demo cleanup" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await screen.findByText("Credential revoked.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/students/student-demo-100/credentials/lifecycle",
      expect.objectContaining({
        body: JSON.stringify({ action: "revoke", reason: "Demo cleanup" }),
        method: "POST",
      }),
    );
  });

  it("offers reactivation and permanent revocation for suspended credentials", () => {
    if (!caleb) throw new Error("Caleb test record missing.");
    const suspendedStudent = {
      ...caleb,
      credential: { ...caleb.credential, lifecycleState: "SUSPENDED" as const },
    };

    render(<StudentCredentialActions student={suspendedStudent} />);

    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
  });

  it("calls the single-student issue endpoint and shows the returned delivery", async () => {
    if (!caleb) throw new Error("Caleb test record missing.");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            activationDeliveries: [
              {
                activationId: "activation-caleb",
                activationUrl: "http://localhost:3000/activate?token=caleb-token",
                batchId: "batch-001",
                channel: "activation-link",
                credentialId: "credential-demo-100",
                deliveredAt: "2026-04-27T10:00:00.000Z",
                email: "caleb.voskuil@gmail.com",
                expiresAt: "2026-04-28T10:00:00.000Z",
                id: "activation-delivery-activation-caleb",
                status: "Delivered",
                studentId: "student-demo-100",
              },
            ],
            batchId: "batch-001",
            cohortId: "simulated-2026-cohort",
            issuedCredentialIds: ["credential-demo-100"],
            queuedAt: "2026-04-27T10:00:00.000Z",
            requestedCount: 1,
            status: "Queued",
          }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        ),
      ),
    );

    render(<StudentCredentialActions student={caleb} />);

    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));

    await screen.findByText("Activation link delivered to caleb.voskuil@gmail.com.");
    expect(fetch).toHaveBeenCalledWith("/api/students/student-demo-100/credentials/issue", {
      cache: "no-store",
      method: "POST",
    });
    expect(screen.getByDisplayValue("http://localhost:3000/activate?token=caleb-token")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "http://localhost:3000/activate?token=caleb-token",
    );
  });

  it("shows the real delivery failure reason when email delivery fails", async () => {
    if (!caleb) throw new Error("Caleb test record missing.");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            activationDeliveries: [
              {
                activationId: "activation-caleb",
                activationUrl: "http://localhost:3000/activate?token=caleb-token",
                batchId: "batch-001",
                channel: "activation-link",
                credentialId: "credential-demo-100",
                email: "caleb.voskuil@gmail.com",
                expiresAt: "2026-04-28T10:00:00.000Z",
                failureReason: "RESEND_API_KEY is required to send credential activation emails.",
                id: "activation-delivery-activation-caleb",
                status: "Failed",
                studentId: "student-demo-100",
              },
            ],
            batchId: "batch-001",
            cohortId: "simulated-2026-cohort",
            failures: [
              {
                email: "caleb.voskuil@gmail.com",
                externalId: "student-demo-100",
                message: "RESEND_API_KEY is required to send credential activation emails.",
              },
            ],
            issuedCredentialIds: [],
            queuedAt: "2026-04-27T10:00:00.000Z",
            requestedCount: 1,
            status: "Queued",
          }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        ),
      ),
    );

    render(<StudentCredentialActions student={caleb} />);

    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));

    await screen.findByText(
      "Activation link was created, but email delivery failed: RESEND_API_KEY is required to send credential activation emails.",
    );
    expect(screen.getByDisplayValue("http://localhost:3000/activate?token=caleb-token")).toBeInTheDocument();
  });

  it("copies an existing activation link", async () => {
    if (!caleb) throw new Error("Caleb test record missing.");

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const delivery: ActivationDelivery = {
      activationId: "activation-caleb",
      activationUrl: "http://localhost:3000/activate?token=caleb-token",
      batchId: "batch-001",
      channel: "activation-link",
      credentialId: "credential-demo-100",
      deliveredAt: "2026-04-27T10:00:00.000Z",
      email: "caleb.voskuil@gmail.com",
      expiresAt: "2026-04-28T10:00:00.000Z",
      id: "activation-delivery-activation-caleb",
      status: "Delivered",
      studentId: "student-demo-100",
    };

    render(<StudentCredentialActions delivery={delivery} student={caleb} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://localhost:3000/activate?token=caleb-token"));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
