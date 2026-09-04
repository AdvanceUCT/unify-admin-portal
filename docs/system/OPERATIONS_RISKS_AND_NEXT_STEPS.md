# Operations, risks and next steps

Snapshot date: 2026-09-04. Counts and external availability can change after this date.

## Verification evidence

### Default-branch build health

| Repository/ref | Last required application checks | Local scan evidence |
|---|---|---|
| `unify-admin-portal@9b4a604` | Build, CI and CodeQL succeeded on 2026-09-02 | Fresh install succeeded; lint completed with 6 warnings/0 errors; typecheck passed; 68 files and 390 tests passed |
| `unify-student-wallet@b9a3671` | Build and CI succeeded on 2026-08-16; later CodeQL succeeded | Install and typecheck passed. A full 219-test run under concurrent scan load had one 5-second timeout; the affected 16-test file passed immediately in isolation. Treat as a possible timing flake, not a demonstrated functional failure |
| `unify-agent-service@d7f827e` | Build and CI succeeded on 2026-08-16 | Windows install was not a valid verification run: native FFI compilation failed in the temporary directory with file-lock/tooling errors. The supported Docker/Linux CI result is the relevant evidence |
| `unify-vendor-portal@d8f9edb` | Build and CI succeeded on 2026-05-07; later CodeQL succeeded | Fresh install, lint, typecheck, 7 tests and production build passed |

The admin build was not repeated locally because a realistic Next.js production build depends on deployment-only database/auth configuration and the Vercel build is already tied to the exact audited commit. The public production endpoint was smoke-tested instead.

### Live availability

- Admin/Vendor Portal: both Vercel hostname and `voskuils.com` returned HTTP 200 at `/sign-in`.
- Android App Links metadata: both hosts returned HTTP 200 JSON for `/.well-known/assetlinks.json`.
- Agent: `https://agent-api.voskuils.com/api/health` returned HTTP 200 with an initialized agent.
- No authenticated issuance, proof, database mutation or lifecycle operation was performed.

## Risk register

### P0 — resolve before any production claim

#### Dependency findings include critical/high advisories

The dependency workflows are not currently a clean security gate:

| Repository | Latest observed audit result | Important nuance |
|---|---|---|
| Admin portal | Fresh 2026-09-04 `npm ci`: 17 findings (13 high, 3 moderate, 1 low) | Latest scheduled workflow on 2026-08-31 had already failed with 15 findings |
| Agent service | Scheduled 2026-08-31 audit: 44 findings (2 critical, 16 high, 24 moderate, 2 low) | Includes native/identity-stack transitive packages; remediation must preserve Credo compatibility |
| Student wallet | Scheduled 2026-08-31 Yarn audit: 304 findings (3 critical, 196 high, 78 moderate, 27 low) | Workflow intentionally converts audit failure into a warning, so the GitHub job is green despite findings; Yarn counts are often transitive/path-duplicated |
| Standalone vendor portal | Fresh 2026-09-04 `npm ci`: 10 findings (9 high, 1 low) | This risk can be retired by archiving the unused repo rather than maintaining a second portal |

These are package-manager findings, not proof that every advisory is reachable in production. Triage by runtime reachability, exploit preconditions and fix compatibility. Do not apply `npm audit fix --force` blindly to Next, Prisma, Credo or native wallet packages.

Recommended response:

1. Export machine-readable audits and group by direct dependency and runtime/dev scope.
2. Patch focused leaf dependencies first (`fast-uri`, `nanoid`, `js-yaml`, actions).
3. Test framework upgrades in dedicated PRs with issuance, activation, proof, revocation and App Link checks.
4. For the agent/wallet Credo trees, document accepted residual advisories and compensating controls when no compatible fix exists.
5. Make the wallet security workflow fail for unaccepted critical/high runtime findings, or publish an explicit accepted-risk baseline rather than returning unconditional success.

#### The system is explicitly a PoC

BCovrin is a public test ledger; payment behavior is simulated on `main`; operational metadata uses local JSON files; and there is no evidence in this audit of production privacy, threat-model, capacity, recovery or compliance sign-off. Preserve the PoC label in demos and stakeholder material.

### P1 — stabilize before broader pilot use

#### Agent deployment provenance is not observable

The public health response proves that an initialized service is running but not which source revision or configuration schema is running. Add a non-secret build identifier (commit SHA, build time and API schema version) to health/status and record deployments against GitHub commits.

#### No versioned releases or organisation-visible wallet artifacts

