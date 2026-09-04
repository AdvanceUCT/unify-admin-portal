# UNIFY architecture and flows

This document describes the implementation visible on the default branches as of 2026-09-04. It distinguishes current runtime ownership from older planning material.

## Runtime topology

```text
University administrators                         Approved vendors
          |                                               |
          +-------------------+---------------------------+
                              v
             Admin + Vendor Portal (Next.js / Vercel)
             - Better Auth and role enforcement
             - PostgreSQL via Prisma
             - student, credential, vendor and audit state
             - public activation and verification pages
                              |
                              | server bearer key + request IDs
                              v
                   Agent Service (Express / Docker)
             - Credo issuer and verifier agent
             - Askar wallet and JSON operational stores
             - issuance, proof and lifecycle authority
             - signed events back to the portal
                   |                         |
         Indy/AnonCreds ledger              | DIDComm / OOB proofs
         BCovrin test network               v
                                   Student Wallet (Expo native)
                                   - holder keys and credentials
                                   - consent and proof presentation
                                   - encrypted local backup
```

The standalone `unify-vendor-portal` is not part of this current topology. It is a static/mock Next.js scaffold. The active vendor application is the `/vendor` route group in `unify-admin-portal`, sharing authentication infrastructure and PostgreSQL data with the admin application.

## Component ownership

### Admin and vendor portal

