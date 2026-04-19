# UNIFY Workflow

Status: living workflow guide. Last updated: 2026-04-19.

This file explains how work should enter the repos and which GitHub features are active or planned.

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
