# UNIFY Decisions

Status: living decision log. Last updated: 2026-04-19.

Use this file to understand why the repo is shaped the way it is. Add new decisions when a future change would otherwise need chat history to explain it.

## 1. Use Three Repos

Decision: keep the student wallet, admin portal, and vendor portal in separate repos.

Reasoning:

- Each system has a different runtime and deployment target.
- The student wallet is React Native.
- The admin and vendor portals are planned as Next.js web apps.
- Separate repos reduce accidental coupling while the project is still small.

Repos:

- `AdvanceUCT/unify-student-wallet`
- `AdvanceUCT/unify-admin-portal`
- `AdvanceUCT/unify-vendor-portal`

## 2. Use Expo for the Student Wallet

Decision: scaffold the student wallet with Expo Router, React Native, and TypeScript.

Reasoning:

- Expo provides a practical mobile development path for iOS, Android, and web smoke testing.
- Expo Router gives file-based navigation that is easy for future contributors and Codex instances to inspect.
- TypeScript keeps API and credential contracts explicit.

## 3. Use Next.js for Admin and Vendor

Decision: admin and vendor portals will be Next.js web apps.

Reasoning:

- Both portals are browser-based operational tools.
- Next.js is a practical default for authenticated dashboards, server-rendered pages, and deploy previews.
- The two web apps should remain separate because admin lifecycle operations and vendor verification operations have different user groups and risk profiles.

## 4. Protect Main

Decision: `main` is protected and should change only through pull requests.

Current policy:

- No direct pushes to `main`.
- Pull request required.
- At least one approval for normal changes.
- Security-sensitive changes require two approvals by team policy.
- Conversation resolution required.
- Linear history enabled.
- Squash merge is the recommended merge method.

## 5. Do Not Require CODEOWNERS Review

Decision: CODEOWNERS was removed and code-owner review is not required.

Reasoning:

- The team wanted to avoid blocking PRs on automatic owner routing while the repos are still being shaped.
- Review ownership should currently be handled through PR reviewers, labels, issue assignment, and the project board.

## 6. Keep Status Checks Advisory Until Stable

Decision: required status checks are currently not enforced in branch protection.

Reasoning:

- GitHub can block merges incorrectly if required status check names do not match reported workflow job names exactly.
- Earlier required checks waited forever when job names and expected names drifted.
- Workflows still run on PRs and should be treated as merge gates by team process.

Future change:

- Re-enable required status checks after workflow job names are stable and unique across workflows.

## 7. Treat Security-Sensitive Review as a Human Gate

Decision: wallet, issuer, verifier, admin, security, workflow, dependency, and environment changes should receive extra review.

Current implementation:

- A `security-sensitive-review` workflow job can fail when sensitive paths change.
- The job is currently advisory because required status checks are not enabled.
- The team should still require two human approvals before merging sensitive changes.

## 8. Use GitHub Issues and One Project for Delivery

Decision: track work through GitHub Issues and a single GitHub Project.

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

## 9. Document API Contracts Before Backend Buildout

Decision: keep draft API contracts in docs until a backend repo or generated API client exists.

Reasoning:

- The three frontends need a shared understanding of credential, wallet, and verifier data.
- Written contracts reduce repeated chat context and prevent each repo from inventing incompatible shapes.

## 10. Use Environment Secrets for Deployments

Decision: use GitHub environments when deployment starts.

Recommended environments:

- `dev`
- `staging`
- `production`

Reasoning:

- Environment secrets keep deploy configuration separate from repo-wide secrets.
- Production can later require manual approval through environment protection rules if the GitHub plan supports it.
