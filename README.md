# UNIFY Portal

The administration, governance, and vendor portal for the UNIFY student digital credential system. University teams use it to manage student records, issue and govern credentials, onboard service providers, audit verification activity, and manage closed-loop wallet payments and verification billing.

UNIFY is a proof of concept. It demonstrates privacy-preserving credential workflows; it is not a production student-records or payment platform.

## Deployed Portal

🔗 **Deployment:** [https://voskuils.com/](https://voskuils.com/)

## Login Credentials

### Super Administrator Account

```
Email: admin@example.com
Password: UnifyAdminSeed!2026
```

## Deployed Mock POS (for testing student wallet payments)

🔗 **Deployment:** [https://unify-pos-simulator.vercel.app/terminal](https://unify-pos-simulator.vercel.app/terminal)

## Login Credentials

### Demo Vendor Account

```
Email: technest-integration@voskuils.com
Password: 32qdpwBAg1pSz3xx7YlKea_M2gfn48X3!9a
```

### Demo POS Account 

```
Password: WSrhaDis9rWD3xr4iOsp64aEGTDkWX7s
```

# Admin Portal
## Current capabilities

| Area | What is implemented |
|---|---|
| Admin access | Invite-only Better Auth accounts, role-based permissions, password recovery, user status controls, and session revocation |
| University setup | University profile, issuer DID registration, credential schema creation, credential definition creation, and setup health checks |
| Student records | Search and detail views, CSV import preview/commit, reusable import mappings, and custom student fields |
| Credential issuance | Individual and filtered background batch issuance, activation-link delivery, live run progress, failed-item retry, and agent event reconciliation |
| Credential lifecycle | Configurable annual validity windows, per-student annual auto-renewal, renewal monitoring/recovery, and backend-owned suspend, reactivate, revoke, and expired-only manual renewal operations |
| Governance | Versioned credential schemas, append-oriented credential/audit event records, and a searchable administrator audit log |
| Vendor onboarding | Vendor sign-up, application and supporting-document review, approval history, profiles, branches, staff, branch assignments, and branch payment-access review |
| Verification | Static service-point links, dynamic single-use proof sessions, live vendor verification, checkout verification, status polling, exports, signed result webhooks, and billable usage snapshots |
| Vendor integrations | Verification and POS integration guides, branch-scoped API keys, separate encrypted verification/payment webhook configuration, delivery history APIs, and callback retry |
| Vendor payments | Branch payment-access applications, payout-destination capture, fixed-amount POS payment requests, payment history/export, live polling, durable full/partial refunds, vendor overdraft/top-ups, and threshold-based scheduled/manual payouts |
| Student wallet funding | Emailed OTP payment sessions, Paystack test-mode student top-ups, public external-funder top-ups, wallet activity, and payer-only receipt recovery |
| Verification billing | Effective-dated pricing policies, immutable verification charges, monthly vendor invoices, configurable invoice payment windows, overdue-invoice verification suspension, Paystack test checkout, reconciliation, billing exceptions, and operations summary |

## How the system fits together

```text
University administrator           Approved vendor
          |                              |
          v                              v
   Admin Portal UI  <---- PostgreSQL ---->  Vendor Portal / API
          |
          | authenticated server-to-server requests
          v
   UNIFY Agent Service  <---- DIDComm / proof exchange ---->  Student Wallet
          |
          v
   BCovrin test ledger

   Paystack test mode <---- signed webhooks / hosted checkout ----> Portal billing and vendor payment routes
```

- This repository owns portal authentication, application data, issuance orchestration, vendor access, verification request records, and audit history.
- The separate agent service owns Credo issuer/verifier operations and authoritative proof decisions. Client-reported proof results are never trusted.
- The student wallet keeps holder keys and credentials on the student's device. Public verification pages launch the wallet and poll only with capability-bound result tokens.
- Vendor payment balances are owned by this portal's internal double-entry ledger. Paystack is used for test-mode hosted checkout, payment confirmation, and payout transfer orchestration.
- Vendor verification billing is separate from the portal payment ledger. Verification charges and invoices never post into payment balances.
- Ledger writes contain DIDs, schemas, credential definitions, and revocation data—not student records or presented personal data.

Portal dates, date filters, scheduled inputs, CSV exports, and invoice PDF issue dates use South African time (`Africa/Johannesburg`, SAST +02:00). Stored timestamps, API serialization, and signed webhook payloads remain UTC.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [![Next.js](https://img.shields.io/badge/Next.js_16.2-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/) [![React](https://img.shields.io/badge/React_19.2-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/) |
| Language | [![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) |
| Styling | [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/) |
| Authentication | [![Better Auth](https://img.shields.io/badge/Better_Auth_1.6-black?style=flat-square&logo=auth0&logoColor=white)](https://www.better-auth.com/) |
| Data | [![Prisma](https://img.shields.io/badge/Prisma_7.8-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/) [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/) |
| Validation and email | [![Zod](https://img.shields.io/badge/Zod_4-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/) [![Resend](https://img.shields.io/badge/Resend-black?style=flat-square&logo=resend&logoColor=white)](https://resend.com/) |
| Agent integration | [![Credo](https://img.shields.io/badge/UNIFY_Agent-Credo_TS-informational?style=flat-square&logo=hyperledger&logoColor=white)](https://credo.js.org/) |
| Payment provider | [![Paystack](https://img.shields.io/badge/Paystack-test_mode-09A5DB?style=flat-square)](https://paystack.com/) |
| Testing | [![Vitest](https://img.shields.io/badge/Vitest_4-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/) [![Testing Library](https://img.shields.io/badge/Testing_Library-E33332?style=flat-square&logo=testinglibrary&logoColor=white)](https://testing-library.com/) |
| Deployment | [![Vercel](https://img.shields.io/badge/Vercel-black?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/) |

## Repository layout

```text
unify-admin-portal/
├── prisma/
│   ├── migrations/                 # Committed PostgreSQL migration history
│   ├── schema.prisma               # Auth, students, credentials, vendors, verification, payments, billing, audit
│   ├── seed.ts                     # Initial SUPER_ADMIN seed
│   └── seed-students.ts            # Optional demonstration student records
├── scripts/
│   ├── bootstrap-payment-wallet.ts   # Payment ledger clearing-account bootstrap
│   ├── bootstrap-billing.ts          # Initial verification-billing policy bootstrap
│   ├── billing-*.ts                  # Backfill, invoice, Paystack check, reconciliation CLIs
│   └── run-production-migrations.mjs # Fail-closed Vercel production migration runner
├── src/
│   ├── app/
│   │   ├── (admin)/
│   │   │   ├── audit/              # Searchable administrator audit history
│   │   │   ├── dashboard/          # Protected staff overview
│   │   │   ├── credentials/
│   │   │   │   ├── issuance/
│   │   │   │   │   ├── batch/      # Preview, start, inspect, and retry batch runs
│   │   │   │   │   ├── individual/ # Per-student issuance workflow
│   │   │   │   │   └── renewals/   # Annual renewal queue, history, and recovery
│   │   │   │   └── schemas/        # Credential schema versions and status
│   │   │   ├── settings/           # University profile, logo, agent health, billing policy/ops
│   │   │   ├── students/
│   │   │   │   ├── [studentId]/    # Student detail and credential lifecycle
│   │   │   │   └── import/         # CSV upload, mapping, preview, custom fields
│   │   │   ├── users/              # Admin roles, status, sessions, and invites
│   │   │   └── vendors/            # Application review, payment access, invoices, history
│   │   ├── (auth)/setup/            # Issuer DID/schema/credential-definition wizard
│   │   ├── (public)/
│   │   │   ├── page.tsx             # Public welcome page at /; /welcome is an alias
│   │   │   ├── fund/                # External-funder form and checkout return
│   │   │   ├── activate/            # Student credential activation landing page
│   │   │   ├── verify/              # Wallet launch and browser verification fallback
│   │   │   ├── accept-invite/       # Admin invitation acceptance
│   │   │   ├── sign-in/             # Shared administrator sign-in
│   │   │   ├── forgot-password/     # Password-reset request
│   │   │   └── reset-password/      # Token-bound password reset
│   │   ├── api/
│   │   │   ├── credentials/         # Schema and batch issuance APIs
│   │   │   ├── cron/                # Credential automation, billing, reconciliation, payout jobs
│   │   │   ├── fund/                # Capability-bound funder top-up status/reconciliation
│   │   │   ├── jobs/                # QStash-signed payment webhook dispatcher
│   │   │   ├── students/            # Search, import, issue, renew, lifecycle APIs
│   │   │   ├── vendor/              # Live, checkout, export, invoice, payment, API-key, webhook APIs
│   │   │   ├── wallet/              # OTP sessions, POS payment approval, top-ups, activity, receipts
│   │   │   └── webhooks/            # Signed agent and Paystack event receivers
│   │   └── vendor/
│   │       ├── (auth)/               # Vendor sign-up, sign-in, invite acceptance
│   │       └── (portal)/
│   │           ├── application/      # Application wizard and submission history
│   │           ├── branches/         # Service-point and branch payment-access management
│   │           ├── integrations/     # Verification, POS payments/refunds, keys, and webhooks
│   │           ├── invoices/         # Verification invoices and payment return flow
│   │           ├── payments/         # Vendor payment history, refunds, balances, payouts
│   │           ├── staff/            # Staff invitations and branch assignment
│   │           ├── test-tools/       # Vendor-scoped demo helpers
│   │           ├── verifications/    # History, filters, CSV export, callback retry
│   │           ├── profile/          # Vendor organization profile
│   │           └── help/             # Authenticated vendor support requests
│   ├── components/
│   │   ├── layout/                   # Admin/vendor shells and navigation
│   │   └── ui/                       # Shared form, status, table, and metric primitives
│   ├── features/
│   │   ├── agent/                    # Agent availability and status UI
│   │   ├── setup/                    # University bootstrap wizard components
│   │   ├── credentials/              # Credential and issuance components
│   │   ├── students/                 # Student search/detail components
│   │   ├── imports/                  # CSV mapping, preview, reconciliation UI
│   │   ├── vendors/                  # Application, vendor management, payment, payout UI
│   │   ├── audit/                    # Audit history presentation
│   │   └── rules/                    # Credential validity presentation
│   ├── lib/
│   │   ├── auth/                     # Better Auth, sessions, roles, permissions, invites
│   │   ├── billing/                  # Verification charges, invoices, payment attempts
│   │   ├── db/                       # Prisma singleton using the pooled runtime URL
│   │   ├── credentials/              # Validity policy, annual renewals, lifecycle, reconciliation
│   │   ├── issuance/                 # Batch run orchestration
│   │   ├── imports/                  # CSV parsing, mapping, validation, commit
│   │   ├── paymentProviders/         # Paystack client, configuration, webhook signatures
│   │   ├── payments/                 # Wallet ledger, POS requests, sessions, top-ups, receipts
│   │   ├── students/                 # Student repository
│   │   ├── vendors/                  # Access, integrations, callbacks, refunds, overdraft, payouts
│   │   ├── verification/             # Wallet/deep-link construction
│   │   ├── email/                    # Resend delivery and templates
│   │   ├── storage/                  # Private Supabase vendor documents
│   │   ├── audit/                    # Append-oriented audit writers
│   │   └── agentClient.ts            # Authenticated agent-service client
│   ├── generated/prisma/             # Generated Prisma client; do not edit
│   └── test/                         # Vitest setup and shared test helpers
├── .env.example                      # Complete local/deployment configuration reference
├── prisma.config.ts                  # Prisma schema, migrations, seed, direct URL
├── proxy.ts                          # Session-aware route protection and redirects
├── vercel.json                       # Hosted deployment configuration
├── next.config.ts
└── package.json
```
Tests are colocated in `__tests__` directories near the code they cover.

## Roles and access

Administrator accounts are invite-only.

| Role | Main access |
|---|---|
| `SUPER_ADMIN` | All administration plus user, role, invite, session management, verification-billing policy/payment-window management, and payout/overdraft settings |
| `ADMIN` | University setup, schema management, issuance, annual validity policy, renewal cancellation/recovery, students, vendors, payment-access review, invoice operations, lifecycle actions, and audit |
| `ISSUER` | Student lookup/import, individual or batch issuance with auto-renewal enrolment, and renewal monitoring |
| `VIEWER` | Dashboard/settings access and a read-only administrator audit log |

Vendor users are a separate account type. Approved vendors can have owners and staff, with staff access limited through branch memberships. Integration access is separately controlled by scoped API credentials. Vendor invoice payment, payout-destination management, and branch payment-access requests are owner-only; staff can view and operate branch-scoped verification and payment activity for assigned branches.

# Vendor Portal

The Vendor Portal is part of this Next.js application and is available under `/vendor`. It shares the deployment and PostgreSQL database with the university-facing Admin Portal, but vendor accounts use a separate `VENDOR` user type, vendor-specific sessions, protected route groups, and tenant/branch access checks.

Keeping both portals in this repository allows application approval, vendor membership, service-point provisioning, verification records, and audit events to use one consistent data model. Credential proof decisions still come from the separate UNIFY Agent Service.

## Deployed Mock POS (for testing student wallet payments)

🔗 **Deployment:** [https://unify-pos-simulator.vercel.app/terminal](https://unify-pos-simulator.vercel.app/terminal)

## Login Credentials

### Demo Vendor Account

```
Email: technest-integration@voskuils.com
Password: 32qdpwBAg1pSz3xx7YlKea_M2gfn48X3!9a
```

### Demo POS Account 

```
Password: WSrhaDis9rWD3xr4iOsp64aEGTDkWX7s
```

### Vendor journey

1. A service provider creates an account at `/vendor/sign-up` and completes its organisation profile.
2. The vendor prepares a draft application, uploads supporting documents, and submits it for university review.
3. A `SUPER_ADMIN` or `ADMIN` reviews the application in the Admin Portal and approves, rejects, or later revokes it. The decision is recorded in the audit history and the contact receives the corresponding email when delivery is configured.
4. Approval creates or restores the vendor owner's membership, creates a default branch when necessary, and provisions the branch as a verification service point with the Agent Service.
5. The owner can add branches, invite staff, assign staff to branches, review verification activity, and configure checkout integrations.
6. If portal payments are enabled, the owner saves a payout destination and submits branch payment-access requests for admin review.
7. Approved payment branches accept fixed-amount sales through the POS API and per-sale QR codes, and can refund completed payments in full or in part from the portal or the POS API, with no platform time limit. A refund may take the vendor wallet below zero: payouts pause, and payments and new refund execution are suspended if it stays negative for the configured number of days (default 14). Sales before suspension or an owner top-up can recover the deficit. Payouts run nightly for the full available balance once it reaches the payout threshold (default R 500).
8. Vendors review monthly verification invoices and, when checkout is enabled, pay them through Paystack test-mode hosted checkout. Unpaid invoices past their due date can suspend new verifications across every branch until no overdue invoice remains.
9. Staff members use the same Vendor Portal but can see and operate only the active branches assigned to them.

### Vendor screens

| Route | Purpose |
|---|---|
| `/vendor` | Dashboard showing approval state, branch summaries, and recent activity |
| `/vendor/application` | Multi-step vendor application and supporting-document submission |
| `/vendor/application/history/[id]` | Read-only view of a previous submission and decision |
| `/vendor/profile` | Owner-managed organisation details, contact information, and logo |
| `/vendor/branches` | Branch/service-point list and owner-only branch creation |
| `/vendor/branches/[branchId]` | Verification QR, branch configuration, staff count, and recent activity |
| `/vendor/branches/[branchId]/payment-access` | Owner-only payout destination and branch payment-access request |
| `/vendor/staff` | Owner-only staff invitations, branch assignments, activation, and deactivation |
| `/vendor/verifications` | Branch-scoped history with student, university, date, and status filters plus CSV export |
| `/vendor/payments` | Branch-scoped payment history, live updates, CSV export, refund actions, and owner payment summary |
| `/vendor/payments/payouts` | Vendor payout batch history and status filters |
| `/vendor/payments/top-up` | Owner-only Paystack test-mode top-up that pays down a negative wallet balance |
| `/vendor/payments/top-up/return` | Owner-only top-up confirmation after Paystack checkout |
| `/vendor/invoices` | Owner-only verification invoice list |
| `/vendor/invoices/[invoiceId]` | Invoice detail, PDF download, payment attempts, and Paystack checkout when enabled |
| `/vendor/integrations` | Owner-only verification setup, cURL/Node.js examples, and verification webhook configuration |
| `/vendor/integrations/payments` | Owner-only POS sale/refund setup, recovery examples, and payment webhook configuration |
| `/vendor/integrations/keys` | Owner-only API-key creation/revocation with scope presets and explicit payment/refund branch restrictions |
| `/vendor/help` | Authenticated support request form sent to the configured university help address |

### Vendor roles

| Role | Access |
|---|---|
| `OWNER` | All vendor branches plus profile, branch, staff, API-key, webhook, payment access, invoices, payout, reporting, and support functions |
| `STAFF` | Dashboard, verification activity, payment history, refunds, and branch pages limited to explicitly assigned active branches |

An owner's branch scope is derived from the vendor's current branches. Staff scope is derived from `VendorBranchMembership` records and is enforced on the server; URL parameters and UI filters cannot expand it.

### Branches and service points

Each vendor branch corresponds to a verifier service point. Creating a branch asks the Agent Service to create the service point and stores its internal agent ID plus stable public URL. A branch can be active, disabled, provisioning, or provisioning-failed, allowing portal users to distinguish an operational QR from a branch that still needs attention.

The public branch URL identifies only the vendor service point. Each wallet scan creates a new short-lived proof exchange with expiry and non-revocation checks, so a printed QR never contains a reusable student proof or completed result.

Payment requests are separate from verification service-point URLs. A branch can accept POS payments only after an owner submits a payment-access request with a saved payout destination and an administrator approves it. Each POS sale produces a short-lived `unifywallet://pay-request/{id}` QR containing only an opaque request ID; its amount, currency, destination, and order reference are stored on the server. Completed payments are recorded in the internal ledger with branch attribution. Static payment QR acceptance and amount-entry submission are retired; their wallet endpoints return HTTP 410 `STATIC_PAYMENT_REMOVED`. Verification QR codes and historical payer receipts remain available.

### Verification modes

The Vendor Portal supports two intentionally different verification modes:

| Mode | Intended use | Result handling |
|---|---|---|
| In-person branch verification | A student scans a branch's static QR and presents a credential to staff | Branch-scoped portal history may show the disclosed student summary/attributes, university, exact outcome, failure reason, and timestamp for operational use |
| Checkout verification API | A vendor checkout server asks whether the student satisfies the credential proof | Returns minimal request/checkout identifiers, status, failure code, and timestamps; disclosed credential attributes are not copied into the external checkout result |

For checkout verification, the vendor server authenticates with an active `unify_vk_...` API key and supplies its own `checkoutId`:

```http
POST /api/vendor/v1/verification-sessions
Authorization: Bearer unify_vk_...
Content-Type: application/json

{ "checkoutId": "order-123" }
```

The vendor profile and `checkoutId` form an idempotency key, so a safe retry returns the same logical request rather than creating an unrelated checkout verification. The configured default branch supplies the Agent Service verifier context.

After the wallet completes the single-use claim and proof flow, the vendor can obtain the minimal result in either of two ways:

- Poll `GET /api/vendor/v1/verification-sessions/{verificationRequestId}` with the same vendor API key.
- Configure an HTTPS webhook under `/vendor/integrations` and verify the `X-Unify-Signature: sha256=...` HMAC header.

The portal makes an immediate verification callback attempt. Failed deliveries are recorded and can be retried manually; polling remains the fallback, so verification callbacks do not depend on a scheduled job. Owners configure verification and payment callbacks separately in their integration workflows; delivery history and retry remain available through authenticated APIs. See [vendor integrations](docs/vendor-integration-hub.md) for the current guides, key presets, and one-time secret handling.

### Verification billing and invoices

Verification billing is separate from the portal payment ledger. Completed billable verification results create immutable `VerificationCharge` rows using the active effective-dated `VerificationBillingPolicy`, including platform and university share snapshots. Billing failures or contradictory evidence create durable `BillingException` rows rather than rewriting historical charges.

Monthly invoice generation groups uninvoiced charges by vendor, billing period, and currency. Issued invoices are immutable, use a database-backed invoice number sequence, can be previewed or generated from the CLI/admin UI, and can be paid by the vendor owner through Paystack test-mode checkout when `VERIFICATION_INVOICE_CHECKOUT_ENABLED=true`. The admin settings area exposes billing policy, invoice generation, reconciliation, and operational summary controls.

A `SUPER_ADMIN` configures the invoice payment window on `/settings/verification-billing` (default 14 days, range 1–365). New unpaid invoices receive a due date from their issuance time; existing invoices with no due date remain exempt from overdue suspension. The daily billing job reconciles payments before suspending vendors with overdue invoices that have no unresolved billing exception. An exception prevents that invoice from triggering a new suspension but does not lift an existing suspension.

Verification suspension blocks new QR and checkout/API verification across all vendor branches, with API code `VENDOR_VERIFICATION_SUSPENDED`; result reads and proofs already in progress remain available. Payments, wallet funding, and portal access continue. Confirmation of payment attempts reinstatement immediately once no overdue invoice remains, with the daily monitor as a backstop. Agent synchronization failures remain pending for retry, and administrators have no suspension override. Admin and vendor invoice screens show due dates and overdue status, and the vendor portal displays a suspension banner.

### Vendor data and security boundaries

- Vendor profiles, applications, memberships, branches, verification records, integration metadata, and audit events live in the same PostgreSQL database as the Admin Portal.
- Supporting documents live in the private `vendor-documents` Supabase Storage bucket and are opened through short-lived signed URLs.
- API tokens are displayed only when created; the database stores a prefix and keyed hash rather than the reusable plaintext token.
- Webhook signing secrets are encrypted at rest with `VENDOR_WEBHOOK_ENCRYPTION_KEY`.
- Vendor payout destination details are tokenized through Paystack where possible; the portal stores provider references plus encrypted masked snapshots, not raw reusable bank credentials.
- Payment balances are projections over immutable ledger entries and must be changed only through typed posting operations.
- Verification invoices and payment attempts are immutable or one-way state machines once issued/settled; reconciliation records exceptions instead of silently mutating historical charges.
- Vendor and branch ownership is checked on the server for every protected page, mutation, export, and result lookup.
- Vendors never receive the Agent Service API key, wallet result capability, issuer keys, raw Credo records, Paystack secret key, or ledger posting capability.

## Local setup

### Prerequisites

- Node.js 20 or later
- npm
- PostgreSQL; Supabase is supported and used by the hosted environment
- A running UNIFY Agent Service for real issuance and verification flows

### 1. Install dependencies

```powershell
npm install
```

### 2. Configure the environment

```powershell
Copy-Item .env.example .env.local
```

The most important variables are:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled PostgreSQL URL used by the running application |
| `DIRECT_URL` | Direct PostgreSQL URL used by Prisma migrations |
| `BETTER_AUTH_SECRET` | Session-signing secret of at least 32 characters |
| `BETTER_AUTH_URL`, `APP_URL` | Authentication callback and public portal URLs |
| `ACTIVATION_PUBLIC_BASE_URL` | Public origin embedded in student activation links |
| `BOOTSTRAP_ADMIN_*` | Initial super-admin name, email, and password used by the seed |
| `AGENT_SERVICE_URL`, `AGENT_API_KEY` | Authenticated connection to the UNIFY Agent Service |
| `WEBHOOK_SIGNING_SECRET` | Shared HMAC secret for agent event webhooks |
| `VENDOR_API_KEY_PEPPER` | Server-side pepper used to hash vendor API keys |
| `VENDOR_WEBHOOK_ENCRYPTION_KEY` | Base64-encoded 32-byte key for vendor webhook secrets |
| `VERIFICATION_FEE_MINOR`, `VERIFICATION_FEE_CURRENCY` | Platform-controlled vendor verification price snapshot defaults |
| `VERIFICATION_INVOICING_ENABLED`, `VERIFICATION_INVOICE_CHECKOUT_ENABLED` | Feature flags for monthly invoice issuance and Paystack hosted checkout |
| `PAYSTACK_*` | Test-mode Paystack secret, account reference, platform subaccount, and expected integration identity |
| `PAYMENT_WALLET_TOPUPS_ENABLED`, `PAYMENT_TOPUP_MIN_MINOR`, `PAYMENT_TOPUP_MAX_MINOR` | Enable wallet activation/top-up flows and set shared student/funder amount limits (default R 10–R 5 000) |
| `PAYMENT_OTP_PEPPER`, `PAYMENT_OTP_EMAIL_FROM` | Server-side OTP/funding hash secret and payment activation email sender |
| `CRON_SECRET` | Bearer secret for daily credential, billing, top-up reconciliation, and payout jobs |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `PAYMENT_WEBHOOK_DISPATCH_URL` | Verify signed payment webhook dispatcher calls against the configured canonical URL |
| `CREDENTIAL_VALIDITY_LEGACY_DEFINITION_IDS` | Explicit allowlist of confirmed legacy definitions lacking both validity dates; must match agent configuration |
| `RESEND_API_KEY`, `*_EMAIL_FROM`, `*_DELIVERY_MODE` | Credential, auth, and vendor-help email delivery |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-only access to private vendor-document storage |

See [.env.example](./.env.example) for the complete list, defaults, and timeout settings. Never expose the Supabase service-role key, signing secrets, database URLs, or vendor cryptographic material to browser code.

### 3. Generate Prisma and prepare the database

For a new local database, apply the existing migration history:

```powershell
npx prisma migrate deploy
npx prisma generate
```

When changing `prisma/schema.prisma`, create and test a named migration locally:

```powershell
npx prisma migrate dev --name describe_the_change
```

Do not use `prisma db push` as a substitute for committed production migrations.

### 4. Seed the first administrator

```powershell
npx prisma db seed
```

The seed uses the `BOOTSTRAP_ADMIN_*` variables. Change any temporary password immediately in shared environments.

Optional demo student data can be loaded with:

```powershell
npm run seed:students
```

### 5. Start the portal

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On a fresh database, the setup wizard collects the university profile and asks the agent service to create the issuer DID, schema, and credential definition. `SETUP_BYPASS=true` is for local troubleshooting only and does not create missing setup data.

The public welcome page is at `/` (also `/welcome`); the protected administrator overview is at `/dashboard`. Before issuing credentials, configure **Settings > Validity & renewal** and publish an active schema containing both `validFrom` and `expiresAt`.

### 6. Prepare vendor payments and billing when needed

After migrations are applied and the setup wizard has created the single university profile, provision the internal payment clearing accounts:

```powershell
npm run payments:bootstrap
```

This command is idempotent and leaves payment enablement unchanged. To enable payment posting while developing locally, use the explicit development command:

```powershell
npm run payments:bootstrap:dev
```

The development command refuses to enable portal payment posting when `NODE_ENV=production`. Neither command creates vendor payment accounts; those remain lifecycle-driven.

To establish the first verification-billing policy, run the billing bootstrap after `VERIFICATION_FEE_MINOR` is set:

```powershell
npm run billing:bootstrap -- --platform-share-bps 1000 --legacy-fee-minor 0
```

The platform share is expressed in basis points. The command is idempotent once an open policy exists. It creates the current effective policy used for new verification charges and a legacy-import policy for historical backfill.

When using Paystack test mode for invoice checkout or payouts, configure the `PAYSTACK_*` variables and verify the provider identity without printing secrets:

```powershell
npm run billing:paystack-check
```

Run the real PostgreSQL payment-ledger and billing invariant/concurrency suites explicitly against the migrated test database configured by `DIRECT_URL`:

```powershell
npm run test:payments:db
npm run test:billing:db
```

These database suites are intentionally separate from ordinary `npm test` runs.

Student and external-funder top-ups also require `PAYMENT_WALLET_TOPUPS_ENABLED=true`, configured Paystack wallet checkout, and the payment OTP/email settings. Vendor deficit top-ups use the same top-up flag. Configure POS keys with explicit payment scopes and approved branches through `/vendor/integrations/keys`; add `refunds:create` explicitly when needed. Existing verification-only keys do not gain payment permissions automatically.

## Database migrations and deployment

Every Prisma schema change must include its generated directory under `prisma/migrations/`.

Production Vercel deployments apply pending migrations automatically. The `prebuild` script runs `scripts/run-production-migrations.mjs`, which executes `prisma migrate deploy` only when both `VERCEL=1` and `VERCEL_ENV=production`. It fails the deployment if `DIRECT_URL` is missing or if a migration fails, then generates the Prisma client before `next build` continues.

Local and preview builds deliberately skip automatic database changes. Apply migrations yourself when those environments need a newer schema:

```powershell
npx prisma migrate deploy
```

Set both `DATABASE_URL` and `DIRECT_URL` in the Vercel Production environment. Use the pooled URL for application traffic and the direct URL for migrations.

Scheduled jobs in `vercel.json` call daily credential automation (00:05 SAST), vendor invoice generation/reconciliation and verification suspension monitoring (00:15), wallet top-up reconciliation (00:25), and overdraft monitoring/vendor payouts (00:35). Vercel Hobby may invoke jobs within the scheduled hour. Credential retries and catch-up resume on subsequent daily runs. The credential route's 300-second budget requires Fluid Compute on Hobby. All cron routes require `CRON_SECRET`. Paystack webhooks must point at `/api/webhooks/paystack` on a reachable HTTPS deployment and must not be blocked by deployment protection.

Payment webhook retries use a separate five-minute QStash schedule calling `/api/jobs/payment-webhooks`. After deploying the endpoint, configure its signing keys and canonical `PAYMENT_WEBHOOK_DISPATCH_URL`, then run `node scripts/configure-payment-webhook-schedule.mjs` with `QSTASH_TOKEN` in the private setup environment. The dispatcher verifies QStash signatures rather than `CRON_SECRET`. See [checkout reliability](docs/checkout-reliability.md) for setup and recovery; PostgreSQL remains authoritative for payment outcomes and delivery retries.

Annual renewal migrations replace the legacy global cadence settings, so deploy the matching application and migrations together. Existing credentials are not automatically enrolled. See [annual credential renewals](docs/annual-credential-renewals.md) for migration and scheduler checks. Overdue-invoice enforcement also requires the Agent Service's vendor suspension endpoints; release agent support before enabling the portal flow.

## Main operational flows

### Credential issuance

1. Import or locate a student record.
2. Select an active credential schema.
3. Issue individually or preview and start a filtered batch.
4. The portal asks the agent service to issue the offer and delivers an activation link.
5. Signed agent webhooks reconcile holder acceptance and credential state into the audit history.

Batch runs support up to 100 students. Creation and failed-item retry return `202 Accepted` after queuing; processing continues after the response while the run pages poll progress. Closing the browser does not stop processing, but a server restart or hard function timeout can leave a run active and requires inspection before retrying. See [background batch issuance](docs/background-batch-issuance.md).

Credential suspension, reactivation, revocation, and renewal are initiated in the portal but enforced through the agent service and revocation registry.

Configure a shared annual credential start and expiry under **Settings > Validity & renewal** before issuing new credentials. Enter dates as `DD-MM`; they repeat in `Africa/Johannesburg`, can cross calendar years, and include the selected expiry day. Ordinary issuance is valid immediately for the earliest period whose expiry is still in the future, while automatic renewal uses the shared academic-period start. The active schema must include `validFrom` and `expiresAt`. Select **Enable auto-renewal** and the number of academic years during individual or batch issuance; the initial period counts as year one.

**Issue Credentials > Renewals** (`/credentials/issuance/renewals`) shows queued academic periods, student/faculty/programme/status filters, offer history, delivery and activation outcomes, and recovery actions. Administrators can cancel remaining auto-renewals on the renewal page or student details. Scheduler diagnostics are under **Settings > Validity & renewal**. Manual renewal is expired-only and preserves an existing enrolment's final year.

Policy edits preview their effect and update future unprepared renewals; prepared offers keep their signed dates, attributes, schema, and policy version. Students still accept each offer in the wallet. Suspension defers renewal without extending the enrolment duration, permanent revocation stops future renewal, and fully elapsed periods are skipped. There is no automatic university-record eligibility check, so administrators must cancel enrolment when a student should stop receiving offers. Failed delivery can be retried without recreating an offer; expired or declined offers require explicit replacement. See [annual credential renewals](docs/annual-credential-renewals.md) for recovery, testing, migration, and deployment requirements.

### Vendor verification

- A static service-point URL such as `/verify/{publicServicePointId}` creates a short-lived proof session when scanned.
- Checkout servers create a single-use session through `POST /api/vendor/v1/verification-sessions`, then poll `GET /api/vendor/v1/verification-sessions/{verificationRequestId}` or receive a signed webhook.
- The wallet shows the verifier and requested attributes before the student consents.
- In-person branch history can retain the attributes the student disclosed for that operational verification; access remains vendor- and branch-scoped.
- External checkout results are deliberately minimal: status, failure code, identifiers, and timestamps. Disclosed attributes are not stored in the checkout result.
- Failed webhook deliveries can be retried from the vendor portal; polling remains the fallback.
- Completed billable verifications are finalized into immutable verification charges for later invoicing.

### Vendor payment acceptance

1. An administrator enables portal payment posting after bootstrapping the clearing accounts.
2. A vendor owner saves a payout destination and submits branch payment-access requests.
3. An administrator approves or rejects each branch request from the Admin Portal.
4. Approval provisions branch payment acceptance and the vendor payment account. The owner creates a server-held API key with `payments:create`, `payments:read`, and `payments:cancel` scopes and explicit branch access.
5. The POS creates a fixed-amount sale through `POST /api/vendor/v1/payment-requests` with its branch, unique order reference, amount in minor units, `ZAR`, and idempotency key. It displays the returned per-sale QR. The student unlocks the wallet, reviews the stored terms, and explicitly approves payment; scanning alone never authorizes a debit. Requests expire after ten minutes and can be cancelled while unpaid.
6. Completed branch payments appear in `/vendor/payments` with branch-scoped filters, live updates, CSV export, and full or partial refund actions. The POS reads authoritative request state or receives a signed payment webhook; it retains the original idempotency keys and terms to recover interrupted requests without creating another sale.
7. Vendor owners can review payment balances, payout batches, and scheduled or manual payout results. The nightly cron (00:35 SAST) reinstates recovered vendors and suspends those negative for too long, then pays each approved vendor its full available balance once it reaches the threshold. Available balance excludes payouts already reserved/in flight; manual demo payouts use the same threshold. Ambiguous provider outcomes retain their reservation for reconciliation.
8. While the balance is negative, the owner can top up the deficit through Paystack test checkout; a confirmed top-up that clears the deficit restores overdraft-suspended payments immediately. The nightly monitor is a recovery backstop. Payment suspension preserves sale/history reads and refund-operation recovery, while blocking new payment creation/cancellation and new refund execution.
9. A `SUPER_ADMIN` sets the payout threshold (default R 500) and overdraft suspension days (default 14) in the Payment wallet card on `/settings`.

New refund integrations use durable operations: register the frozen sale, amount, and idempotency key through `POST /api/vendor/v1/refund-operations`, then explicitly execute the acknowledged operation. Registration does not move money. Read or cancel the operation after interruption, retaining unresolved references until an authoritative `COMPLETED`, `REJECTED`, or `CANCELLED` result. One pending instruction is allowed per vendor wallet/operator. `refunds:create` and branch access are required. The older `POST /api/vendor/v1/payment-requests/{id}/refunds` endpoint remains a compatibility wrapper. Refunds have no platform time limit, cannot exceed the original sale in total, and may overdraw the vendor wallet.

Payment webhooks cover paid, cancelled, expired, and refunded requests. They sign `timestamp + "." + rawBody` with HMAC-SHA256, use stable event IDs, and support immediate delivery plus scheduled retries. Receivers verify signatures/timestamps, deduplicate events, and reread authoritative state before fulfillment. Verification webhook signatures remain separate. See [POS integration](docs/payments/POS_INTEGRATION.md), [checkout reliability](docs/checkout-reliability.md), and [refund/payout recovery](docs/payments/P1_REFUND_PAYOUT_RECOVERY.md) for contracts and examples.

### Student wallet funding

Students activate payment access using their student number and a device-bound emailed OTP. Payment sessions are separate from credential activation and vendor API keys. Student top-ups use Paystack test checkout; authenticated wallet APIs expose balances, activity, and payer-only receipts.

External funders use the public `/fund` page without an account or wallet app. They supply the student number and surname, their own name/email, and an amount, then pay through Paystack hosted checkout. The shared top-up limits default to R 10–R 5 000. Eligible students can receive funding before activating payment access; credential status does not determine funding eligibility.

The `/fund/return` page and capability-bound status/reconciliation APIs show payment status without exposing student details or balances. Server-side Paystack confirmation credits the wallet once; successful funding appears as `From <funder name>` in student activity and triggers a best-effort student email. Funds remain in the closed-loop wallet for spending at approved payment-enabled vendors, with no student withdrawal path. See [external funder top-ups](docs/payments/EXTERNAL_FUNDER_TOPUPS_HANDOFF.md) for eligibility, privacy, and reconciliation details.

### Verification billing

1. `npm run billing:bootstrap` creates the first effective-dated billing policy.
2. Terminal billable verification results create immutable `VerificationCharge` records with fee and revenue-share snapshots.
3. `npm run billing:invoices` previews closed-period invoices; `npm run billing:invoices -- --apply` issues them when `VERIFICATION_INVOICING_ENABLED=true`.
4. Vendor owners view invoices under `/vendor/invoices` and can pay through Paystack test-mode checkout when enabled.
5. Paystack webhooks, vendor return-page polling, admin reconciliation, the CLI, and the daily cron all use the same server-side confirmation boundary.
6. Billing exceptions remain visible for admin review; charges and issued invoice contents are not rewritten silently.
7. The daily billing job checks overdue invoices and synchronizes verification suspension/reinstatement with the Agent Service. Paying all overdue invoices restores verification; this suspension is independent of payment-wallet overdraft suspension.

### Vendor documents

Vendor application documents are stored in a private Supabase Storage bucket named `vendor-documents`. Create the bucket in Supabase, keep it private, and configure `SUPABASE_URL` plus the server-only `SUPABASE_SERVICE_ROLE_KEY`. Admin document links use short-lived signed URLs.

## Commands

```powershell
npm run dev              # Generate Prisma and start Next.js development mode
npm run build            # Production build; migrates only on production Vercel
npm run start            # Serve an existing .next production build
npm run lint             # Run ESLint
npm run typecheck        # Generate Prisma and run TypeScript without emitting
npm test                 # Generate Prisma and run the Vitest suite
npm run test:payments:db # Run PostgreSQL-backed payment-ledger invariant/concurrency tests
npm run test:billing     # Run focused billing unit tests
npm run test:billing:db  # Run PostgreSQL-backed billing invariant/concurrency tests
npm run test:credentials:db # Run isolated PostgreSQL annual renewal, lifecycle, and validity tests
npm run prisma:generate  # Regenerate the Prisma client
npm run seed:students    # Load demo student data
npm run payments:bootstrap      # Provision payment clearing accounts
npm run payments:bootstrap:dev  # Provision clearing accounts and enable payment posting in dev
npm run billing:bootstrap -- --platform-share-bps 1000 --legacy-fee-minor 0 # Create first billing policy
npm run billing:backfill        # Dry-run historical verification charge import
npm run billing:invoices        # Dry-run due invoice generation
npm run billing:invoices -- --apply # Issue due invoices when enabled
npm run billing:paystack-check  # Check Paystack test-mode configuration
npm run billing:reconcile       # Reconcile invoice payment attempts and webhook failures
npm run credentials:validity-backfill -- --inventory # Classify stored credential schemas by validity fields
npm run credentials:validity-backfill # Dry-run recovery of credential validity dates from agent records
npm run credentials:validity-backfill -- --apply # Apply recoverable validity dates without inferring missing dates
node scripts/configure-payment-webhook-schedule.mjs # Configure the signed five-minute QStash schedule
npx prisma studio        # Inspect the configured database
```

Before opening a pull request, run:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

If the change affects the database, include the migration name and deployment impact in the pull request.

If the change affects payment posting, payment migrations, billing policy, invoice generation, Paystack payment handling, or related PostgreSQL constraints, also run the relevant `test:payments:db` or `test:billing:db` suite.

Credential validity, lifecycle, and annual renewal changes also require `npm run test:credentials:db` against a migrated, isolated local PostgreSQL database named `unify_wallet_test`. See [annual credential renewals](docs/annual-credential-renewals.md) for the test database guard and deployment checks.

## Security notes

- Never commit `.env*`, database credentials, signing/encryption keys, API keys, or Supabase service-role credentials.
- Verification decisions remain backend-owned and are bound to expiring proof exchanges.
- Public result access uses unguessable capability tokens and returns minimal data.
- Static service-point links create dynamic sessions; they are not reusable proof results.
- Payment balances must be changed only through server-side posting functions; do not update projection tables, ledger entries, or completed transactions directly.
- Paystack browser redirects and inline callback success are not proof of payment. Confirm invoice payments, student/funder/vendor top-ups, and payouts server-side or through signed webhooks.
- POS QR codes contain only opaque request IDs. Keep vendor keys on merchant servers, enforce explicit payment/refund scopes and branch allowlists, and recover interrupted payments/refunds using their original immutable terms and idempotency keys.
- Payment callback delivery does not determine ledger success. Verify timestamp-bound signatures and deduplicate event IDs; funder status capabilities must never expose student details or balances.
- Accepted risk: vendor overdraft has no cap and UNIFY cannot debit vendor bank accounts, so the maximum loss per vendor is the sum of its already-paid-out sales (refunds can never exceed the original sales). Suspension after the configured overdraft period and POS refunds that must reference the original sale limit this; see `docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md` §4.
- Verification billing records and issued invoices are audit artifacts. Use forward corrections, exceptions, or new policy versions rather than editing historical charges.
- Do not delete or rewrite applied production migrations. Add a new forward migration instead.
