// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]) }));
import { isPublicAddress, resolvePaymentWebhookDestination } from "@/lib/vendors/paymentWebhookTransport";
describe("Payment destination validation", () => {
  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "2001:db8::1", "::ffff:127.0.0.1", "2002:7f00:1::1"])("rejects private or reserved address %s", (address) => { expect(isPublicAddress(address)).toBe(false); });
  it("accepts public addresses", () => { expect(isPublicAddress("8.8.8.8")).toBe(true); expect(isPublicAddress("2606:4700:4700::1111")).toBe(true); });
  it("rejects mixed public/private DNS answers and non-HTTPS destinations", async () => {
    await expect(resolvePaymentWebhookDestination("https://mixed.example/events")).rejects.toThrow("public addresses");
    await expect(resolvePaymentWebhookDestination("http://8.8.8.8/events")).rejects.toThrow("HTTPS");
    await expect(resolvePaymentWebhookDestination("https://user:pass@8.8.8.8/events")).rejects.toThrow("HTTPS");
  });
});
