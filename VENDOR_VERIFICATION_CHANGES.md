# Vendor Verification Landing Page — What Changed

## Summary

When a vendor's application gets approved, their `/vendor` overview page now shows a real verification dashboard instead of just an application status card. It has a welcome banner, stats (total/approved/pending/this month), a "how it works" explainer, a recent verifications list, and a support contact box.

**Important: the admin portal is NOT actually connected to the agent service yet.** Everything on the page is built to match the agent service's data shape exactly, but there is no live wiring between the two systems. The page currently shows real, empty data (zero verifications) because nothing is feeding it information yet. The QR code is a "coming soon" placeholder, not a working code.

---

## What's real vs. what's a placeholder

This is the most important section — here's exactly what works and what doesn't.

### Real (actually works)

- **The database table.** A new `vendor_verification` table exists in the database, with a `VendorVerificationStatus` enum (`PENDING`, `APPROVED`, `DECLINED`, `EXPIRED`, `FAILED`).
- **The page queries the real database.** When an approved vendor loads `/vendor`, the page genuinely asks the database "how many verifications does this vendor have?" It's not faking the numbers — it's just that the answer is currently always zero, because nothing has ever written a row into that table.
- **The page layout and design.** The banner, stat cards, how-it-works steps, recent verifications list, and support box are all fully built and functional UI.

### Placeholder (not actually connected)

- **No connection to `unify-agent-service`.** Nothing in the admin portal calls that service's API, and nothing in that service calls back into the admin portal. They don't know about each other.
- **No webhook receiver.** The agent service sends a `proof.stateChanged` webhook whenever a student approves or denies a verification request. The admin portal has no endpoint listening for that webhook — if the agent service tried to send one right now, there'd be nothing on the other end to receive it.
- **No QR code generation.** The QR box on the page just shows an icon and "coming soon" text. It doesn't encode a real verification link, because there's no "service point" set up yet (a service point is the agent service's concept of a specific QR code location for a vendor).
- **The support email is a placeholder** (`support@unify.app`) — not a real, monitored address. Swap it for the actual one before this ships.

### Why it's still useful as-is

Even with nothing connected, this isn't throwaway work. The database table's column names and value types (`Pending`/`Approved`/`Declined`/`Expired`/`Failed`, `studentNumber`/`faculty`/`year`, `servicePointId`) were copied directly from the agent service's own code, so when the webhook receiver does get built later, it can map the incoming webhook data straight into this table without renaming or restructuring anything.

---

## Files changed

### 1. Database schema — `prisma/schema.prisma`

Added a new model and enum:

- **`VendorVerification`** — one row per verification attempt. Stores who the vendor is, what status the verification is in, which student attributes were shared (if approved), and timestamps.
- **`VendorVerificationStatus`** enum — `PENDING`, `APPROVED`, `DECLINED`, `EXPIRED`, `FAILED`. These five values were copied exactly from the agent service's own `VerificationDecision` type, so the two systems agree on what these words mean.

Also linked `VendorProfile` to this new table (`verifications VendorVerification[]`).

I deliberately did **not** add a separate "service point" table (the concept the agent service uses for individual QR codes). Since QR codes aren't being built yet, that table would have no purpose right now — it can be added later when that work starts.

### 2. Database migration — `prisma/migrations/20260630120000_add_vendor_verifications/`

The raw SQL that creates the `vendor_verification` table and the new enum. This has been applied to your personal dev database directly (using `prisma db execute`, which runs just this one file) — it has **not** been applied through the normal `prisma migrate dev` flow, because your personal database has unrelated, pre-existing drift against the migration history (see "Database notes" below).

### 3. New file — `src/lib/vendors/verifications.ts`

Two functions that read from the new table:

- `getVendorVerificationStats(vendorProfileId)` — counts total, approved, pending, and this-month verifications for a vendor.
- `listRecentVendorVerifications(vendorProfileId)` — fetches the vendor's most recent verification rows.

Both are real database queries. They currently return zero/empty for every vendor, correctly, because the table has no rows in it yet.

### 4. New file — `src/components/vendors/VendorVerificationOverview.tsx`

The actual verification dashboard UI: success banner, 4 stat cards, the QR placeholder, the how-it-works steps, the recent verifications list (with a proper "no verifications yet" empty state), and the support contact box.

### 5. Changed — `src/app/vendor/(portal)/page.tsx`

This is the `/vendor` overview page. It now checks the vendor's application status:

- If **approved** → shows the new `VendorVerificationOverview` dashboard.
- If **pending/rejected/no application** → shows the old "track your application" card, unchanged.

No new navigation link was added — `/vendor` ("Overview" in the sidebar) already takes approved vendors straight to this new dashboard, so a second link would just point at the same place.

---

## How the verification flow is *supposed* to work (once connected)

This is for context — none of this is built yet, but it explains what the database table is shaped to eventually support:

1. A student scans a vendor's QR code with the UNIFY wallet app.
2. That triggers the agent service to create a "proof request" asking the student to share specific details: student number, faculty, and year.
3. The student's wallet shows them this request, and they choose to approve or deny it.
4. The agent service fires a signed webhook (`proof.stateChanged`) back to the admin portal with the result.
5. The admin portal would need a webhook endpoint to receive that, verify its signature, and save it into the `vendor_verification` table.
6. The vendor then sees the result on their dashboard — which is the part that's already built.

Steps 1–5 don't exist in this codebase yet. Step 6 (the dashboard) is what this round of work built.

---

## Database notes (personal dev database)

While working on this, we discovered your personal Supabase database had drifted from what the migration files expect — it had leftover tables from an older version of the schema (`student`, `batch`, `issued_credential`, `activation_delivery`) that don't match any current model, and it was missing two migrations that already exist on `main` (related to vendor revocation). This is unrelated to the verification work and wasn't fixed here — only the one new migration for `vendor_verification` was applied, directly and surgically, without touching anything else. The rest of the drift is still there and will need separate attention, probably alongside merging `main` into this branch.

---

## What would be needed to make this fully live

For future reference, connecting this for real would mean:

1. A webhook endpoint in the admin portal (e.g. `/api/webhooks/agent-service`) that verifies the `X-Unify-Signature` header and writes incoming `proof.stateChanged` events into `vendor_verification`.
2. A way to create and manage "service points" (so each vendor has a real QR code tied to a real agent-service session).
3. Real QR code generation pointing at that service point's verification URL.
4. Calling the agent service's API (using the existing `AGENT_SERVICE_URL` / `AGENT_API_KEY` config already in `.env.example`) to actually start verification sessions.
