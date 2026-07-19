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

  it("only shows the working issue action for Caleb before issuance", () => {
    if (!caleb) throw new Error("Caleb test record missing.");

    render(<StudentCredentialActions student={caleb} />);

    expect(screen.getByRole("button", { name: "Issue credential" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reinstate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renew" })).not.toBeInTheDocument();
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

  it("shows a working renew action for an issued credential and calls the renew endpoint", async () => {
    if (!caleb) throw new Error("Caleb test record missing.");

    const issuedCaleb = {
      ...caleb,
      credential: { ...caleb.credential, lifecycleState: "ISSUED" as const },
    };

    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            activationDeliveries: [
              {
                activationId: "activation-caleb-renewed",
                activationUrl: "http://localhost:3000/activate?token=caleb-renewed-token",
                batchId: "batch-002",
                channel: "activation-link",
                credentialId: "credential-demo-100-renewed",
                deliveredAt: "2026-07-10T10:00:00.000Z",
                email: "caleb.voskuil@gmail.com",
                expiresAt: "2027-01-10T10:00:00.000Z",
                id: "activation-delivery-activation-caleb-renewed",
                status: "Delivered",
                studentId: "student-demo-100",
              },
            ],
            batchId: "batch-002",
            cohortId: "simulated-2026-cohort",
            issuedCredentialIds: ["credential-demo-100-renewed"],
            queuedAt: "2026-07-10T10:00:00.000Z",
            requestedCount: 1,
            status: "Queued",
          }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        ),
      ),
    );

    render(<StudentCredentialActions student={issuedCaleb} />);

    expect(screen.queryByRole("button", { name: "Issue credential" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renew" }));

    await screen.findByText("Activation link delivered to caleb.voskuil@gmail.com.");
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/students/student-demo-100/credentials/renew", {
      cache: "no-store",
      method: "POST",
    });
  });

  it("does not call the renew endpoint if the early-renewal confirmation is dismissed", () => {
    if (!caleb) throw new Error("Caleb test record missing.");

    const issuedCaleb = {
      ...caleb,
      credential: { ...caleb.credential, lifecycleState: "ISSUED" as const },
    };

    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    vi.stubGlobal("fetch", vi.fn());

    render(<StudentCredentialActions student={issuedCaleb} />);

    fireEvent.click(screen.getByRole("button", { name: "Renew" }));

    expect(fetch).not.toHaveBeenCalled();
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
