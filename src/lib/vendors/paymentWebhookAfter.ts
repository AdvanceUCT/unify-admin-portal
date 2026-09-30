import { after } from "next/server";
export function schedulePaymentWebhookDispatch() {
  try { after(async () => {
    try {
      const { dispatchPaymentWebhooks } = await import("./paymentWebhooks");
      await dispatchPaymentWebhooks();
    } catch { /* The durable outbox is recovered by the signed scheduler. */ }
  }); } catch { /* No request lifecycle (e.g. isolated route tests); the scheduler still owns recovery. */ }
}
