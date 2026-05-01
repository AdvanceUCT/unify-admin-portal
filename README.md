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
