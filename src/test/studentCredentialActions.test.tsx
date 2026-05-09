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
                activationUrl: "unifywallet://activate?token=caleb-token",
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
    expect(screen.getByDisplayValue("unifywallet://activate?token=caleb-token")).toBeInTheDocument();
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
                activationUrl: "unifywallet://activate?token=caleb-token",
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
    expect(screen.getByDisplayValue("unifywallet://activate?token=caleb-token")).toBeInTheDocument();
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
      activationUrl: "unifywallet://activate?token=caleb-token",
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

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("unifywallet://activate?token=caleb-token"));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
