import { Client } from "@upstash/qstash";
const { QSTASH_TOKEN, PAYMENT_WEBHOOK_DISPATCH_URL } = process.env;
if (!QSTASH_TOKEN || !PAYMENT_WEBHOOK_DISPATCH_URL) throw new Error("Set QSTASH_TOKEN and PAYMENT_WEBHOOK_DISPATCH_URL in the private setup environment.");
if (new URL(PAYMENT_WEBHOOK_DISPATCH_URL).protocol !== "https:") throw new Error("Dispatcher requires HTTPS.");
const client = new Client({ token: QSTASH_TOKEN });
const result = await client.schedules.create({ scheduleId: "unify-payment-webhooks", destination: PAYMENT_WEBHOOK_DISPATCH_URL, cron: "*/5 * * * *", body: "{}", headers: { "Content-Type": "application/json" }, retries: 1 });
console.log(`Configured five-minute payment dispatcher: ${result.scheduleId}`);
