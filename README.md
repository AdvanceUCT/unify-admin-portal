# UNIFY Portal

The administration, governance, and vendor portal for the UNIFY student digital credential system. University teams use it to manage student records, issue and govern credentials, onboard service providers, and audit verification activity.

UNIFY is a proof of concept. It demonstrates privacy-preserving credential workflows; it is not a production student-records or payment platform.

## Deployed Portal

🔗 **Deployment:** [https://voskuils.com/](https://voskuils.com/)

## Login Credentials

### Super Administrator Account

```
Email: admin@example.com
Password: UnifyAdminSeed!2026
```

# Admin Portal
## Current capabilities

| Area | What is implemented |
|---|---|
| Admin access | Invite-only Better Auth accounts, role-based permissions, password recovery, user status controls, and session revocation |
| University setup | University profile, issuer DID registration, credential schema creation, credential definition creation, and setup health checks |
| Student records | Search and detail views, CSV import preview/commit, reusable import mappings, and custom student fields |
| Credential issuance | Individual and filtered batch issuance, activation-link delivery, run history, failed-item retry, and agent event reconciliation |
| Credential lifecycle | Status history plus suspend, reactivate, revoke, and renew operations owned by the backend |
| Governance | Versioned credential schemas, append-oriented credential/audit event records, and a searchable administrator audit log |
| Vendor onboarding | Vendor sign-up, application and supporting-document review, approval history, profiles, branches, staff, branch assignments, and branch payment-access review |
| Verification | Static service-point links, dynamic single-use proof sessions, live vendor verification, checkout verification, status polling, exports, signed result webhooks, and billable usage snapshots |
| Vendor integrations | Scoped API keys, encrypted webhook configuration, delivery history, and manual retry for failed callbacks |
| Vendor payments | Branch payment-access applications, payout-destination capture, payment history/export, live payment polling, refunds, vendor balance, payout history, and scheduled/manual payouts |
| Verification billing | Effective-dated pricing policies, immutable verification charges, monthly vendor invoices, Paystack test checkout, payment reconciliation, billing exceptions, and operations summary |

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
│   │   │   ├── credentials/
│   │   │   │   ├── issuance/
│   │   │   │   │   ├── batch/      # Preview, start, inspect, and retry batch runs
│   │   │   │   │   └── individual/ # Per-student issuance workflow
│   │   │   │   └── schemas/        # Credential schema versions and status
│   │   │   ├── settings/           # University profile, logo, agent health, billing policy/ops
│   │   │   ├── students/
│   │   │   │   ├── [studentId]/    # Student detail and credential lifecycle
│   │   │   │   └── import/         # CSV upload, mapping, preview, custom fields
│   │   │   ├── users/              # Admin roles, status, sessions, and invites
│   │   │   └── vendors/            # Application review, payment access, invoices, history
│   │   ├── (auth)/setup/            # Issuer DID/schema/credential-definition wizard
│   │   ├── (public)/
│   │   │   ├── activate/            # Student credential activation landing page
│   │   │   ├── verify/              # Wallet launch and browser verification fallback
│   │   │   ├── accept-invite/       # Admin invitation acceptance
│   │   │   ├── sign-in/             # Shared administrator sign-in
│   │   │   ├── forgot-password/     # Password-reset request
│   │   │   └── reset-password/      # Token-bound password reset
│   │   ├── api/
│   │   │   ├── credentials/         # Schema and batch issuance APIs
│   │   │   ├── cron/                # Credential automation, billing, reconciliation, payout jobs
│   │   │   ├── students/            # Search, import, issue, renew, lifecycle APIs
│   │   │   ├── vendor/              # Live, checkout, export, invoice, payment, API-key, webhook APIs
│   │   │   └── webhooks/            # Signed agent and Paystack event receivers
│   │   └── vendor/
│   │       ├── (auth)/               # Vendor sign-up, sign-in, invite acceptance
│   │       └── (portal)/
│   │           ├── application/      # Application wizard and submission history
│   │           ├── branches/         # Service-point and branch payment-access management
│   │           ├── integrations/     # API credentials and result webhooks
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
│   │   ├── credentials/              # Lifecycle mapping and status reconciliation
│   │   ├── issuance/                 # Batch run orchestration
│   │   ├── imports/                  # CSV parsing, mapping, validation, commit
│   │   ├── paymentProviders/         # Paystack client, configuration, webhook signatures
│   │   ├── students/                 # Student repository
│   │   ├── vendors/                  # Vendor access, crypto, callbacks, history, payouts
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
| `SUPER_ADMIN` | All administration plus user, role, invite, session management, and verification-billing policy management |
| `ADMIN` | University setup, schema management, issuance, students, vendors, payment-access review, invoice operations, lifecycle actions, and audit |
| `ISSUER` | Student lookup/import and individual or batch issuance |
| `VIEWER` | Dashboard/settings access and a read-only administrator audit log |

Vendor users are a separate account type. Approved vendors can have owners and staff, with staff access limited through branch memberships. Integration access is separately controlled by scoped API credentials. Vendor invoice payment, payout-destination management, and branch payment-access requests are owner-only; staff can view and operate branch-scoped verification and payment activity for assigned branches.

## Vendor Portal

The Vendor Portal is part of this Next.js application and is available under `/vendor`. It shares the deployment and PostgreSQL database with the university-facing Admin Portal, but vendor accounts use a separate `VENDOR` user type, vendor-specific sessions, protected route groups, and tenant/branch access checks.

Keeping both portals in this repository allows application approval, vendor membership, service-point provisioning, verification records, and audit events to use one consistent data model. Credential proof decisions still come from the separate UNIFY Agent Service.

### Vendor journey

1. A service provider creates an account at `/vendor/sign-up` and completes its organisation profile.
2. The vendor prepares a draft application, uploads supporting documents, and submits it for university review.
3. A `SUPER_ADMIN` or `ADMIN` reviews the application in the Admin Portal and approves, rejects, or later revokes it. The decision is recorded in the audit history and the contact receives the corresponding email when delivery is configured.
4. Approval creates or restores the vendor owner's membership, creates a default branch when necessary, and provisions the branch as a verification service point with the Agent Service.
5. The owner can add branches, invite staff, assign staff to branches, review verification activity, and configure checkout integrations.
6. If portal payments are enabled, the owner saves a payout destination and submits branch payment-access requests for admin review.
7. Approved payment branches receive payment QR identifiers, can accept branch payments, and can refund eligible payments inside the configured refund window.
8. Vendors review monthly verification invoices and, when checkout is enabled, pay them through Paystack test-mode hosted checkout.
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
| `/vendor/invoices` | Owner-only verification invoice list |
| `/vendor/invoices/[invoiceId]` | Invoice detail, PDF download, payment attempts, and Paystack checkout when enabled |
| `/vendor/integrations` | Owner-only API-key and signed result-webhook management |
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

Payment QR identifiers are separate from verification service-point URLs. A branch can accept payments only after an owner submits a payment-access request with a saved payout destination and an administrator approves it. Completed payments are recorded in the internal ledger with branch attribution.

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

The portal makes an immediate callback attempt. Failed deliveries are recorded and can be retried manually; polling remains the fallback, so the flow does not depend on a scheduled job.

### Verification billing and invoices

Verification billing is separate from the portal payment ledger. Completed billable verification results create immutable `VerificationCharge` rows using the active effective-dated `VerificationBillingPolicy`, including platform and university share snapshots. Billing failures or contradictory evidence create durable `BillingException` rows rather than rewriting historical charges.

Monthly invoice generation groups uninvoiced charges by vendor, billing period, and currency. Issued invoices are immutable, use a database-backed invoice number sequence, can be previewed or generated from the CLI/admin UI, and can be paid by the vendor owner through Paystack test-mode checkout when `VERIFICATION_INVOICE_CHECKOUT_ENABLED=true`. The admin settings area exposes billing policy, invoice generation, reconciliation, and operational summary controls.

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

## Database migrations and deployment

Every Prisma schema change must include its generated directory under `prisma/migrations/`.

Production Vercel deployments apply pending migrations automatically. The `prebuild` script runs `scripts/run-production-migrations.mjs`, which executes `prisma migrate deploy` only when both `VERCEL=1` and `VERCEL_ENV=production`. It fails the deployment if `DIRECT_URL` is missing or if a migration fails, then generates the Prisma client before `next build` continues.

Local and preview builds deliberately skip automatic database changes. Apply migrations yourself when those environments need a newer schema:

```powershell
npx prisma migrate deploy
```

Set both `DATABASE_URL` and `DIRECT_URL` in the Vercel Production environment. Use the pooled URL for application traffic and the direct URL for migrations.

Scheduled jobs in `vercel.json` call credential automation, vendor billing, payment reconciliation, and vendor payouts. All cron routes require `CRON_SECRET`. Paystack webhooks must point at `/api/webhooks/paystack` on a reachable HTTPS deployment and must not be blocked by deployment protection.

## Main operational flows

### Credential issuance

1. Import or locate a student record.
2. Select an active credential schema.
3. Issue individually or preview and start a filtered batch.
4. The portal asks the agent service to issue the offer and delivers an activation link.
5. Signed agent webhooks reconcile holder acceptance and credential state into the audit history.

Credential suspension, reactivation, revocation, and renewal are initiated in the portal but enforced through the agent service and revocation registry.

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
4. Approval provisions the branch payment QR identifier and vendor payment account.
5. Completed branch payments appear in `/vendor/payments` with branch-scoped filters, live updates, CSV export, and refund actions.
6. Vendor owners can review payment balances, payout batches, and scheduled or manual payout results.

### Verification billing

1. `npm run billing:bootstrap` creates the first effective-dated billing policy.
2. Terminal billable verification results create immutable `VerificationCharge` records with fee and revenue-share snapshots.
3. `npm run billing:invoices` previews closed-period invoices; `npm run billing:invoices -- --apply` issues them when `VERIFICATION_INVOICING_ENABLED=true`.
4. Vendor owners view invoices under `/vendor/invoices` and can pay through Paystack test-mode checkout when enabled.
5. Paystack webhooks, vendor return-page polling, admin reconciliation, the CLI, and the daily cron all use the same server-side confirmation boundary.
6. Billing exceptions remain visible for admin review; charges and issued invoice contents are not rewritten silently.

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

## Security notes

- Never commit `.env*`, database credentials, signing/encryption keys, API keys, or Supabase service-role credentials.
- Verification decisions remain backend-owned and are bound to expiring proof exchanges.
- Public result access uses unguessable capability tokens and returns minimal data.
- Static service-point links create dynamic sessions; they are not reusable proof results.
- Payment balances must be changed only through server-side posting functions; do not update projection tables, ledger entries, or completed transactions directly.
- Paystack browser redirects and inline callback success are not proof of payment. Confirm invoice payments and payouts server-side or through signed webhooks.
- Verification billing records and issued invoices are audit artifacts. Use forward corrections, exceptions, or new policy versions rather than editing historical charges.
- Do not delete or rewrite applied production migrations. Add a new forward migration instead.
