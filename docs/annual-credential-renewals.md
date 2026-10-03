# Annual credential validity and renewal

## Administrative behaviour

Set annual start and expiry dates in Settings (DD-MM, for example 01-02 to 30-11) before new issuance. They repeat in Africa/Johannesburg. Expiry includes the selected day; its stored exclusive boundary is midnight the following day. February 29 clamps to February 28 in non-leap years. Periods can cross December.

Ordinary issuance targets the earliest period with an expiry still in the future and is valid from actual offer creation. Thus January issuance into a February–November period counts for that academic year, and February does not create another offer. Automatic renewal uses the shared start date, including when processing is late.

Choose auto-renewal during individual or batch issuance. The duration includes the initial period: three academic years creates two later annual renewals. Suspension does not extend that allowance. There is no university-record eligibility check; administrators must cancel auto-renewal when a student should stop receiving offers. Permanent revocation stops future renewals.

Settings changes affect future, unprepared offers for existing enrolments. Already prepared attempts retain their signed dates, schema, attributes, and policy version. Manual renewal is expired-only and preserves an existing enrolment's final year. A new enrolment duration must be explicitly selected; replacement activation does not restart it.

## Monitoring and recovery

Issue Credentials > Renewals opens with all queued academic periods. Select a period to search students and filter by faculty, programme, or renewal status. History shows previously triggered renewals, dates, and delivery outcomes. Pagination retains the selected period and filters. Scheduler diagnostics are collapsed under Settings > Validity & renewal. Student details shows a compact enrolment and cancellation card below the credential details.

An offer being delivered is not holder activation. Students still accept offers in the wallet, so issuing on the shared start date can leave a gap until acceptance. The following academic year's offer remains eligible even if a prior offer was ignored. Fully elapsed periods are skipped. Activation reconciliation revokes superseded activated credentials, including across missed intermediate activations.

Automatic processing uses ten-minute leases, four concurrent workers, stable agent idempotency keys, and five attempts. Retry deadlines have a one-hour minimum delay; the daily PoC scheduler picks up eligible retries on its next run. Failed jobs do not block later jobs. Administrators may retry failed delivery without recreating the offer. Expired or declined activation offers require explicit replacement; there are no automatic repeated replacement emails. Recovery uses a new attempt identity and current policy, and requires revocation or confirmed expiry of the superseded offer.

Cancellation prevents unprepared offers. A committed attempt remains recoverable and existing credentials retain their expiry. Cancellation, recovery, and policy editing require ADMIN or SUPER_ADMIN; ISSUER can configure enrolment during issuance and read the renewal page.

## Migration and deployment

Apply both forward migrations:

- `20261003150000_annual_credential_renewals`
- `20261003151000_renewal_attempt_fencing`

They add policy versions, enrolments, per-period outcomes, immutable offer preparations, and scheduler runs. The first removes legacy university validity/cadence/toggle columns and cancels legacy AUTO_RENEW jobs, while preserving credential dates, audit history, and unrelated lifecycle jobs. The removed columns make the old application incompatible with the new schema; deploy the new application with these migrations as one coordinated change.

No existing credential is automatically enrolled and no duration is inferred. Configure the new policy before issuance. Existing students can join on later issuance or expired-only manual renewal. A schema must include `validFrom` and `expiresAt`.

For this PoC on Vercel Hobby, the authenticated `/api/cron/credential-automation` GET endpoint runs once daily. Its `5 22 * * *` UTC schedule targets 00:05 South African time, with Hobby's imprecise invocation window within the scheduled hour. It is sufficient for annual renewal; retries, suspension reactivation catch-up, and work left after a bounded run can wait until the next daily sweep. Automatic offers still use the shared period start even when processing is late.

Set `CRON_SECRET` and enable Fluid Compute in the Vercel project: Hobby supports the route's 300-second budget with Fluid Compute, but only 60 seconds without it. Verify the agent-call timeout is 60 seconds. The worker stops claiming within its bounded budget and resumes remaining work on subsequent sweeps. Lifecycle jobs still process independently of annual-policy configuration. Scheduler health warns after 49 hours without a completed run: two missed daily sweeps plus an hour of timing grace. Interrupted runs remain visible as processing.

This uses native daily Vercel cron; no external scheduler is required for credential automation. Daily scheduling and its timing limits are documented in [Vercel cron usage and limits](https://vercel.com/docs/cron-jobs/usage-and-pricing); function budgets are documented in [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration). The repository configuration does not prove the hosted scheduler is active.

After deployment, confirm an unattended authenticated run appears in the renewal page and test real agent issuance, holder acceptance, expiry verification, and the next renewal cycle with dedicated demo credentials. Local PostgreSQL tests simulate agent and email boundaries and do not establish wallet or deployed scheduler behaviour.

## Tests

Run ordinary checks with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

Run `npm run test:credentials:db` with DATABASE_URL and DIRECT_URL pointing to a migrated, isolated local PostgreSQL database named `unify_wallet_test`. Tests deliberately refuse production or non-local databases. They cover consecutive renewals, policy edits, lease recovery, cancellation, suspension, missed periods, activation reconciliation, retry exhaustion, and backlogs greater than fifty. CI's existing PostgreSQL job includes these suites.
