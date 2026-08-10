# UNIFY Admin Portal

The administration, governance, and vendor portal for the UNIFY student digital credential system. University teams use it to manage student records, issue and govern credentials, onboard service providers, and audit verification activity.

UNIFY is a proof of concept. It demonstrates privacy-preserving credential workflows; it is not a production student-records or payment platform.

## Current capabilities

| Area | What is implemented |
|---|---|
| Admin access | Invite-only Better Auth accounts, role-based permissions, password recovery, user status controls, and session revocation |
| University setup | University profile, issuer DID registration, credential schema creation, credential definition creation, and setup health checks |
| Student records | Search and detail views, CSV import preview/commit, reusable import mappings, and custom student fields |
| Credential issuance | Individual and filtered batch issuance, activation-link delivery, run history, failed-item retry, and agent event reconciliation |
| Credential lifecycle | Status history plus suspend, reactivate, revoke, and renew operations owned by the backend |
| Governance | Versioned credential schemas, append-oriented credential/audit event records, and a searchable administrator audit log |
| Vendor onboarding | Vendor sign-up, application and supporting-document review, approval history, profiles, branches, staff, and branch assignments |
| Verification | Static service-point links, dynamic single-use proof sessions, live vendor verification, checkout verification, status polling, exports, and signed result webhooks |
| Vendor integrations | Scoped API keys, encrypted webhook configuration, delivery history, and manual retry for failed callbacks |

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
```

- This repository owns portal authentication, application data, issuance orchestration, vendor access, verification request records, and audit history.
- The separate agent service owns Credo issuer/verifier operations and authoritative proof decisions. Client-reported proof results are never trusted.
- The student wallet keeps holder keys and credentials on the student's device. Public verification pages launch the wallet and poll only with capability-bound result tokens.
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
| Testing | [![Vitest](https://img.shields.io/badge/Vitest_4-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/) [![Testing Library](https://img.shields.io/badge/Testing_Library-E33332?style=flat-square&logo=testinglibrary&logoColor=white)](https://testing-library.com/) |
| Deployment | [![Vercel](https://img.shields.io/badge/Vercel-black?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/) |

## Repository layout

```text
unify-admin-portal/
├── prisma/
│   ├── migrations/                 # Committed PostgreSQL migration history
│   ├── schema.prisma               # Auth, students, credentials, vendors, verification, audit
│   ├── seed.ts                     # Initial SUPER_ADMIN seed
│   └── seed-students.ts            # Optional demonstration student records
├── scripts/
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
│   │   │   ├── settings/           # University profile, logo, and agent health
│   │   │   ├── students/
│   │   │   │   ├── [studentId]/    # Student detail and credential lifecycle
│   │   │   │   └── import/         # CSV upload, mapping, preview, custom fields
│   │   │   ├── users/              # Admin roles, status, sessions, and invites
│   │   │   └── vendors/            # Application review and verification history
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
│   │   │   ├── students/            # Search, import, issue, renew, lifecycle APIs
│   │   │   ├── vendor/              # Live, checkout, export, API-key, webhook APIs
│   │   │   └── webhooks/agent/      # Signed credential event receiver
│   │   └── vendor/
│   │       ├── (auth)/               # Vendor sign-up, sign-in, invite acceptance
│   │       └── (portal)/
│   │           ├── application/      # Application wizard and submission history
│   │           ├── branches/         # Service-point branch management
│   │           ├── integrations/     # API credentials and result webhooks
│   │           ├── staff/            # Staff invitations and branch assignment
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
│   │   ├── vendors/                  # Application and vendor management UI
│   │   ├── audit/                    # Audit history presentation
│   │   └── rules/                    # Credential validity presentation
│   ├── lib/
│   │   ├── auth/                     # Better Auth, sessions, roles, permissions, invites
│   │   ├── db/                       # Prisma singleton using the pooled runtime URL
│   │   ├── credentials/              # Lifecycle mapping and status reconciliation
│   │   ├── issuance/                 # Batch run orchestration
│   │   ├── imports/                  # CSV parsing, mapping, validation, commit
│   │   ├── students/                 # Student repository
│   │   ├── vendors/                  # Vendor access, crypto, callbacks, history
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
| `SUPER_ADMIN` | All administration plus user, role, invite, and session management |
| `ADMIN` | University setup, schema management, issuance, students, vendors, lifecycle actions, and audit |
| `ISSUER` | Student lookup/import and individual or batch issuance |
| `VIEWER` | Dashboard/settings access and a read-only administrator audit log |

Vendor users are a separate account type. Approved vendors can have owners and staff, with staff access limited through branch memberships. Integration access is separately controlled by scoped API credentials.

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

## Database migrations and deployment

Every Prisma schema change must include its generated directory under `prisma/migrations/`.

Production Vercel deployments apply pending migrations automatically. The `prebuild` script runs `scripts/run-production-migrations.mjs`, which executes `prisma migrate deploy` only when both `VERCEL=1` and `VERCEL_ENV=production`. It fails the deployment if `DIRECT_URL` is missing or if a migration fails, then generates the Prisma client before `next build` continues.

Local and preview builds deliberately skip automatic database changes. Apply migrations yourself when those environments need a newer schema:

```powershell
npx prisma migrate deploy
```

Set both `DATABASE_URL` and `DIRECT_URL` in the Vercel Production environment. Use the pooled URL for application traffic and the direct URL for migrations.

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
- Final vendor results are deliberately minimal: status, failure code, identifiers, and timestamps. Presented credential attributes are not stored in vendor result records.
- Failed webhook deliveries can be retried from the vendor portal; polling remains the fallback.

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
npm run prisma:generate  # Regenerate the Prisma client
npm run seed:students    # Load demo student data
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

## Security notes

- Never commit `.env*`, database credentials, signing/encryption keys, API keys, or Supabase service-role credentials.
- Verification decisions remain backend-owned and are bound to expiring proof exchanges.
- Public result access uses unguessable capability tokens and returns minimal data.
- Static service-point links create dynamic sessions; they are not reusable proof results.
- Do not delete or rewrite applied production migrations. Add a new forward migration instead.
