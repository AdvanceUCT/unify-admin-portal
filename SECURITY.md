# Security Policy

## Reporting a Vulnerability

Do not open a public issue for exploitable vulnerabilities, leaked secrets, private keys, credentials, or real student data.

Use GitHub private vulnerability reporting for this repository:

https://github.com/AdvanceUCT/unify-admin-portal/security/advisories/new

For non-sensitive hardening work, open a security concern issue and keep the description high level.

## Security-Sensitive Changes

Security-sensitive changes require two approving reviews before merge. This includes changes that affect:

- authentication or authorization
- credential issuance, verification, revocation, renewal, or storage
- wallet, issuer, verifier, or credential lifecycle code
- secrets, environment variables, or deployment configuration
- GitHub Actions workflows and CODEOWNERS

## Data Handling

- Do not commit secrets, credentials, private keys, or tokens.
- Do not commit real student data.
- Use environment secrets for deployment configuration.
- Rotate any secret that may have been exposed.

