# UNIFY Architecture

Status: living project context. Last updated: 2026-04-19.

This file is intentionally written for both humans and future Codex instances. Read it before making cross-repo changes.

## Systems

UNIFY is split into three public GitHub repositories under `AdvanceUCT`:

- `unify-student-wallet`: React Native mobile app for students.
- `unify-admin-portal`: planned Next.js web app for administrators and issuer operations.
- `unify-vendor-portal`: planned Next.js web app for vendors and service points.

A backend/API service is expected later. It does not currently have a dedicated repo in this workspace. Until that exists, API boundaries are documented in [API_CONTRACTS.md](API_CONTRACTS.md) and mocked where needed.

## Repo Responsibilities

### Student Wallet

The student wallet owns the student-facing mobile experience:

- Sign-in and session state.
- Wallet activation.
- Student credential display.
- Credential presentation behavior.
- QR payload parsing and validation.
- Secure local storage wrappers.
- Payment or service-point initiation flows from the student side.

Current implementation status:

- Expo Router scaffold exists.
- App screens are in `app/`.
- Shared mobile UI primitives are in `src/components/`.
- Mock API types and data are in `src/lib/api/`.
- QR validation lives in `src/lib/validation/qrPayload.ts`.

### Admin Portal

The admin portal owns administrative and issuer workflows:

- Credential issuing.
- Credential suspension, revocation, and renewal.
- Student lookup and governance views.
- Audit-oriented admin workflows.
- Operational reporting.

Current implementation status:

- Repo governance files exist.
- Next.js app scaffold is planned but not implemented yet.

### Vendor Portal

The vendor portal owns service-point verification workflows:

- Vendor sign-in and access control.
- QR scanning or QR payload intake.
- Credential and payment verification result display.
- Vendor transaction history or operational views.

Current implementation status:

- Repo governance files exist.
- Next.js app scaffold is planned but not implemented yet.

## Expected Runtime Flow

1. Admin creates or updates a student credential through the admin portal.
2. Backend stores credential state and lifecycle audit events.
3. Student activates the wallet and obtains the current credential state.
4. Vendor scans a QR payload or receives a presentation from the wallet.
5. Backend verifies the presentation, credential status, nonce, and service-point context.
6. Vendor sees an allowed, denied, or pending result.
7. Admin can review lifecycle state and take actions such as suspend, revoke, or renew.

## Data Boundaries

- Student wallet should store only the minimum local state needed for offline-friendly UX and secure session continuity.
- Secrets belong in secure storage on device, not in plain AsyncStorage or source files.
- Production API keys and deploy credentials belong in GitHub environment secrets, not repo-wide committed files.
- Mock student data must stay clearly marked as mock data.
- Real student data should not be committed, logged, or placed in test fixtures.

## Integration Boundaries

- The wallet should treat the backend as the authority for credential status.
- The vendor portal should not trust QR payload content without backend verification.
- The admin portal should be the primary UI for credential lifecycle actions.
- Shared API shapes should be kept aligned with [API_CONTRACTS.md](API_CONTRACTS.md) until a shared package or generated client exists.

## Delivery Architecture

Each repo has GitHub collaboration files:

- Issue forms for bug reports, feature requests, tasks/chores, and security concerns.
- Pull request template.
- Dependabot configuration.
- CI, build, security, and release workflows.
- `SECURITY.md` and `CONTRIBUTING.md`.

Main branches are protected. Work should enter through pull requests.
