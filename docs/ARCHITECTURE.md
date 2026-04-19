# UNIFY Architecture

Status: living project context. Last updated: 2026-04-19.

This file is intentionally written for both humans and future Codex instances. Read it before making cross-repo changes.

Primary source alignment: this architecture follows `BA Innovation.docx`, which defines UNIFY as a proof-of-concept student digital identity and wallet ecosystem sponsored by IDS.

## Systems

UNIFY is split into three public GitHub repositories under `AdvanceUCT`:

- `unify-student-wallet`: React Native mobile app for students.
- `unify-admin-portal`: planned Next.js web app for administrators and issuer operations.
- `unify-vendor-portal`: planned Next.js web app for vendors and service points.

A backend/API service is expected later. It does not currently have a dedicated repo in this workspace. Until that exists, API boundaries are documented in [API_CONTRACTS.md](API_CONTRACTS.md) and mocked where needed.

## Proof-of-Concept Boundary

The project is a controlled proof of concept, not a production rollout.

In scope:

- Simulated student registration data.
- Student Verifiable Credential design and lifecycle management.
- Simulated issuance, renewal, suspension, revocation, and verification.
- Student wallet flows for storing, presenting, and using a credential.
- Simulated wallet balance, top-up, payment, and transaction history flows.
- Vendor/service-provider verification and payment acceptance flows.
- Admin monitoring, audit logs, service-provider onboarding, and rule configuration.
- External verification demonstration scenarios.

Out of scope:

- Direct integration with live university systems.
- Use of real institutional or student data.
- Real payment gateway, bank, card, mobile-money, billing, invoicing, settlement, or reconciliation integrations.
- Building Hyperledger Indy, BCovrin, or low-level SSI infrastructure ourselves.
- Full production deployment, national rollout, or enterprise operations tooling.

## Repo Responsibilities

### Student Wallet

The student wallet owns the student-facing mobile experience:

- Sign-in and session state.
- Wallet activation.
- Student credential display.
- Credential presentation behavior.
- QR payload parsing and validation.
- PIN and biometric unlock before credential presentation.
- Simulated wallet balance, top-up, payment, and transaction history.
- Secure local storage wrappers.
- Payment or service-point initiation flows from the student side.

Current implementation status:

- Expo Router scaffold exists.
- App screens are in `app/`.
- Shared mobile UI primitives are in `src/components/`.
- Mock API types and data are in `src/lib/api/`.
- QR validation lives in `src/lib/validation/qrPayload.ts`.
- Current secure storage is a scaffold wrapper; final credential/key storage should align with Aries Askar through the Credo wallet/agent integration.

### Admin Portal

The admin portal owns administrative and issuer workflows:

- Credential issuing.
- Batch issuance for simulated student cohorts.
- Credential suspension, revocation, and renewal.
- Validity and eligibility rule configuration.
- Service-provider onboarding and approval.
- Student lookup and governance views.
- Audit-oriented admin workflows.
- Operational reporting.

Current implementation status:

- Repo governance files exist.
- Next.js app scaffold is planned but not implemented yet.

### Vendor Portal

The vendor portal owns service-point verification workflows:

- Vendor sign-in and access control.
- Admin-provisioned vendor accounts.
- Service and pricing rule configuration.
- Vendor-generated QR codes for student verification or payment.
- Credential and payment verification result display.
- Vendor transaction history or operational views.

Current implementation status:

- Repo governance files exist.
- Next.js app scaffold is planned but not implemented yet.

## Core Platform Layers

The BA document describes five conceptual internal packages:

- Student Digital Identity: VC schema, issuer agent, and credential lifecycle.
- Student Wallet: credential storage, QR/NFC presentation, wallet balance, and secure access.
- Vendor Portal: service-provider QR generation, profiles, and transaction processing.
- Verification Layer: proof requests, credential validation, eligibility checks, and verifier API behavior.
- Admin and Governance Portal: issuance, revocation, validity rules, service-provider onboarding, and audit monitoring.

## Identity and Trust Model

UNIFY uses verifiable credentials rather than physical student cards as the primary identity mechanism.

Target identity technologies from the BA document:

