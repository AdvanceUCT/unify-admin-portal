import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RevokeButton } from "@/app/(admin)/vendors/RevokeButton";

describe("RevokeButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("explains the effect of revocation and requires a reason", () => {
    render(
      <RevokeButton
        action={vi.fn()}
        applicationId="application_1"
        companyName="Demo Vendor"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke verifier approval" }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Their account remains available so they can view their status and reapply.",
    );
    expect(screen.getByLabelText("Reason for revocation")).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Confirm revocation" }),
    ).toBeInTheDocument();
  });
});
