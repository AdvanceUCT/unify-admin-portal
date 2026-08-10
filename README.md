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
| Application | Next.js 16.2, React 19.2, TypeScript 5, Tailwind CSS 4 |
| Authentication | Better Auth 1.6 with Prisma adapter |
| Data | PostgreSQL, Prisma 7.8, Supabase Postgres and private Storage |
| Validation and integrations | Zod 4, Resend, QR Code, UNIFY Agent Service |
| Testing and deployment | Vitest 4, Testing Library, ESLint, Vercel |

## Repository layout

```text
unify-admin-portal/
├── prisma/                         # Schema, migrations, bootstrap seed, student seed
├── scripts/                        # Production migration and operational scripts
├── src/
│   ├── app/
│   │   ├── (admin)/                # Protected university administration pages
│   │   ├── (auth)/                 # First-run setup
│   │   ├── (public)/               # Auth, activation, and public verification pages
│   │   ├── api/                    # Admin, issuance, vendor, and agent webhook APIs
│   │   └── vendor/                 # Vendor authentication and protected portal
│   ├── components/                 # Shared layout and UI primitives
│   ├── features/                   # Domain-oriented admin and vendor UI
│   ├── generated/prisma/           # Generated Prisma client; do not edit
│   ├── lib/                        # Auth, database, agent, issuance, email, audit, storage
│   └── test/                       # Vitest setup and shared test helpers
├── .env.example                    # Local and deployment configuration reference
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