Repository: [`AdvanceUCT/unify-admin-portal`](https://github.com/AdvanceUCT/unify-admin-portal)

Technology: Next.js 16.2.6, React 19.2.4, TypeScript, Better Auth, Prisma 7.8, PostgreSQL/Supabase, Resend and Vercel.

It owns:

- invite-only administrator accounts, vendor accounts, sessions, roles and permissions;
- university profile and credential-schema governance;
- student records, CSV import, custom fields and import audit records;
- issuance orchestration and a portal-side view of credential lifecycle state;
- vendor applications, documents, approval, profiles, branches and staff scope;
- verification request/result records, vendor API keys, encrypted webhook configuration and delivery history;
- administrator and credential audit logs;
- public activation/verification landing pages and Android App Links metadata.

The Prisma history contains 46 committed migration directories and 29 models. The production build runs `prisma migrate deploy` only during a Vercel production build and fails closed when `DIRECT_URL` is unavailable.

The portal calls the agent through a server-only client. It adds a bearer API key and correlation ID, applies bounded timeouts, retries safe reads only, and does not automatically replay writes.

### Agent service

Repository: [`AdvanceUCT/unify-agent-service`](https://github.com/AdvanceUCT/unify-agent-service)

Technology: Node.js 22, TypeScript, Express 4, Credo 0.5.x, AnonCreds, Indy VDR, Aries Askar and Docker.

It owns the authoritative identity operations:

- issuer DID, schema, credential definition and revocation registry creation;
- DIDComm connections, credential offers and tokenized activation resolution;
- credential exchange state plus suspend/reactivate/revoke transitions;
- trusted credential-definition policies and verifier service points;
- static and checkout proof sessions, non-revocation checks and normalized decisions;
- short-lived result capabilities and cleanup;
- signed credential and verification events sent back to the portal.

Persistence is split between the encrypted Askar wallet and small locked JSON stores under `/home/node/.afj`. Docker Compose mounts that entire directory as the `agent-data` volume. Deleting that volume deletes issuer keys and important protocol/metadata state; it is not ordinary cache cleanup.

Public routes are intentionally narrow:

- `/api/health`;
- wallet activation resolution;
- wallet verification session creation, checkout claim and capability-protected result polling;
- `/tails/*` for revocation proofs.

All administrator/verifier management routes require the shared server bearer key.

### Student wallet

Repository: [`AdvanceUCT/unify-student-wallet`](https://github.com/AdvanceUCT/unify-student-wallet)

Technology: Expo SDK 54, React Native 0.81.5, React 19.1, Expo Router 6, Credo 0.6.3 and native Askar/AnonCreds/Indy VDR modules.

It owns:

- on-device holder keys, connections and credentials;
- PIN, auto-lock, biometric-unlock preference and secure session metadata;
- activation-link and out-of-band invitation handling;
- requested-attribute review, explicit consent and proof presentation;
- a bounded local verification activity history;
- password-encrypted `.unifywallet` backup and restore.

Android native development/release builds are the primary supported target. Expo Go cannot load the native identity modules. The web target can render UI but cannot perform the native wallet operations.

The committed example configuration trusts `voskuils.com` for App Links and calls `https://agent-api.voskuils.com` for wallet-facing activation and verification APIs. These public Expo variables are endpoints/allowlists, not secrets.

### Legacy vendor portal

Repository: [`AdvanceUCT/unify-vendor-portal`](https://github.com/AdvanceUCT/unify-vendor-portal)

Technology: Next.js 16.2.4 with typed mock data.

This repository has static screens for sign-in, dashboard, payments, rules, service points, transactions and verification, but no environment contract, database or live identity integration. Its last application commit was 2026-05-07. Its planned responsibilities have since been implemented in the admin repository. Treat it as historical/reference code until the organisation explicitly archives it or assigns it a new bounded purpose.

## Data and trust boundaries

| Data or authority | System of record | Boundary |
|---|---|---|
| University, students, vendors, applications and portal audit | Portal PostgreSQL | Server-only database access through Prisma |
| Vendor supporting documents | Private Supabase Storage | Service-role access remains server-side; signed download URLs are short-lived |
| Issuer/verifier keys and Credo protocol state | Agent Askar wallet | Persistent Docker volume; never exposed to portal clients |
| Trust policy, service points, activation/verification/lifecycle metadata | Agent locked JSON stores | Persistent Docker volume; portal retains correlated business/audit records |
| Holder keys and credentials | Student device Askar wallet | Not uploaded to the portal; encrypted backup is user-controlled |
| DIDs, schemas, credential definitions and revocation state | BCovrin test ledger | Public identity infrastructure; no student records or presented PII should be written there |
| Vendor integration tokens | Portal PostgreSQL | Plain API token displayed once; prefix and keyed hash retained |
| Vendor webhook secret | Portal PostgreSQL | Encrypted at rest with a server-side encryption key |
| Verification verdict | Agent service | Wallet/client claims are not authoritative |

## Main flows

### University bootstrap and issuance

1. A privileged administrator configures the university profile.
2. The portal asks the agent to create/read an issuer DID and register schema, credential definition and optional revocation registry.
3. Student records are imported or selected in the portal.
4. The portal requests individual or batch activation links from the agent.
5. The portal emails a short-lived activation link; the raw credential invitation is not placed in the email URL.
6. The wallet resolves the capability with the public agent endpoint, opens the OOB invitation and accepts or declines the credential.
7. Agent events update portal-side issuance and audit records. Batch operations retain item-level success/failure and can retry failed items.

### Credential lifecycle

1. An authorized portal user requests suspend, reactivate, revoke or renew.
2. The agent changes the appropriate AnonCreds revocation state and preserves the business distinction in its lifecycle store.
3. A signed, idempotent lifecycle event updates the portal record and audit trail.
4. Verification requires a current non-revocation proof, so the authoritative decision remains with the agent/ledger path.

### In-person service-point verification

1. An approved vendor branch is provisioned as an agent verifier service point.
2. The branch displays a stable QR containing only its public service-point identifier.
3. Each scan creates a new, rate-limited, expiring proof session.
4. The wallet shows the verifier and requested attributes and obtains explicit consent.
5. The agent validates proof cryptography, trusted credential definition, required attributes and current non-revocation status.
6. The portal shows the branch-scoped result; detailed attributes are short-lived on the agent side.

### Checkout verification

1. A vendor backend uses a scoped `unify_vk_...` API key and its `checkoutId` to call the portal.
2. The portal uses vendor plus checkout ID as an idempotency key and creates an unclaimed agent session.
3. The wallet opens a capability-bearing checkout link and claims it exactly once.
4. The agent creates the proof exchange only after a valid claim, then makes the authoritative decision.
5. The vendor polls the portal or receives a portal-signed webhook. The external result is deliberately minimal and excludes disclosed credential attributes.

## Runtime and deployment observations

- The admin/vendor web application is deployed from `unify-admin-portal` to Vercel and custom domain `voskuils.com`.
- `assetlinks.json` is reachable on both the Vercel and custom domains, supporting Android App Links.
- The agent public health endpoint is reachable and reports its Credo agent initialized.
- The repository does not expose agent build SHA/version through health or status, so deployment-to-source traceability is incomplete.
- No repository has a tag or GitHub Release. Release workflows only create notes after a tag; they do not create a deployable artifact.
- The wallet's signed APK workflow is local and guarded by developer-held signing configuration. There is no organisation-visible artifact provenance in GitHub Releases.

## Compatibility concerns to manage deliberately

- Agent Credo `0.5.x` and wallet Credo `0.6.3` are on different minor lines. Preserve an end-to-end issuance and proof compatibility suite before upgrades.
- Portal and agent duplicate portions of verification/lifecycle metadata by design. Event IDs, request IDs and idempotency rules must remain stable to prevent divergent business state.
- The portal's default `NEXT_PUBLIC_API_BASE_URL` remains `mock://unify-admin`, while real identity operations use server-side modules and `AGENT_SERVICE_URL`. New contributors should not mistake the mock client for the production integration boundary.
- BCovrin is a test ledger. Reset, outage and governance expectations differ materially from a production ledger network.
