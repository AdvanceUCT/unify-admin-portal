# UNIFY system state

Snapshot taken **2026-09-04 00:28 SAST** (`2026-09-03T22:28:54Z`). This is a point-in-time assessment of the four public repositories in the [`AdvanceUCT`](https://github.com/AdvanceUCT) GitHub organisation, their remote branches and pull requests, GitHub Actions history, the deployed web portal, and the public agent health endpoint.

## Executive summary

UNIFY is a working, integrated **proof of concept** for university-issued digital student credentials. Its implemented happy path spans university setup, student import, AnonCreds credential issuance and lifecycle management, a native holder wallet, vendor onboarding, in-person verification, and checkout verification. It should not yet be represented as a production student-records, payment, or identity platform.

The authoritative application baseline is split across three repositories:

| Component | Authoritative repository/ref | State |
|---|---|---|
| Admin, governance, public web and vendor portal | [`unify-admin-portal@9b4a604`](https://github.com/AdvanceUCT/unify-admin-portal/commit/9b4a604ee4daae82a3a809d4672094ae1330bb36) | Active; current `main` is deployed to Vercel |
| Student holder wallet | [`unify-student-wallet@b9a3671`](https://github.com/AdvanceUCT/unify-student-wallet/commit/b9a3671fa959791d4b212188cb0b5719acc89c97) | Active; Android is the primary supported runtime |
| Issuer/verifier agent | [`unify-agent-service@d7f827e`](https://github.com/AdvanceUCT/unify-agent-service/commit/d7f827ee7b76d613c4c9435bd3fe9a8082976121) | Active; public health check is responding and reports initialized |
| Standalone vendor portal | [`unify-vendor-portal@d8f9edb`](https://github.com/AdvanceUCT/unify-vendor-portal/commit/d8f9edbd186af822a108ed3629e3583eaa9d70b8) | Legacy scaffold; its intended capabilities now live under `/vendor` in the admin portal |

Overall status: **demo-capable, integrated PoC; operationally and security-wise not production-ready**.

## What is live

The following unauthenticated checks were performed during the snapshot:

| Check | Result |
|---|---|
| `https://unify-admin-portal.vercel.app/` | HTTP 200 after expected redirect to `/sign-in` |
| `https://voskuils.com/` | HTTP 200 after expected redirect to `/sign-in` |
| `https://unify-admin-portal.vercel.app/.well-known/assetlinks.json` | HTTP 200, JSON |
| `https://voskuils.com/.well-known/assetlinks.json` | HTTP 200, JSON |
| `https://agent-api.voskuils.com/api/health` | HTTP 200; `status=ok`, `isInitialized=true` |

GitHub's deployment record ties the current Vercel production deployment to admin commit `9b4a604`, the tip of `main`. The agent health response does not expose a build or commit identifier, so this audit confirms availability but **cannot prove which agent commit is deployed**.

## Branch conclusion

There is no single hidden branch that should replace `main` wholesale.

Two application branches contain credible, unmerged work:

1. [`unify-student-wallet#63`](https://github.com/AdvanceUCT/unify-student-wallet/pull/63), `fix/checkout-single-flow`, is directly one commit ahead of `main`, mergeable, and has green checks. It fixes duplicate checkout verification preparation/claim behavior. It is blocked only by the required review at the time of this snapshot and is the clearest candidate to merge.
2. [`unify-admin-portal#73`](https://github.com/AdvanceUCT/unify-admin-portal/pull/73), `feature/vendor-application-improvementse`, adds vendor organisation fields, country selection, application reasons, and three migrations. Its checks are green, but it is one commit behind `main` and requires review. Update it from `main`, rerun checks, and review the migrations before merge.

The remaining ahead branches are Dependabot updates, old/superseded work, docs-only residue, or unreviewed experimental payment/blockchain work. See [Repository and branch audit](./REPOSITORY_BRANCH_AUDIT.md) for the full divergence table.

## Most important findings

- All four protected `main` branches last passed their required `build-app` and `ci-lint-type-test` checks.
- Dependency security is not green. The latest scheduled audits reported substantial transitive findings, including critical findings in the agent and wallet dependency trees. The wallet workflow is advisory-only and therefore appears green even when its audit reports findings.
- There are no Git tags or GitHub Releases in any of the four repositories. The wallet's release APK is built locally; CI does not publish a signed APK.
- The admin portal has a traceable Vercel deployment and committed Prisma migrations. The agent has persistent state in an Askar/JSON Docker volume, but its public health response lacks deployment provenance.
- The same vendor product appears in two repos. The active, database-backed implementation is inside `unify-admin-portal`; `unify-vendor-portal` remains a typed mock scaffold. Keeping both active without a clear status label creates ownership and security-update ambiguity.
- The agent uses Credo `0.5.x`; the wallet uses Credo `0.6.3`. The protocol currently works at the PoC level, but the version skew should be tested deliberately before either side is upgraded.

## Documentation map

- [Architecture and flows](./ARCHITECTURE.md) — runtime boundaries, trust model, data ownership, and end-to-end flows.
- [Repository and branch audit](./REPOSITORY_BRANCH_AUDIT.md) — repository inventory, exact refs, all branch divergence, open PRs, deployment and governance state.
- [Operations, risks and next steps](./OPERATIONS_RISKS_AND_NEXT_STEPS.md) — verification evidence, risks ordered by priority, and a practical stabilization plan.

## Scope and limitations

This was a repository and externally observable operational audit, not a penetration test, privacy impact assessment, disaster-recovery exercise, ledger correctness proof, or authenticated end-to-end transaction test. No production credentials or private user data were accessed. Branch freshness is based on Git history and GitHub state; an ahead commit count is not an endorsement of correctness or readiness.