- W3C Verifiable Credentials as the credential standard.
- AnonCreds for privacy-aware credentials and selective disclosure.
- Credo.js/Credo agents for issuer, holder/wallet, and verifier behavior.
- DIDComm for secure agent-to-agent communication.
- Hyperledger Indy as the identity ledger.
- BCovrin Test Network as the development ledger.
- Indy VDR for registering and resolving DIDs, schemas, and credential definitions.
- Aries Askar and SQLite for secure wallet credential/key storage.

Ledger rule:

- No personally identifiable information should be stored on the ledger.
- The ledger should hold public trust artefacts such as DIDs, schemas, credential definitions, revocation registries, and cryptographic references.
- Student data and operational records stay off-chain in application storage.

## Expected Runtime Flows

### Issue and Activate Student VC

1. Admin signs into the Admin and Governance Portal.
2. Admin selects one registered simulated student or starts a batch issuance run.
3. Backend validates the student against simulated registration data.
4. Issuer service generates a W3C/AnonCreds student VC from the approved schema.
5. Credo issuer agent signs the credential and creates an offer or activation invitation.
6. Student accepts the invitation through email, activation link, QR, or PIN flow.
7. Student wallet stores the credential securely and marks it active.
8. System records issuance in the audit log.

### Verify Student VC at Service Point

1. Vendor/service point requests student verification through the vendor portal or scanner.
2. Student unlocks the wallet with PIN or biometric authentication.
3. Wallet creates a verifiable presentation through QR or NFC.
4. Verifier receives the presentation and sends it to the verification layer.
5. Credo verifier agent validates signature, issuer trust, expiry, and revocation status.
6. System applies service-specific eligibility rules.
7. Vendor sees access granted, denied, or retry/pending state.
8. Verification event is recorded in the audit log with timestamp, service point, and result.

### Scan QR Code to Make Simulated Payment

1. Vendor displays a QR code for a payment request.
2. Student opens the wallet and unlocks with PIN or biometric authentication.
3. Wallet scans and validates the vendor QR payload.
4. Student confirms the payment.
5. Backend checks wallet balance and service eligibility.
6. Simulated balance is deducted and vendor receives confirmation.
7. Payment transaction is recorded for wallet history and admin audit views.

### Revoke, Suspend, Renew

1. Admin selects a student credential.
2. Admin chooses renew, suspend, reinstate, or revoke.
3. Backend validates authorization and business rules.
4. Credo/Indy integration updates credential state or revocation registry.
5. Wallet and verifier flows reflect updated credential state within the system objective of 60 seconds where feasible for the prototype.
6. Action is written to the audit log.

## Credential Lifecycle

The BA document defines these meaningful VC lifecycle states:

- Pending.
- Issuing.
- Offered.
- Active.
- Suspended.
- Revoked.
- Expired.
- Renewed.

Future code should model lifecycle transitions explicitly instead of treating credential status as only display text.

## Data Boundaries

- Student wallet should store only the minimum local state needed for offline-friendly UX and secure session continuity.
- Secrets belong in secure storage on device, not in plain AsyncStorage or source files.
- Production API keys and deploy credentials belong in GitHub environment secrets, not repo-wide committed files.
- Mock student data must stay clearly marked as mock data.
- Real student data should not be committed, logged, or placed in test fixtures.
- POPIA-sensitive student data must stay off-chain.
- Verification and payment logs should store only the fields needed for audit and demo reporting.

## Integration Boundaries

- The wallet should treat the backend as the authority for credential status.
- The vendor portal should not trust QR payload content without backend verification.
- The admin portal should be the primary UI for credential lifecycle actions.
- Shared API shapes should be kept aligned with [API_CONTRACTS.md](API_CONTRACTS.md) until a shared package or generated client exists.
- Vendor/service-provider accounts should be approved through the admin portal before verification access is granted.
- External verification should use a standard verifier API rather than custom integrations for each partner.

## Delivery Architecture

Each repo has GitHub collaboration files:

- Issue forms for bug reports, feature requests, tasks/chores, and security concerns.
- Pull request template.
- Dependabot configuration.
- CI, build, security, and release workflows.
- `SECURITY.md` and `CONTRIBUTING.md`.

Main branches are protected. Work should enter through pull requests.
