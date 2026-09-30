// Merchant-server example: real create/read/cancel requests, never a student payment.
const [operation, ...args] = process.argv.slice(2);
const base = new URL(process.env.UNIFY_PORTAL_URL || "https://voskuils.com");
const key = process.env.UNIFY_VENDOR_API_KEY;
if (base.protocol !== "https:" || base.username || base.password || !key) throw new Error("Set an HTTPS UNIFY_PORTAL_URL and server-only UNIFY_VENDOR_API_KEY.");
let path = "/api/vendor/v1/payment-requests", method = "GET", body;
if (operation === "create") {
  const [branchId, orderReference, amount, idempotencyKey] = args;
  const amountMinor = Number(amount);
  if (!branchId || !orderReference || !idempotencyKey || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Usage: create <branch-id> <order-reference> <positive-integer-cents> <original-create-key>");
  method = "POST"; body = { branchId, orderReference, amountMinor, currency: "ZAR", idempotencyKey };
} else if (["read", "cancel"].includes(operation)) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(args[0] || "")) throw new Error("Provide the opaque request ID.");
  path += `/${args[0]}`;
  if (operation === "cancel") { path += "/cancel"; method = "POST"; }
} else throw new Error("Choose create, read or cancel.");
try {
  const response = await fetch(new URL(path, base), { method, redirect: "error", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok) { console.error(JSON.stringify({ status: response.status, code: result.error?.code ?? "REQUEST_FAILED" })); process.exitCode = 1; }
  else console.log(JSON.stringify(result.data ?? result, null, 2));
} catch {
  console.error("Outcome unknown. Read the original request or repeat the identical create instruction with its original key; do not create a replacement sale."); process.exitCode = 1;
}
