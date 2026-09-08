# Vendor Verification Billing

Vendor verification billing is separate from the student payment wallet. Verification fees are platform-controlled in the first implementation and are configured through:

- `VERIFICATION_FEE_MINOR`
- `VERIFICATION_FEE_CURRENCY`

The active env values are only used when a verification result is materialized. Each completed `VendorVerification` stores its own billing snapshot so historical usage and future invoice estimates do not change when the platform price changes later.

For v1, only `APPROVED` verifications where `isVerified = true` are billable. Declined, failed, expired, pending, and approved-but-not-verified results are stored as not billable. This rule lives in `src/lib/vendors/verificationBilling.ts` so it can be changed without rewriting page or export logic.

The vendor-facing pricing view is intentionally limited to `/vendor/verifications`. Dashboard metrics and live verification notifications stay focused on verification activity.

## Future Revenue Split

The platform/university revenue split is intentionally not implemented yet. When needed, use a platform-controlled, effective-dated billing policy table rather than env-only configuration.

The expected future policy shape is:

- verification fee in minor units;
- currency;
- platform share in basis points;
- university share in basis points;
- effective start and end timestamps.

When that policy exists, each verification should snapshot the applied policy and calculated share amounts. That preserves invoice and payout traceability without rewriting historical verification records.
