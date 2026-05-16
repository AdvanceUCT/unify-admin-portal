# UNIFY Admin Portal

Admin and governance portal for UNIFY. This repo is planned as the Next.js web application used by administrators and issuer operators to manage Verifiable Credential lifecycle workflows.

Future Codex instances should read this file first, then:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md)
- [docs/WORKFLOW.md](docs/WORKFLOW.md)

## Current Status

- Stack: Next.js 16, TypeScript, Tailwind CSS, Better Auth, Prisma, PostgreSQL/Supabase.
- Current implementation: runnable admin portal with invite-only authentication, RBAC, user management, password reset, and audit logging.
- Current app data: portal auth data is stored in PostgreSQL; domain student records come from a deterministic simulated university records connector, with optional Turso/libSQL persistence as a mock records mirror.
- Current email delivery: admin invites and password resets use development console logging. A real email provider is still required for production.
- GitHub Actions: present and expected to handle the repo before an app package exists.
- System scope: proof of concept using simulated student records, simulated service providers, and simulated wallet/payment flows.
- Target identity stack from `BA Innovation.docx`: W3C Verifiable Credentials, AnonCreds, Credo, DIDComm, Hyperledger Indy/BCovrin, Indy VDR, and Aries Askar.

This repo owns:

- Credential lifecycle administration
- Issuer operations
- Batch issuance for simulated student cohorts
- Student credential suspension, revocation, and renewal support
- Validity and eligibility rule configuration
- Vendor/service-provider onboarding and approval
- Admin-facing reporting and governance workflows
- Repo and DevOps conventions for the admin surface

## Working Agreement

- Work enters through issues and pull requests.
- `main` is protected and should only change through reviewed PRs.
- Use draft PRs early when work is still in progress.
- Link every PR to an issue before it is merged.
- Security-sensitive changes need two approving reviews before merge.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Local Environment

Create `.env.local` from the example and fill in the shared development database and auth values:

```bash
cp .env.example .env.local
```

Use `.env.local` for local development. It is ignored by git.

Important values:

- `DATABASE_URL`: pooled runtime PostgreSQL/Supabase connection string.
- `DIRECT_URL`: direct PostgreSQL/Supabase connection string for Prisma migrations.
- `BETTER_AUTH_SECRET`: shared development auth secret, at least 32 characters.
- `APP_URL` and `BETTER_AUTH_URL`: use `http://localhost:3000` locally.
- `BOOTSTRAP_ADMIN_*`: only needed when bootstrapping the first shared development admin.

For the Vercel production deployment, set `APP_URL`, `BETTER_AUTH_URL`, and
`ACTIVATION_PUBLIC_BASE_URL` to `https://voskuils.com`.

### 3. Prepare The Database

If migrations have not already been applied to the shared development database, run:

```bash
npx prisma migrate dev
```

If the shared development database does not already have a super admin, seed one:

```bash
npx prisma db seed
```

For the current shared development DB, check with the team before running migrations or seed commands.

### 4. Start The App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

In development, invite and password reset links are logged to the dev server console.

## Vercel Deployment

Vercel should auto-detect this project as a Next.js app.

Use these project settings:

- Install command: `npm ci`
- Build command: `npm run build`
- Production domain: `voskuils.com`
- Additional domain: `www.voskuils.com`

The app redirects `www.voskuils.com` to the canonical apex domain,
`https://voskuils.com`, through `next.config.ts`.

Set these Vercel production environment variables before deploying:

```env
DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...db....supabase.co:5432/postgres"
BETTER_AUTH_SECRET="generated-strong-secret-at-least-32-chars"
BETTER_AUTH_URL="https://voskuils.com"
APP_URL="https://voskuils.com"
ACTIVATION_PUBLIC_BASE_URL="https://voskuils.com"
ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS="production-fingerprint(s)"
BOOTSTRAP_ADMIN_EMAIL="admin@voskuils.com"
BOOTSTRAP_ADMIN_NAME="Initial Super Admin"
BOOTSTRAP_ADMIN_PASSWORD="strong-temporary-bootstrap-password"
ADMIN_INVITE_TTL_HOURS="24"
AUTH_EMAIL_FROM="UNIFY Admin <admin@voskuils.com>"
CREDENTIAL_EMAIL_FROM="UNIFY Credentials <admin@voskuils.com>"
CREDENTIAL_EMAIL_DELIVERY_MODE="resend"
RESEND_API_KEY="re_..."
NEXT_PUBLIC_API_BASE_URL="mock://unify-admin"
SETUP_BYPASS="false"
```

Optional service integration variables:

```env
AGENT_SERVICE_URL="https://..."
AGENT_API_KEY="..."
WEBHOOK_SIGNING_SECRET="same-secret-configured-in-the-agent-service"
```

For local webhook testing, configure the Identity Agent Service with:

```env
WEBHOOK_URL="http://localhost:3000/api/webhooks/agent"
WEBHOOK_SIGNING_SECRET="same-secret-configured-in-the-admin-portal"
```

The agent already emits `credential.stateChanged` events when Credo credential
exchange records move through `offer-sent`, `request-received`,
`credential-issued`, and `done`. The admin portal webhook endpoint accepts that
existing event type and maps `done` to `ISSUED`.

Before testing production email, verify `voskuils.com` in Resend and make sure
`admin@voskuils.com` is allowed as a sender. In production, admin invites,
password resets, and credential activation emails use Resend.

After deployment, smoke test:

- `https://voskuils.com/sign-in` loads.
- `https://www.voskuils.com` redirects to `https://voskuils.com`.
- Admin invite and password reset emails arrive through Resend.
- Reset links point to `https://voskuils.com/reset-password`.
- Credential activation links point to `https://voskuils.com/activate`.

### Useful Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Auth And Admin Access

The portal uses Better Auth with Prisma-backed persistence. Public sign-up is disabled; admin users are created by invite or by the development bootstrap seed.

- `/sign-in`: admin sign-in.
- `/users`: manage admin users.
- `/users/invites`: create and revoke admin invites.
- `/forgot-password`: request a password reset.

### Super Admin Account

```
Email: superadmin@example.com
Password: SuperAdmin123!
```

## App Structure

Current structure:

- `src/app/` for Next.js App Router routes.
- `src/components/` for shared admin UI primitives.
- `src/features/credentials/` for credential lifecycle workflows.
- `src/features/students/` for student lookup and detail views.
- `src/features/vendors/` for service-provider onboarding and approval.
- `src/features/rules/` for validity and eligibility rules.
- `src/features/audit/` for governance and audit views.
- `src/lib/api/` for typed API clients.
- `src/lib/auth/` for Better Auth configuration, sessions, roles, permissions, and invite logic.
- `src/lib/audit/` for audit logging helpers.
- `src/lib/db/` for Prisma client setup.
- `prisma/` for database schema, migrations, and seed script.

## Scope Alignment

This repo should stay aligned with the BA system document:

- Build for a controlled proof-of-concept, not production rollout.
- Use the simulated university student records connector until a later integration decision exists.
- Manage issuance, renewal, suspension, reinstatement, revocation, vendor onboarding, rules, monitoring, and audit workflows.
- Do not connect to live university systems or real payment infrastructure in this project scope.
- Keep PII off-chain; ledger integrations should store only public trust artefacts.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): systems, repo boundaries, and runtime flows.
- [Decisions](docs/DECISIONS.md): important project decisions and why they were made.
- [API Contracts](docs/API_CONTRACTS.md): draft contracts between wallet, admin, vendor, and future backend services.
- [Workflow](docs/WORKFLOW.md): GitHub Issues, PRs, checks, releases, and deployment conventions.
