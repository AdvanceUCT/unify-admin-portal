import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "@/lib/async/mapWithConcurrency";

describe("mapWithConcurrency", () => {
  it("bounds active work and preserves input order", async () => {
    let active = 0;
    let maximumActive = 0;
    const inputs = Array.from({ length: 10 }, (_, index) => index);

    const results = await mapWithConcurrency(inputs, 4, async (input) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, input % 2 === 0 ? 2 : 0));
      active -= 1;
      return input * 2;
    });

    expect(maximumActive).toBe(4);
    expect(results).toEqual(inputs.map((input) => input * 2));
  });
});
