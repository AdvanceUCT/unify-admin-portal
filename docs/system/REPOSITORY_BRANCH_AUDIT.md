# Repository and branch audit

Snapshot: **2026-09-04 00:28 SAST**. Remote refs were freshly fetched from GitHub. `Behind` and `Ahead` are commit counts for `main...branch`; they describe graph divergence, not quality.

## Organisation inventory

| Repository | Default tip | Last application push | Open PRs | Default-branch role |
|---|---|---:|---:|---|
| [`unify-admin-portal`](https://github.com/AdvanceUCT/unify-admin-portal) | `9b4a604` | 2026-09-02 | 5 | Active web/admin/vendor baseline |
| [`unify-student-wallet`](https://github.com/AdvanceUCT/unify-student-wallet) | `b9a3671` | 2026-08-16 | 6 | Active mobile baseline |
| [`unify-agent-service`](https://github.com/AdvanceUCT/unify-agent-service) | `d7f827e` | 2026-08-16 | 0 | Active issuer/verifier baseline |
| [`unify-vendor-portal`](https://github.com/AdvanceUCT/unify-vendor-portal) | `d8f9edb` | 2026-05-07 | 3 | Legacy mock scaffold |

All repositories are public, unarchived, non-forks with `main` as the default branch. There are no tags or GitHub Releases.

## Branches that deserve action

| Priority | Repository/branch | Divergence | GitHub state | Assessment |
|---|---|---:|---|---|
| Review/merge | `unify-student-wallet/fix/checkout-single-flow` | 0 behind, 1 ahead | [PR #63](https://github.com/AdvanceUCT/unify-student-wallet/pull/63), mergeable, green checks, review required | Focused checkout race/duplication fix with tests; best candidate to advance `main` |
| Update/review | `unify-admin-portal/feature/vendor-application-improvementse` | 1 behind, 2 ahead | [PR #73](https://github.com/AdvanceUCT/unify-admin-portal/pull/73), mergeable but `BEHIND`, green checks, review required | Meaningful vendor form/schema change; update from `main` and review all three migrations before merge |
| Security review | `unify-student-wallet/dependabot/npm_and_yarn/fast-uri-3.1.7` | 0 behind, 1 ahead | [PR #64](https://github.com/AdvanceUCT/unify-student-wallet/pull/64), green checks, review required | Current focused security dependency candidate; merge according to normal dependency policy |
| Scope decision | `unify-admin-portal/feature/admin-portal-payments` | 1 behind, 4 ahead | No PR | Adds Solidity/Hardhat, Ethereum student registry/balance/payment APIs and vendor QR payments; large unreviewed scope expansion, not a replacement baseline |
| Scope decision | `unify-student-wallet/feature/Studnet-wallet-Payment` | 2 behind, 2 ahead | No PR | Companion blockchain/payment wallet work; experimental and conflicts with the stated simulated-payment PoC scope unless product scope is explicitly changed |

## Admin portal branches

`main` tip: `9b4a604`, 2026-09-02, “Fix layout and dialog model (#72)”.

| Branch | Behind | Ahead | Tip date | Disposition |
|---|---:|---:|---:|---|
| `dependabot/npm_and_yarn/js-yaml-4.3.1` | 3 | 1 | 2026-08-10 | Open PR #67; build check failing; update/recreate rather than merge stale head |
| `dependabot/npm_and_yarn/multi-b2624a5d70` | 2 | 1 | 2026-08-12 | Open PR #70; build check failing; Prisma/Hono updates need refreshed validation |
| `dependabot/npm_and_yarn/nanoid-3.3.18` | 3 | 1 | 2026-08-10 | Open PR #66; build check failing; update/recreate |
| `dependabot/npm_and_yarn/next-16.3.0` | 3 | 1 | 2026-08-10 | Open PR #68; build check failing; now stale relative to later advisories/releases |
| `faeture/Vendor-Submission-Record` | 15 | 4 | 2026-08-02 | Old, misspelled feature branch; current vendor application history exists on `main`; inspect only for any intentionally omitted behavior |
| `feature/Vendor-Application-Resubmission` | 15 | 6 | 2026-08-02 | PR #55 was closed unmerged; do not treat as current |
| `feature/Vendor-Unsaved-Changes` | 15 | 5 | 2026-08-02 | Old divergent UI work; `main` already contains shared unsaved-change handling |
| `feature/admin-portal-payments` | 1 | 4 | 2026-08-19 | No PR; large experimental Ethereum/payment scope; hold for product and security review |
| `feature/admin-schema-creation` | 22 | 3 | 2026-07-10 | Superseded by versioned schema/setup work on `main` |
| `feature/admin-settings-Page` | 15 | 2 | 2026-08-01 | Superseded by current settings/profile/agent-health UI |
| `feature/admin-student-credentials` | 22 | 7 | 2026-07-19 | Superseded by current issuance and lifecycle implementation |
| `feature/admin-vendor-management` | 23 | 14 | 2026-07-01 | Superseded by later merged vendor work |
| `feature/batch-credential-issuance` | 33 | 2 | 2026-05-10 | Superseded by current batch issuance implementation |
| `feature/batch-issuance` | 31 | 1 | 2026-05-14 | Superseded by current batch issuance implementation |
| `feature/sub-vendors` | 12 | 1 | 2026-08-05 | Likely precursor to current branch/staff hierarchy; not current baseline |
| `feature/university-payment-onboarding` | 1 | 0 | 2026-08-16 | Fully merged into `main`; delete remote branch when convenient |
| `feature/vendor-application-improvementse` | 1 | 2 | 2026-09-01 | Active PR #73; update, review and retest |

PR #73 changes 17 files (`+837/-184`), including three database migrations, country data/combobox UI, vendor organisation fields and a terminology change from verification reasons to application reasons.

## Student wallet branches

`main` tip: `b9a3671`, 2026-08-16, “fix: recover checkout proof presentation flow (#62)”.

| Branch | Behind | Ahead | Tip date | Disposition |
|---|---:|---:|---:|---|
| `Mediator&DidComm` | 14 | 1 | 2026-05-09 | Old prototype; superseded by current Credo/mediator implementation |
| `dependabot/github_actions/github-actions-9b61906d8b` | 0 | 1 | 2026-08-17 | Open PR #57; green checks; review/update action pins |
| `dependabot/npm_and_yarn/development-dependencies-492a9e1e21` | 0 | 1 | 2026-08-17 | Open PR #59; build/CI failing |
| `dependabot/npm_and_yarn/fast-uri-3.1.7` | 0 | 1 | 2026-09-03 | Open PR #64; green checks; current security candidate |
| `dependabot/npm_and_yarn/nanoid-3.3.18` | 3 | 1 | 2026-08-10 | Open PR #56; green on stale base; refresh before merge |
| `dependabot/npm_and_yarn/production-dependencies-965bfe4bd0` | 0 | 1 | 2026-08-17 | Open PR #58; build/CI failing; too broad to merge without native/E2E testing |
| `feat/settings-tab-navigation` | 2 | 1 | 2026-08-13 | No PR; small older UI change; assess separately, not as newer baseline |
| `feature/Confirmation-Screen` | 9 | 8 | 2026-06-30 | Old divergent UI work; superseded by later wallet overhaul |
| `feature/Studnet-wallet-Payment` | 2 | 2 | 2026-08-18 | No PR; experimental blockchain payment flow and new native dependency surface |
| `fix/checkout-single-flow` | 0 | 1 | 2026-08-16 | Active PR #63; focused and green; review/merge candidate |

PR #63 changes seven files (`+354/-57`), introduces a checkout preparation coordinator, and adds/updates tests for cold-install and verification flow behavior.

## Agent service branches

`main` tip: `d7f827e`, 2026-08-16, “Merge pull request #12 from AdvanceUCT/fix/connectionless-proof-invitations”.

| Branch | Behind | Ahead | Merged into `main` | Disposition |
|---|---:|---:|---|---|
| `code-cleanup` | 27 | 0 | Yes | Delete remote branch when convenient |
| `codex/branch-workflow-coverage` | 52 | 0 | Yes | Delete remote branch when convenient |
| `docs/comment-agent-core-flows` | 4 | 0 | Yes | Delete remote branch when convenient |
| `feature/Verification-backend` | 24 | 0 | Yes | Delete remote branch when convenient |
| `feature/agent-service-ledger-issuance-api` | 39 | 0 | Yes | Delete remote branch when convenient |
| `feature/credential-lifecycle-verification` | 11 | 0 | Yes | Delete remote branch when convenient |
| `feature/live-credential-status-webhooks` | 33 | 0 | Yes | Delete remote branch when convenient |
| `feature/mediator-connection` | 35 | 0 | Yes | Delete remote branch when convenient |
| `feature/secure-checkout-verification` | 8 | 1 | No | Sole ahead commit is an older README rewrite; later documentation is on `main`; do not use as code baseline |
| `fix/connectionless-proof-invitations` | 1 | 0 | Yes | Delete remote branch when convenient |
| `fix/verifier-request-attributes` | 21 | 0 | Yes | Delete remote branch when convenient |

Conclusion: agent `main` is unambiguously the current source baseline.

## Standalone vendor portal branches

`main` tip: `d8f9edb`, 2026-05-07. Every non-main branch is a one-commit Dependabot branch based directly on `main`.

| Branch | Behind | Ahead | PR/check state | Disposition |
|---|---:|---:|---|---|
| `dependabot/npm_and_yarn/js-yaml-4.3.0` | 0 | 1 | PR #8; build/CI green | Dependency-only; moot if repository is archived |
| `dependabot/npm_and_yarn/multi-4b10dec7ea` | 0 | 1 | PR #10; only neutral CodeQL reported; mergeability unknown | Contains Next/PostCSS lockfile update; do not merge without full checks |
| `dependabot/npm_and_yarn/vite-8.0.16` | 0 | 1 | PR #7; build/CI green | Dependency-only; moot if repository is archived |

These branches are chronologically newer than `main`, but none contains newer product functionality.

## Governance and delivery state

All four `main` branches have the same protection baseline:

- required, strict `ci-lint-type-test` and `build-app` checks;
- one approving review;
- stale reviews dismissed after new commits;
- administrator enforcement and conversation resolution;
- force pushes and deletion disabled.

No repository has a tag or release. The release workflows trigger only on a pre-existing `v*.*.*` tag and create generated release notes. They do not build, sign or attach an application artifact.

Only the admin repository exposes GitHub deployment records in this audit. The latest Production record is successful and maps `main` commit `9b4a604` to Vercel. Agent and wallet release provenance must be tracked separately today.

## Recommended branch actions

1. Review and merge wallet PR #63 after confirming the checkout flow on a real Android build.
2. Bring admin PR #73 up to date with `main`; rerun all checks and exercise its migrations against a production-like database clone before approval.
3. Review wallet PR #64 and the other focused dependency PRs; replace stale grouped updates with smaller current updates where possible.
4. Decide explicitly whether blockchain/payment work is in scope. Until then, keep both unreviewed payment branches out of the baseline.
5. Archive or clearly label the standalone vendor portal, then close/retire its dependency PRs according to that decision.
6. Delete fully merged and clearly superseded remote branches after owners confirm no archaeology value is needed.
