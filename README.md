# UNIFY Admin Portal

> A governance and administration portal for managing the full lifecycle of Verifiable Credentials issued to university students.

---

## 1. Overview

The UNIFY Admin Portal is the administrative web interface for the UNIFY digital identity system. Built with Next.js, it gives university administrators, issuer operators, and auditors a central place to manage the full lifecycle of Verifiable Credentials from initial issuance through to revocation and audit. The portal is scoped as a proof of concept, demonstrating end-to-end credential governance workflows against a simulated university records system.

### What it does (as of Iteration 1)

| Domain | Capabilities |
|---|---|
| **Credential Issuance** | Issue credentials to individual students or entire cohorts via batch workflows; track offer delivery and activation status |
| **Student Management** | Look up students from a simulated university records connector; inspect per-student credential history |
| **Audit & Governance** | Full immutable audit log of all administrative actions and credential lifecycle events |
| **User & Access Management** | Invite-only admin accounts with role-based access control (RBAC); super-admin session management |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/) [![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/) |
| **Language** | [![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) |
| **Styling** | [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/) |
| **Authentication** | [![Better Auth](https://img.shields.io/badge/Better_Auth-black?style=flat-square&logo=auth0&logoColor=white)](https://www.better-auth.com/) |
| **ORM** | [![Prisma](https://img.shields.io/badge/Prisma_7-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/) |
| **Database** | [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/) [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/) |
| **Email** | [![Resend](https://img.shields.io/badge/Resend-black?style=flat-square&logo=resend&logoColor=white)](https://resend.com/) |
| **Agent Integration** | [![Credo](https://img.shields.io/badge/Credo_TS-Hyperledger_Indy-informational?style=flat-square&logo=hyperledger&logoColor=white)](https://credo.js.org/) |
| **Testing** | [![Vitest](https://img.shields.io/badge/Vitest-6D4AFF?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/) [![Testing Library](https://img.shields.io/badge/Testing_Library-E33332?style=flat-square&logo=testinglibrary&logoColor=white)](https://testing-library.com/) |
| **Deployment** | [![Vercel](https://img.shields.io/badge/Vercel-black?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/) |

---

## 3. Project Structure

```
unify-admin-portal/
├── prisma/
│   ├── schema.prisma          # Database schema (auth, credentials, audit, batch issuance)
│   ├── seed.ts                # Bootstrap seed — creates the first super-admin account
│   └── migrations/            # Prisma migration history
│
├── src/
│   ├── app/
│   │   ├── (admin)/           # Protected admin routes (require authenticated session)
│   │   │   ├── audit/         # Audit log viewer
│   │   │   ├── credentials/   # Credential issuance workflows (batch + individual)
│   │   │   ├── rules/         # Eligibility and validity rule configuration
│   │   │   ├── students/      # Student lookup and credential detail views
│   │   │   ├── users/         # Admin user management and invite management
│   │   │   └── vendors/       # Vendor / service-provider management
│   │   ├── (auth)/
│   │   │   └── setup/         # First-run setup wizard (DID, schema, issuance config)
│   │   ├── (public)/          # Unauthenticated routes
│   │   │   ├── activate/      # Student-facing credential activation page
│   │   │   ├── accept-invite/ # Admin invite acceptance flow
│   │   │   ├── forgot-password/
│   │   │   ├── reset-password/
│   │   │   └── sign-in/
│   │   ├── api/
│   │   │   ├── admin/         # Server-side admin data endpoints
│   │   │   ├── credentials/   # Issuance trigger and batch run endpoints
│   │   │   ├── mock/          # Local mock endpoints (wallet, activation, admin state)
│   │   │   ├── students/      # Per-student credential issue endpoint
│   │   │   └── webhooks/agent # Signed webhook receiver for agent credential events
│   │   └── .well-known/       # Android App Links asset manifest
│   │
│   ├── components/
│   │   ├── layout/            # PortalShell, SectionHeader, SignOutButton
│   │   └── ui/                # Shared primitives (Badge, Metric, etc.)
│   │
│   ├── features/
│   │   ├── credentials/       # Credential table, batch run detail, issue view
│   │   ├── students/          # Student search, credential actions UI
│   │   ├── vendors/           # Vendor onboarding UI (placeholder)
│   │   ├── rules/             # Rules configuration UI (placeholder)
│   │   ├── audit/             # Audit table component
│   │   └── setup/             # Setup wizard steps (Profile, DID, Issuance)
│   │
│   ├── lib/
│   │   ├── api/               # Typed API client, mock data, activation link helpers
│   │   ├── audit/             # Audit logging helpers
│   │   ├── auth/              # Better Auth config, sessions, roles, RBAC, invites
│   │   ├── credentials/       # Credential status mapping and audit helpers
│   │   ├── db/                # Prisma client singleton and database utilities
│   │   ├── email/             # Email templates (admin invite, password reset, credentials)
│   │   ├── issuance/          # Batch run orchestration logic
│   │   ├── student-records/   # Simulated university records connector
│   │   └── university/        # Credential schema definitions
│   │
│   ├── generated/prisma/      # Auto-generated Prisma client (do not edit)
│   └── test/                  # Vitest test suite
│
├── .env.example               # Environment variable reference
├── next.config.ts             # Next.js config (redirects, headers)
├── package.json
└── tsconfig.json
```

### Role-Based Access Control

The portal enforces four roles across all routes and API actions:

| Role | Access |
|---|---|
| `SUPER_ADMIN` | Full access — user management, all credential and governance functions |
| `ADMIN` | Credential issuance, students, vendors, rules, audit |
| `ISSUER` | Credential issuance and student lookup only |
| `VIEWER` | Read-only access to credentials, students, vendors, rules, and audit |

Public sign-up is disabled. All admin accounts are created via an invite link generated by a `SUPER_ADMIN`.

---

## 4. Setup

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Supabase recommended — provides both a pooled and a direct connection URL)
- npm

### Step 1 — Install Dependencies

```bash
npm install
```

### Step 2 — Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

`.env.local` is ignored by git and is the correct file for local development.

Key variables to configure:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Pooled PostgreSQL connection string (used at runtime) |
| `DIRECT_URL` | Direct PostgreSQL connection string (used by Prisma for migrations) |
| `BETTER_AUTH_SECRET` | Session signing secret — generate with `openssl rand -base64 32` |
| `APP_URL` | Public base URL of the portal — `http://localhost:3000` locally |
| `BETTER_AUTH_URL` | Same as `APP_URL` |
| `BOOTSTRAP_ADMIN_EMAIL` | Email for the first super-admin account created by the seed |
| `BOOTSTRAP_ADMIN_NAME` | Display name for the first super-admin |
| `BOOTSTRAP_ADMIN_PASSWORD` | Temporary password for the first super-admin |
| `AGENT_SERVICE_URL` | URL of the Credo Identity Agent Service (optional for basic portal use) |
| `AGENT_API_KEY` | API key for the agent service |
| `AGENT_HEALTH_TIMEOUT_MS` | Agent health-check timeout in milliseconds; defaults to `5000` |
| `AGENT_STANDARD_TIMEOUT_MS` | Standard agent request timeout in milliseconds; defaults to `15000` |
| `AGENT_LONG_TIMEOUT_MS` | Long-running agent request timeout in milliseconds; defaults to `60000` |
| `WEBHOOK_SIGNING_SECRET` | Shared HMAC secret between the portal and the agent (must match both sides) |
| `VENDOR_API_KEY_PEPPER` | Random secret of at least 32 characters used to hash vendor API keys |
| `VENDOR_WEBHOOK_ENCRYPTION_KEY` | Base64-encoded 32-byte key used to encrypt vendor webhook signing secrets |
| `RESEND_API_KEY` | Resend API key for production email delivery |
| `CREDENTIAL_EMAIL_DELIVERY_MODE` | `"resend"` for real emails, `"log"` to print to console |
| `SUPABASE_URL` | Supabase project URL — used for vendor document storage (optional if not using vendor applications) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — used server-side to upload and sign vendor documents |

### Step 3 — Apply Database Migrations

Run Prisma migrations to create all required tables:

```bash
npx prisma migrate dev
```

### Vendor Checkout Verification

Approved vendors configure API keys and an HTTPS result webhook under
`/vendor/integrations`. A checkout server creates a verification session with
`POST /api/vendor/v1/verification-sessions` and polls
`GET /api/vendor/v1/verification-sessions/:verificationRequestId` using its
`Authorization: Bearer unify_vk_...` credential.

Final results contain only the checkout ID, status, failure code, and timing
metadata. The portal makes one immediate signed webhook attempt using the
`X-Unify-Signature: sha256=...` header. Failed callbacks can be retried manually;
vendor polling is the fallback, so no scheduled or cron job is required.

### Step 3b — Set Up Supabase Storage (Vendor Document Uploads)

The vendor application wizard uploads supporting documents to a private Supabase Storage bucket. Skip this step if you are not using the vendor application feature.

**Prerequisites:** You need a Supabase project. The `DATABASE_URL` and `DIRECT_URL` already point to it.

1. **Create the bucket** — In the Supabase Dashboard, go to **Storage** and click **New bucket**.
   - Name: `vendor-documents`
   - Toggle **Private** on (documents must not be publicly accessible)
   - Click **Save**

2. **Get your API credentials** — Go to **Project Settings → API**:
   - Copy the **Project URL** → `SUPABASE_URL` in `.env.local`
   - Under **Project API keys**, copy the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

   > The service role key bypasses Row Level Security and has full storage access. Keep it server-side only and never commit it to version control.

3. **Verify** — Start the dev server and complete a vendor application through to Step 4. Files should upload and show "Uploaded" with the filename. On the admin side, document links should open a signed URL in a new tab.

### Step 4 — Seed the Database

Create the initial super-admin account defined in your environment variables:

```bash
npx prisma db seed
```

This produces a `SUPER_ADMIN` account using the `BOOTSTRAP_ADMIN_*` values from `.env.local`.

Default development credentials (after seeding with the example values):

```
Email:    superadmin@example.com
Password: SuperAdmin123!
```

> Change the password immediately after first login in any shared or production environment.

### Step 5 — Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in.

In development, admin invite links and password reset links are printed to the server console instead of being emailed.

### First-Run Setup Wizard

On first login, the portal will redirect to `/setup` — a guided wizard that walks through:

1. **University Profile** — institution name, abbreviation, and contact email.
2. **DID Configuration** — registering an issuer DID on the Hyperledger Indy ledger via the agent service.
3. **Issuance Setup** — creating and anchoring a credential schema and credential definition.

The setup wizard can be bypassed in development by setting `SETUP_BYPASS="true"` in `.env.local` (only use this if the database is already configured).

### Useful Commands

```bash
npm run dev          # Start the development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type check (no emit)
npm test             # Run the Vitest test suite
npx prisma studio    # Open Prisma Studio to browse the database
```

---
