import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/cron/credential-renewals/route";
import { renewAllDueCredentials } from "@/lib/credentials/renewal";

vi.mock("@/lib/config/env", () => ({
  env: {
    CRON_SECRET: "cron-secret",
  },
}));

vi.mock("@/lib/credentials/renewal", () => ({
  renewAllDueCredentials: vi.fn(async () => ({ attempted: 0, failed: [], renewed: 0 })),
}));

function request(authorization?: string) {
  const headers = authorization ? { authorization } : undefined;
  return new Request("http://localhost:3000/api/cron/credential-renewals", { headers });
}

describe("credential renewal cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests missing the bearer token", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(renewAllDueCredentials).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong bearer token", async () => {
    const response = await GET(request("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(renewAllDueCredentials).not.toHaveBeenCalled();
  });

  it("runs the renewal batch and returns its summary when authorized", async () => {
    const response = await GET(request("Bearer cron-secret"));

    expect(response.status).toBe(200);
    expect(renewAllDueCredentials).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ attempted: 0, failed: [], renewed: 0 });
  });
});
