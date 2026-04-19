# UNIFY Decisions

Status: living decision log. Last updated: 2026-04-19.

Use this file to understand why the repo is shaped the way it is. Add new decisions when a future change would otherwise need chat history to explain it.

Primary source alignment: decisions in this file should stay consistent with `BA Innovation.docx`.

## 1. Use Three Repos

Decision: keep the student wallet, admin portal, and vendor portal in separate repos.

Reasoning:

- Each system has a different runtime and deployment target.
- The student wallet is React Native.
- The admin and vendor portals are planned as Next.js web apps.
- Separate repos reduce accidental coupling while the project is still small.
- The BA document mentions npm workspaces and a single-codebase style setup; the current implementation intentionally uses three repos because the team requested separate repos for the three user-facing systems.

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

Alignment note:

- The BA document names React Native, React Navigation, Metro, Hermes, react-native-vision-camera, react-native-fs, react-native-get-random-values, Credo, and Aries Askar as target mobile technologies.
- Expo Router is built on React Navigation and keeps the scaffold compatible with the React Native direction.
- Current Expo SecureStore usage is a scaffold placeholder. Final VC/key storage should align with Credo and Aries Askar.
- If Credo mobile integration requires native modules that Expo Go cannot support, move to an Expo development build or prebuild rather than abandoning the React Native direction.

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

## 10. Build a Proof of Concept, Not Production Infrastructure

Decision: keep the current build aligned with the proof-of-concept scope in the BA document.

In scope:

- Simulated student records.
- Simulated service providers and vendors.
- Simulated wallet balances, top-ups, payments, and transaction history.
- Simulated external verification scenarios.
- Controlled end-to-end demo flows.

Out of scope:

- Live university system integration.
- Real institutional data.
- Real payment gateways or vendor settlement.
- Building Hyperledger Indy, BCovrin, or SSI infrastructure ourselves.
- Full production deployment or national rollout.

## 11. Use Credo, AnonCreds, DIDComm, and Indy as the Target Identity Stack

Decision: the final identity implementation should follow the BA document's target SSI stack.

Target components:

- W3C Verifiable Credentials.
- AnonCreds for selective disclosure.
- Credo issuer, holder/wallet, and verifier agents.
- DIDComm for credential exchange and proof presentation messaging.
- Hyperledger Indy and BCovrin for the development trust ledger.
- Indy VDR for ledger access.
- Aries Askar and SQLite for secure wallet storage.

Current state:

- Frontend scaffolds and contracts exist.
- Identity services are not implemented yet.
- Mock data should remain clearly marked until the backend/identity service exists.

## 12. Model Credential Lifecycle Explicitly

Decision: credential lifecycle should use the BA document's lifecycle states rather than only a loose display status.

Lifecycle states:

- Pending.
- Issuing.
- Offered.
- Active.
- Suspended.
- Revoked.
- Expired.
- Renewed.

Reasoning:

- Admin lifecycle operations, wallet display, verifier decisions, and audit logs all depend on credential state.
- Suspension is reversible; revocation is terminal for access decisions.
- Renewal should expire or replace the old credential and issue an updated one.

## 13. Use Environment Secrets for Deployments

Decision: use GitHub environments when deployment starts.

Recommended environments:

- `dev`
- `staging`
- `production`

Reasoning:

- Environment secrets keep deploy configuration separate from repo-wide secrets.
- Production can later require manual approval through environment protection rules if the GitHub plan supports it.
