# Refunds, overdraft & threshold payouts — implementation progress

Living record of execution against `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS_IMPLEMENTATION_PLAN.md`.
The specification is `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md` (§3 is normative and is never
edited by this work). Updated as each phase completes its gate. Records what was done, drift from the
plan (with reasons), migration names and deployment impact, and open follow-ups. Never records
credentials.

Legend: ✅ done and gate passed · 🟡 done, gate partially blocked · ⬜ not started.

Gate commands — portal: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus
`npm run test:payments:db` (with `DATABASE_URL`/`DIRECT_URL` set in the shell to the local
`unify_wallet_test` database) for phases that touch SQL or posting. POS: `typecheck`, `lint`, `test`,
`build`.

## Phase 0 — Planning documents — ✅

- Committed the specification, the approved implementation plan and this progress record.
- No code changes.

## Phase 1 — Migrations + ledger core — ⬜

## Phase 2 — Refunds service, API, read model, outbox dispatch — ⬜

## Phase 3 — Payouts + overdraft monitor — ⬜

## Phase 4 — Vendor top-ups (backend) — ⬜

## Phase 5 — Portal UI, admin settings, copy, portal docs — ⬜

## Phase 6 — POS simulator — ⬜

## Drift log

None yet.
