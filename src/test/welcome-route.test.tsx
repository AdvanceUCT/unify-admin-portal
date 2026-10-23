import { expect, it } from "vitest";
import HomePage, { metadata } from "@/app/(public)/page";
import WelcomePage from "@/app/(public)/welcome/page";
it("the real root route renders the same public landing page as the welcome alias", () => {
  expect(HomePage).toBe(WelcomePage);
  expect(metadata.title).toBe("UNIFY | Your campus in your pocket");
});
