# UNIFY Workflow

Status: living workflow guide. Last updated: 2026-04-19.

This file explains how work should enter the repos and which GitHub features are active or planned.

Primary source alignment: delivery milestones should stay consistent with `BA Innovation.docx`.

## Source of Truth

Use GitHub Issues and one GitHub Project for delivery tracking.

Recommended project fields:

- Status: Backlog, Ready, In Progress, Review, Done.
- Priority: High, Medium, Low.
- Area: Wallet, Issuer, Verifier, Admin, Shared, DevOps.
- Sprint / Week.
- Assignee.
- Demo Ready: Yes / No.

Recommended milestones:

- MVP.
- Demo 1.
- Final Submission.

The BA document also defines academic iteration targets:

- Iteration One / MVP: due 18 May 2026.
- Iteration Two: due 7 August 2026.
- Iteration Three: due 17 September 2026.
- Iteration Four / Final: due 23 October 2026.

Keep GitHub milestones simple, but map issues to these iteration dates where possible.

## Delivery Scope by Iteration

### Iteration One / MVP

Target flows:

- Define architecture and technology stack.
- Design W3C-compatible student VC schema with selective disclosure fields.
- Generate simulated student registration data.
- Implement VC issuer service and batch issuance pipeline for at least 100 simulated VCs.
- Implement VC delivery and activation mechanism.
- Implement VC revocation service with status reflected across services within the target 60-second window where feasible for the prototype.
- Scaffold student wallet navigation and auth flow.
- Build wallet VC activation, VC display, balance/top-up, QR payment scan, and transaction history screens.
- Demonstrate issue VC -> activate in wallet -> verify.

### Iteration Two

Target flows:

- Scaffold admin portal with role-based access control.
- Implement student VC lifecycle screens for issue, renew, revoke, suspend, and bulk operations.
- Implement validity and eligibility rule configuration.
- Implement vendor approval and provisioning of vendor credentials/API keys/vendor DID.
- Implement admin transaction monitoring and audit log views.
- Scaffold vendor portal with admin-provisioned login.
- Implement vendor service/pricing rules, QR display, verification/payment processing, and transaction screen.
- Demonstrate admin issues VC -> vendor verifies -> payment processed.

### Iteration Three

Target flows:

- Implement standalone transaction log database schema.
- Write wallet, vendor, and verifier events into transaction/audit logs.
- Expose filtered/exportable log data in admin portal.
- Implement external top-up link/QR flow.
- Implement VC sharing for external verification.
- Implement credential backup/recovery and wallet security settings.
- Demonstrate external top-up -> spend at vendor -> audit log entry.

### Iteration Four / Final

Target flows:

- Design and implement standard verifier API.
- Build simulated external integration demo.
- Write external developer API documentation.
- Run system hardening and security review.
- Run performance/load testing with a target VC verification time under 3 seconds.
- Polish wallet and portal UI, error states, empty states, and accessibility.
- Prepare final demo scripts, user guides, report, and walkthrough video.

## Branching

- Create feature branches from `main`.
- Use the `codex/` prefix for Codex-created maintenance branches unless a task-specific branch already exists.
- Use descriptive feature branch names for larger product work.
- Do not push directly to `main`.

Examples:

```bash
git switch main
git pull
git switch -c feature/wallet-activation
```

## Issues

Issue forms exist for:

- Bug report.
- Feature request.
- Task / chore.
- Security concern.

Use issues for all non-trivial work. Link PRs to issues before merging.

## Pull Requests

Every PR should include:

- What changed.
- What was tested.
- Which issue it closes.
- Screenshots or demo notes when UI changes.
- Security notes when credentials, auth, workflows, or deployment settings change.

Draft PRs are encouraged while work is still in progress.

## Reviews

Current review policy:

- Normal changes need at least one approval.
- Security-sensitive changes should receive two approvals by team policy.
- Conversations should be resolved before merge.
- CODEOWNERS review is not required.

Security-sensitive areas include:

- Wallet credential storage or presentation logic.
- Issuer and credential lifecycle logic.
- Verifier and service-point verification logic.
- Admin authorization or governance logic.
- Payment, wallet balance, top-up, or transaction logging logic.
- POPIA-sensitive student data handling.
- Credo, DIDComm, AnonCreds, Indy VDR, BCovrin, Hyperledger Indy, or Aries Askar integration.
- GitHub Actions workflows.
- Dependency, secret, environment, or release changes.

## Merge Policy

Recommended policy:

- Feature branches only.
- Squash merge only.
- Delete branch after merge.
- Keep linear history.
- Do not close issues manually when a PR can close them with `Closes #123`.

## Active GitHub Files

Each repo should contain:

- `.github/ISSUE_TEMPLATE/bug.yml`
- `.github/ISSUE_TEMPLATE/feature.yml`
- `.github/ISSUE_TEMPLATE/task.yml`
- `.github/ISSUE_TEMPLATE/security.yml`
- `.github/pull_request_template.md`
- `.github/dependabot.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/build.yml`
- `.github/workflows/security.yml`
- `.github/workflows/release.yml`
- `SECURITY.md`
- `CONTRIBUTING.md`

## Active Checks

Workflow intent:

- `ci.yml`: runs install, lint, typecheck, and tests on PRs and pushes to `main`.
- `build.yml`: runs app build checks on PRs and pushes to `main`.
- `security.yml`: runs scheduled and manual dependency/security checks.
- `release.yml`: runs on version tags and creates release notes or release artifacts.

Current branch protection status:

- Required status checks are not enabled.
- Workflows still run and should be treated as merge gates by team process.
- This avoids GitHub blocking merges when expected check names drift from actual workflow job names.

## Security-Sensitive Review Check

The `security-sensitive-review` job can fail when sensitive paths change. That is intentional.

Current behavior:

- It is advisory because required status checks are not enabled.
- If it fails, add review attention and get two approvals before merge.
- Do not bypass it silently for wallet, issuer, verifier, admin, workflow, dependency, or secret-related changes.

## Local Validation

Student wallet:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Wallet implementation should also add targeted tests for:

- PIN/biometric gate behavior.
- QR payload validation.
- Credential lifecycle state handling.
- Payment confirmation and rollback behavior for simulated payments.
- Secure-storage wrapper behavior.

Admin and vendor portals before scaffolding:

- There may be no package scripts yet.
- GitHub workflows should handle missing package files gracefully.

Admin and vendor portals after Next.js scaffolding:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Admin/vendor implementation should add tests for:

- Role-based access.
- Credential lifecycle actions.
- Vendor onboarding and approval.
- QR generation.
- Verification result handling.
- Audit/transaction filtering.

## Deployments

When deployment starts, create GitHub environments:

- `dev`
- `staging`
- `production`

Store deployment secrets in environment secrets. Use production approval rules if the GitHub plan supports them.

## Labels

Recommended labels:

- `bug`
- `feature`
- `task`
- `blocked`
- `high-priority`
- `wallet`
- `issuer`
- `verifier`
- `admin-portal`
- `docs`
- `security`
