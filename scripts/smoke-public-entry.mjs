import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Production entry smoke checks run only in GitHub Actions.");
const base = "http://127.0.0.1:4185";
// No database is started or reachable for this check. Public entry and missing-
// session guards must work without accessing student records or live services.
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4185"], {
  env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/unify?connect_timeout=1", DIRECT_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/unify", BETTER_AUTH_SECRET: "synthetic-smoke-secret-at-least-32-characters", BETTER_AUTH_URL: base, APP_URL: base, BOOTSTRAP_ADMIN_EMAIL: "synthetic@example.test", BOOTSTRAP_ADMIN_NAME: "Synthetic CI", BOOTSTRAP_ADMIN_PASSWORD: "synthetic-password-for-ci-only", AUTH_EMAIL_FROM: "UNIFY <synthetic@example.test>", VERIFICATION_FEE_MINOR: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { log = (log + chunk).slice(-4000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const response = await fetch(`${base}/welcome`, { redirect: "manual", signal: AbortSignal.timeout(1000) }); if (response.status === 200) { ready = true; break; } } catch { /* Server is still starting. */ }
    if (server.exitCode !== null) break;
    await delay(200);
  }
  assert(ready, `Production server did not become ready: ${log}`);
  for (const cookie of [undefined, "unify-admin.session_token=synthetic-session-presence"]) {
    const response = await fetch(base, { redirect: "manual", headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, "Root must render the landing page without redirecting to sign-in");
    const html = await response.text();
    assert(html.includes("Your campus."));
    assert(html.includes('href="/fund"'));
    assert(html.includes('href="/vendor/sign-in"'));
  }
  const dashboard = await fetch(`${base}/dashboard`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
  assert.equal(dashboard.status, 307, `Dashboard must remain protected: ${log}`);
  assert.equal(new URL(dashboard.headers.get("location"), base).pathname, "/sign-in");
  console.log("Production entry passed: public root with/without a cookie, existing welcome alias, funding/vendor links, protected dashboard.");
} finally {
  server.kill("SIGTERM");
}
