# UNIFY Admin Portal

Admin and governance portal for UNIFY. This repo is planned as the Next.js web application used by administrators and issuer operators to manage credential lifecycle workflows.

Future Codex instances should read this file first, then:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md)
- [docs/WORKFLOW.md](docs/WORKFLOW.md)

## Current Status

- Stack: planned Next.js, TypeScript.
- Current implementation: repository governance files only.
- App scaffold: not created yet.
- Current data: no real student data or production secrets.
- GitHub Actions: present and expected to handle the repo before an app package exists.

This repo owns:

- Credential lifecycle administration
- Issuer operations
- Student credential suspension, revocation, and renewal support
- Admin-facing reporting and governance workflows
- Repo and DevOps conventions for the admin surface

## Working Agreement

- Work enters through issues and pull requests.
- `main` is protected and should only change through reviewed PRs.
- Use draft PRs early when work is still in progress.
- Link every PR to an issue before it is merged.
- Security-sensitive changes need two approving reviews before merge.

## Getting Started

The Next.js app has not been scaffolded yet. Once implementation starts, scaffold the app in this repo and update this section with the exact commands.

Expected baseline commands once a package is present:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## Planned App Structure

Expected structure after scaffolding:

- `app/` or `src/app/` for Next.js routes.
- `src/components/` for shared admin UI primitives.
- `src/features/credentials/` for credential lifecycle workflows.
- `src/features/students/` for student lookup and detail views.
- `src/features/audit/` for governance and audit views.
- `src/lib/api/` for typed API clients.
- `src/lib/auth/` for admin session and authorization helpers.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): systems, repo boundaries, and runtime flows.
- [Decisions](docs/DECISIONS.md): important project decisions and why they were made.
- [API Contracts](docs/API_CONTRACTS.md): draft contracts between wallet, admin, vendor, and future backend services.
- [Workflow](docs/WORKFLOW.md): GitHub Issues, PRs, checks, releases, and deployment conventions.
