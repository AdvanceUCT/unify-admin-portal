# Vendor payment access

Owners request approval for one branch at a time. The shared payout account is saved once and reused. This change does not enable live money, switch payment providers or change refund and payout policies.

## Owner workflow

Open **Payments → Manage payment access** or follow the payment-access link from a branch, application history or integration setup. The overview is `/vendor/payments/access`. Each branch keeps its existing `/vendor/branches/{branchId}/payment-access` address for setup and status.

1. Confirm the branch. The page links back to its existing settings for edits or activation.
2. Review the saved, masked payout account. To add or replace it, select a bank by name, enter the holder and account number, and save without navigating away. Bank options come from Paystack's South African ZAR bank catalogue through the server. Provider codes and credentials stay out of the user flow.
3. Explicitly accept the student-data acknowledgement and submit for university review.

Pending and approved applications stay on this page. Rejected, revoked and withdrawn requests remain in history. Rejection feedback appears beside resubmission. Submission is disabled while an account edit or uncertain save is unresolved. Unknown mutation results offer reload instead of automatically repeating the request.

Successfully saved account data survives navigation. Unsaved numbers stay in the form only and clear after saving or leaving the editor. No raw account numbers are written to URLs, browser storage, the application snapshot, email or logs. Saving an account creates the existing reusable Paystack recipient; it does not claim independent identity or bank-ownership verification.

## Review and account changes

The Payment Access tab under Vendors provides vendor/branch search, status filtering and request age. Review opens the branch, submitted account, acknowledgement, eligibility and decision history together.

If the shared payout reference changes, a pending request needs owner reconfirmation. The owner reviews the current account and acknowledges it again. The pending application retains its original submission time. An audit entry preserves the previous safe snapshot and the new snapshot. Historical requests without complete details follow the same confirmation path. A stale admin page cannot approve using an older displayed payout reference, even after the owner reconfirms.

Server-side submission, reconfirmation and review run in serializable transactions with at most three attempts. Concurrent submissions converge on one active application. Approval and rejection compete for the pending state. Replays of an existing decision do not write another decision or send another email.

Branch approval is distinct from payment readiness. The university wallet setting, vendor approval, branch activity, vendor payment profile, wallet status/currency and branch acceptance determine whether payments can proceed. Approving a branch preserves a suspended vendor's status, reason, timestamp and suspension code. Existing recovery remains available. Already approved branches keep the existing payout-account replacement policy.

## Decision email

A newly committed approval or rejection sends the vendor contact a short update and authenticated request link through the existing email infrastructure. Bank details and review notes stay in the portal. Delivery runs after the database transaction; a delivery failure never reverses a decision or reports that it failed. The structured `payment_access_email_failed` log contains only the application ID and outcome.

Email follows the existing best-effort post-commit pattern. A process interruption after commit or a delivery failure can leave the portal decision without an email. This change does not add a durable email outbox or automatic email recovery. The portal remains authoritative.

## Validation and rollout

No schema migration or public vendor API change is needed. Deploy only after separate authorization. Existing application and acknowledgement records remain valid, subject to the current-account confirmation check.

Tests run only in GitHub Actions, using synthetic fixtures and isolated PostgreSQL. The suite covers duplicate submission, approval/rejection races, account changes during approval, stale references, suspended profiles, rejection/resubmission, incomplete historical requests, foreign branches, inactive/revoked eligibility, email failure and safe bank persistence. Browser fixtures reuse production components with synthetic actions and include desktop/mobile screenshots. They do not call Paystack, send email or use real vendor records.

The UI follows the portal's existing spacing, typography and role-specific accent. Completed account details stay compact; forms expand when required. Loading, error, pending and recovery states announce their status and keep controls keyboard accessible.

## Design references

- [Stripe hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding): prefill known details and request only relevant capabilities.
- [Paystack business activation](https://support.paystack.com/en/articles/2125506): collect requirements in one place and make completion visible.
- [Yoco verification requirements](https://support.yoco.help/en/articles/291759-verification-requirements-for-individuals-and-businesses): tailor required information to the business.
- [Paystack transfer recipients](https://paystack.com/docs/transfers/creating-transfer-recipients/): populate bank selection with supported bank names and codes.
