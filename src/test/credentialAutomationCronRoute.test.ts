import { beforeEach, describe, expect, it, vi } from "vitest";

const { runCredentialAutomation } = vi.hoisted(() => ({ runCredentialAutomation: vi.fn() }));

vi.mock("@/lib/config/env", () => ({ env: { CRON_SECRET: "cron-secret" } }));
vi.mock("@/lib/credentials/automation", () => ({ runCredentialAutomation }));

import { GET } from "@/app/api/cron/credential-automation/route";

describe("credential automation cron route", () => {
  beforeEach(() => {
    runCredentialAutomation.mockReset();
    runCredentialAutomation.mockResolvedValue({ failed: 0, processed: 0, queuedRenewals: 0, retrying: 0, succeeded: 0 });
  });

  it("rejects requests without the cron bearer token", async () => {
    expect((await GET(new Request("http://localhost/api/cron/credential-automation"))).status).toBe(401);
    expect(runCredentialAutomation).not.toHaveBeenCalled();
  });

  it("runs automation for an authorized request", async () => {
    const response = await GET(new Request("http://localhost/api/cron/credential-automation", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(response.status).toBe(200);
    expect(runCredentialAutomation).toHaveBeenCalledOnce();
  });
});
