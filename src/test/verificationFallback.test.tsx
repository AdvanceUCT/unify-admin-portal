import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MissingVerificationServicePointPage from "@/app/(public)/verify/page";
import VerificationFallbackPage from "@/app/(public)/verify/[publicServicePointId]/page";
import { buildWalletVerificationLink } from "@/lib/verification/walletLink";

describe("verification browser fallback", () => {
  it("encodes the custom wallet link path segment", () => {
    expect(buildWalletVerificationLink(" service point/1 ")).toBe(
      "unifywallet://verify/service%20point%2F1",
    );
    expect(buildWalletVerificationLink("   ")).toBeUndefined();
  });

  it("handles a missing public service-point ID", () => {
    render(<MissingVerificationServicePointPage />);
    expect(screen.getByText(/verification link is incomplete/i)).toBeInTheDocument();
  });

  it("links to the wallet without starting verification in the browser", async () => {
    render(
      await VerificationFallbackPage({
        params: Promise.resolve({ publicServicePointId: "sp-public-001" }),
      }),
    );

    expect(screen.getByRole("link", { name: /open student wallet/i })).toHaveAttribute(
      "href",
      "unifywallet://verify/sp-public-001",
    );
    expect(screen.getByText(/only runs inside the wallet/i)).toBeInTheDocument();
  });
});
