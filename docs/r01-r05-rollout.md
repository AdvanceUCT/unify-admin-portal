# R01–R05 rollout and acceptance

Portal PR #118 is stacked on OTP PR #117. Retarget and rebase it onto newly fetched main after #116/#117 merge, then rerun Actions on that final merged baseline. Do not rewrite applied migrations.

Deploy R01 and R04 independently. Release wallet PR #83 before agent PR #16 emits the new credential validity failure codes. Deploy the additive agent contracts before portal #118. Agent and portal legacy definition configuration defaults to empty and must match.

Apply forward migrations `20261001100000_otp_quota_indexes` and `20261001110000_credential_validity_revisions`. Keep payment OTP bypass and code logging disabled on the test deployment. Existing payment sessions keep their own authentication and refresh rules after credential expiry/suspension.

Use `npm run credentials:validity-backfill -- --inventory` to list definition/schema identifiers and validity shape without student attributes. Confirm each older schema against the authenticated agent's trusted definition/ledger metadata. Only definitions whose confirmed schemas lacked both validity attributes may enter `CREDENTIAL_VALIDITY_LEGACY_DEFINITION_IDS`; unknown and partial schemas receive no exception. This command does not configure the allowlist automatically.

After separately authorized deployment, run `npm run credentials:validity-backfill` for aggregate dry-run counts. Review scanned/recoverable/unavailable/conflicting totals, then separately authorize `npm run credentials:validity-backfill -- --apply`. Only exact issuer dates with matching exchange and definition binding are copied. Existing dates cannot be replaced with conflicting values. No date comes from acceptance timestamps or renewal settings. Unavailable modern dates block new activation.

Historical lifecycle webhooks reconcile through an authenticated current agent snapshot. Agent lifecycle storage remains under the existing single-process assumption. Old records gain revision zero with stable event identity; transitions persist increasing revisions and event IDs. Equal conflicting revisions return 409; stale events increment structured count logs. Failed OTP delivery increments structured counts without code or token values. Historical scheduled reactivation jobs lacking their originating revision are cancelled for review rather than applying an unbound transition.

Release evidence must capture deployment commits, Actions URLs, migration results, validity inventory/backfill totals and exact allowlist, actual callback delivery from the existing `unify-payment-webhooks` schedule, and the established Windows signed APK's two required ABIs, SHA-256, certificate, version and endpoint configuration. No schedule creation or secret rotation is required.

Phone acceptance: activation, validity rejection, ordinary verification and interrupted checkout recovery. Physical second-account acceptance remains deferred. Automated regressions use GitHub Actions and isolated PostgreSQL, without live student fixtures.

R06 durable delivery/outbox and R18 recovery after ledger success/local persistence failure remain separate. PR #115, later findings, payouts, refunds and Jira changes are outside this chunk. Deployment, live backfill and signed release acceptance have not been performed by this implementation task.