There are no Git tags or Releases in any repository. The signed Android APK is produced on a developer machine. This leaves testers without a durable mapping among source, APK signature, environment and test evidence.

Create a versioning policy and a protected Android release workflow that produces a signed or securely signable artifact, checksum, SBOM and release notes. Never expose signing keys to ordinary PR jobs.

#### Agent state is a single persistent volume

The `agent-data` volume contains issuer keys, protocol records, tails files, lifecycle distinctions and allocation metadata. `docker compose down -v` is destructive. Establish encrypted backup, restore and recovery testing before relying on this deployment for a pilot.

At minimum, document:

- host/provider and volume identifier;
- backup frequency, encryption and retention;
- who can restore and rotate keys;
- recovery-time and recovery-point objectives;
- a tested procedure for restoring the Askar wallet and matching JSON stores together.

#### Credo version skew

The wallet is on Credo 0.6.3 while the agent is on 0.5.x. Do not upgrade either independently without a compatibility matrix covering offer receipt, mediator pickup, proof presentation, revocation and connectionless invitations.

#### Vendor repository ambiguity

The active vendor portal is inside the admin repository; the standalone portal still receives Dependabot alerts and looks active. Archive it or add a conspicuous deprecation notice and disable unnecessary automation. This reduces false ownership signals and dependency noise.

### P2 — engineering hygiene

#### Branch backlog obscures current work

Most agent feature branches are already merged; many admin/wallet branches are superseded. Retire them after owner confirmation. Keep PRs as the permanent review record.

#### Release workflow does not produce releases by itself

The shared release workflow reacts to tags but nothing currently creates or governs those tags. Document who cuts a release, required checks, environment promotion and rollback.

#### Local wallet test timing

One wallet test exceeded its 5-second timeout only while four repositories were installing/testing concurrently, then passed in isolation. This is likely resource sensitivity, but CI duration/trend should be watched. Prefer deterministic fake timers or event-based readiness over increasing the timeout without diagnosis.

#### Lint warnings in the admin portal

The current admin baseline has six unused-variable warnings. They do not fail CI, but cleaning them up will keep the signal-to-noise ratio healthy.

## Recommended stabilization sequence

### 1. Establish the source baseline

- Merge wallet PR #63 after Android checkout-flow verification.
- Update/review admin PR #73 and its migrations.
- Decide whether experimental Ethereum/payment branches are in scope; do not merge them by default.
- Archive/deprecate the standalone vendor portal.

### 2. Triage dependencies without breaking identity flows

- Capture current JSON audit reports as CI artifacts.
- Split runtime from development-only findings.
- Merge focused low-risk security updates.
- Create explicit framework and Credo upgrade tracks with end-to-end tests.

### 3. Make releases traceable

- Add build SHA/API schema version to agent health.
- Tag coordinated system releases across the three active repos.
- Publish checksums and an SBOM for the agent image and Android APK.
- Record Vercel, agent and wallet deployment/artifact versions in one release manifest.

### 4. Prove recovery and security boundaries

- Test agent volume backup/restore.
- Test portal database migration/rollback strategy on a production-like copy.
- Rotate and inventory server-to-server, webhook, database, storage and APK-signing secrets.
- Run an authenticated end-to-end test: setup → issue → activate → verify → suspend → reject proof → reactivate → approve proof → revoke.

### 5. Define pilot readiness criteria

A pilot gate should include, at minimum:

- accepted or remediated critical/high runtime dependency findings;
- reproducible, signed wallet artifact and source provenance;
- agent/database backup and restore evidence;
- environment monitoring, log retention and alert ownership;
- documented privacy retention for student, verification and audit data;
- an incident and key-compromise response procedure;
- successful end-to-end tests on the exact release versions.

## Lightweight operational checks

These checks are read-only and do not require secrets:

```powershell
curl.exe -sS -L -o NUL -w '%{http_code} %{url_effective}\n' https://voskuils.com/
curl.exe -sS https://agent-api.voskuils.com/api/health
curl.exe -sS -L https://voskuils.com/.well-known/assetlinks.json
```

Authenticated status, issuance and verification checks must use securely sourced credentials and should never print keys or capability tokens into logs.

## Audit boundaries

This assessment did not inspect private infrastructure configuration, Vercel/Supabase/Caddy dashboards, DNS ownership, production logs, secret age, database contents, Android signing certificates, backup media or authenticated identity records. Those need a separate authorized operational/security review.
