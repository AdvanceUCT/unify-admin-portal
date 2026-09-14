import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import WalletTopupReturnPage from "@/app/wallet/topups/return/page";

describe("wallet top-up return page", () => {
  it("renders a readable wallet deep-link fallback", async () => {
    render(await WalletTopupReturnPage({
      searchParams: Promise.resolve({ topUpId: "topup-001", reference: "PSK_ref_001" }),
    }));

    const link = screen.getByRole("link", { name: "Open wallet" });
    expect(link.getAttribute("href")).toBe("unifywallet://topup-return?topUpId=topup-001");
    expect(link.className).toContain("bg-black");
    expect(link.className).toContain("text-white");
    expect(screen.getByText("If your browser does not switch back automatically, tap Open wallet.")).toBeTruthy();
  });
});
