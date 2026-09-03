# Payment wallet development setup

This guide prepares a migrated database for payment-wallet development without creating fictional student or vendor funds.

## Prerequisites

- Install the repository dependencies.
- Configure `DATABASE_URL` and `DIRECT_URL` in `.env.local`.
- Ensure both URLs refer to the intended database environment.
- Complete the normal university setup wizard so exactly one `UniversityProfile` exists.

## 1. Apply committed migrations

```powershell
npx prisma migrate deploy
npx prisma generate
```

Do not substitute `prisma db push`; the wallet migration contains financial constraints and triggers that are not represented by the Prisma model alone.

## 2. Provision the wallet foundation

Safe/default bootstrap:

```powershell
npm run payments:bootstrap
```

The command runs in one serializable database transaction and can be rerun safely. It:

- requires exactly one existing university profile;
- creates or resolves `GATEWAY_CLEARING`;
- creates or resolves `PAYOUT_CLEARING`;
- verifies both accounts are ZAR system accounts; and
- verifies the migration trigger created a balance projection for each account.

It does not change the current value of `UniversityProfile.paymentsEnabled`.

## 3. Enable local posting when required

For development environments that need to exercise the posting boundary:

```powershell
npm run payments:bootstrap:dev
```

This performs the same idempotent bootstrap and explicitly sets `paymentsEnabled` to `true`. It refuses this enablement when `NODE_ENV=production`. Production activation must eventually use a separately authorized operational workflow.

Enabling the flag does not expose a payment feature by itself. Student sessions, payment routes, gateway webhooks, vendor payment approval handlers, and payout jobs still need to be implemented.

## What is intentionally not seeded

- Student wallet accounts are created only after payment-wallet activation.
- Vendor wallet accounts are created only after approved payment onboarding.
- Wallet balances are never seeded or edited directly.
- Gateway top-ups must carry a provider and immutable provider payment ID.
- Payouts must carry their payout batch and destination attribution.

Unit tests can use mocked accounts. Database-backed integration fixtures should create student/vendor records and zero-balance wallet accounts for the duration of a test, then post balanced transactions through the server-only posting boundary.

## Expected output

The bootstrap prints the university, current enabled state, and both clearing-account IDs and balances. Existing non-zero clearing balances are preserved; rerunning the bootstrap never resets them.

## Troubleshooting

- **`No university profile exists`:** Start the portal and complete the university setup wizard, then rerun the bootstrap.
- **`Multiple university profiles exist`:** Stop and investigate the database. The wallet architecture assumes one university profile per deployment and will not guess which record to use.
- **`The payment wallet schema is not available`:** Run `npx prisma migrate deploy` against the same environment referenced by `DATABASE_URL`, then rerun the bootstrap.
- **`failed integrity verification`:** Do not manually insert or repair balances. Confirm that the wallet migration and its account-balance trigger were applied successfully before investigating the affected account.
