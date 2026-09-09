import { beforeEach, describe, expect, it, vi } from "vitest";

import { markGatewayEventProcessed, recordGatewayEvent, recordGatewayEventFailure, type GatewayEventClient } from "@/lib/billing/gatewayEvents";

function makeClient() {
  return {
    billingGatewayEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as GatewayEventClient & {
    billingGatewayEvent: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };
}

const INPUT = {
  provider: "paystack",
  providerAccountRef: "university-demo",
  providerMode: "test",
  eventType: "charge.success",
  resourceKey: "unify-inv-abc",
  rawBody: JSON.stringify({ event: "charge.success" }),
};

describe("recordGatewayEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a new event as non-duplicate", async () => {
    const client = makeClient();
    client.billingGatewayEvent.findUnique.mockResolvedValue(null);
    client.billingGatewayEvent.create.mockResolvedValue({ id: "event-1" });

    const result = await recordGatewayEvent(client, INPUT);

    expect(result).toEqual({ id: "event-1", duplicate: false });
    expect(client.billingGatewayEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "paystack",
          eventType: "charge.success",
          resourceKey: "unify-inv-abc",
          bodyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
        select: { id: true },
      }),
    );
  });

  it("reports an already-recorded event as duplicate without creating a second row", async () => {
    const client = makeClient();
    client.billingGatewayEvent.findUnique.mockResolvedValue({ id: "event-existing" });

    const result = await recordGatewayEvent(client, INPUT);

    expect(result).toEqual({ id: "event-existing", duplicate: true });
    expect(client.billingGatewayEvent.create).not.toHaveBeenCalled();
  });

  it("resolves a concurrent-insert race to the winning row instead of throwing", async () => {
    const client = makeClient();
    client.billingGatewayEvent.findUnique.mockResolvedValue(null);
    client.billingGatewayEvent.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    client.billingGatewayEvent.findUniqueOrThrow.mockResolvedValue({ id: "event-raced" });

    const result = await recordGatewayEvent(client, INPUT);

    expect(result).toEqual({ id: "event-raced", duplicate: true });
  });

  it("hashes different bodies to different hashes for the same resource key", async () => {
    const client = makeClient();
    client.billingGatewayEvent.findUnique.mockResolvedValue(null);
    client.billingGatewayEvent.create.mockImplementation(({ data }) => Promise.resolve({ id: "event-1", bodyHash: data.bodyHash }));

    const first = await recordGatewayEvent(client, { ...INPUT, rawBody: "body-a" });
    const second = await recordGatewayEvent(client, { ...INPUT, rawBody: "body-b" });

    const firstHash = client.billingGatewayEvent.create.mock.calls[0][0].data.bodyHash;
    const secondHash = client.billingGatewayEvent.create.mock.calls[1][0].data.bodyHash;
    expect(firstHash).not.toBe(secondHash);
    expect(first.id).toBe("event-1");
    expect(second.id).toBe("event-1");
  });
});

describe("markGatewayEventProcessed / recordGatewayEventFailure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks an event processed and clears any prior error", async () => {
    const client = makeClient();
    const processedAt = new Date("2026-09-11T10:00:00.000Z");

    await markGatewayEventProcessed(client, "event-1", processedAt);

    expect(client.billingGatewayEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { processedAt, processingError: null },
    });
  });

  it("records a failure with a bounded retry delay and increments retryCount", async () => {
    const client = makeClient();

    await recordGatewayEventFailure(client, "event-1", new Error("provider 5xx"), 60);

    expect(client.billingGatewayEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-1" },
        data: expect.objectContaining({ processingError: "provider 5xx", retryCount: { increment: 1 } }),
      }),
    );
  });
});
