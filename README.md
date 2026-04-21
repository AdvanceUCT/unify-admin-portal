# UNIFY Admin Portal

Admin and governance portal for UNIFY. This repo is planned as the Next.js web application used by administrators and issuer operators to manage Verifiable Credential lifecycle workflows.

Future Codex instances should read this file first, then:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md)
- [docs/WORKFLOW.md](docs/WORKFLOW.md)

## Current Status

- Stack: Next.js, TypeScript, Tailwind CSS.
- Current implementation: lean runnable app scaffold with typed mock data.
- App scaffold: created with App Router routes for admin operations.
- Current data: no real student data or production secrets.
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

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## Planned App Structure

Current structure after scaffolding:

- `app/` or `src/app/` for Next.js routes.
- `src/components/` for shared admin UI primitives.
- `src/features/credentials/` for credential lifecycle workflows.
- `src/features/students/` for student lookup and detail views.
- `src/features/vendors/` for service-provider onboarding and approval.
- `src/features/rules/` for validity and eligibility rules.
- `src/features/audit/` for governance and audit views.
- `src/lib/api/` for typed API clients.
- `src/lib/auth/` for admin session and authorization helpers.

## Scope Alignment

This repo should stay aligned with the BA system document:

- Build for a controlled proof-of-concept, not production rollout.
- Use simulated student records until a later integration decision exists.
- Manage issuance, renewal, suspension, reinstatement, revocation, vendor onboarding, rules, monitoring, and audit workflows.
- Do not connect to live university systems or real payment infrastructure in this project scope.
- Keep PII off-chain; ledger integrations should store only public trust artefacts.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): systems, repo boundaries, and runtime flows.
- [Decisions](docs/DECISIONS.md): important project decisions and why they were made.
- [API Contracts](docs/API_CONTRACTS.md): draft contracts between wallet, admin, vendor, and future backend services.
- [Workflow](docs/WORKFLOW.md): GitHub Issues, PRs, checks, releases, and deployment conventions.
