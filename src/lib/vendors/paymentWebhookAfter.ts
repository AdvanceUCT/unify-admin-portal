import { after } from "next/server";
export function schedulePaymentWebhookDispatch() {
  after(async () => {
    try {
      const { dispatchPaymentWebhooks } = await import("./paymentWebhooks");
      await dispatchPaymentWebhooks();
    } catch { /* The durable outbox is recovered by the signed scheduler. */ }
  });
}
