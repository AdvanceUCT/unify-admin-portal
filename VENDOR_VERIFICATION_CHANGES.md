# Vendor Verification QR and Dashboard Changes

## Summary

Approved vendors now get a verification dashboard on `/vendor`. When their vendor profile has a `verificationUrl`, the page renders a real QR code, copyable verification link, and SVG/PNG download actions. The QR points at the public verification route returned by the agent service.

## What Works Now

- Admin approval attempts to create a verification service point through the agent service.
- The returned `verificationUrl` is saved on the vendor profile.
- Approved vendors can view, copy, and download their verification QR code.
- Admins can retry QR setup for approved vendors that do not yet have a saved verification URL.
- The dashboard reads real verification stats and recent verification rows from the database.

## Still Separate Work

- Verification history only appears after another backend path writes `vendor_verification` rows.
- The table is schema-flexible: disclosed values are stored in the `attributes` JSON field, with optional `schemaId` and `credentialDefinitionId` metadata.
- Agent webhook/result persistence should map completed verification sessions into `vendor_verification`.

## Useful Flow

1. Admin approves a vendor application.
2. Admin portal calls the agent service to create a service point.
3. Agent service returns a public verification URL.
4. Admin portal saves the URL on `vendor_profile.verificationUrl`.
5. Vendor opens `/vendor` and displays or downloads the QR code.
6. Students scan the QR with the wallet and complete the proof flow.
