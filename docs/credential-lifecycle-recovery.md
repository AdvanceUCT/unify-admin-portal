# Credential lifecycle deployment and recovery

## Why a successful revocation can appear as a 502

The portal requires a persisted lifecycle revision and event ID from the agent.
An older agent can commit revocation to the ledger but return a response without
those fields. The portal rejects that response and leaves its database unchanged.
The legacy webhook cannot repair the state either when its authoritative snapshot
also lacks a revision. That callback receives 503.

Repeated revocation requests to the old agent return its saved terminal state,
still without the required identity. Increasing the portal timeout does not fix
this contract mismatch.

During the 15 October 2026 investigation, the running agent container was built
on 15 September and its host checkout was at `c4fdd53`. Agent PR #16 was already
merged at `7552b933f081dccf46af3786418a6138a3bae2ae` but had not been deployed.
The logs showed a successful revocation, a rejected lifecycle callback, and
successful idempotent responses to subsequent revocation attempts.

## Required rollout order

1. Deploy the agent's revisioned lifecycle contract from PR #16 or a descendant.
   Follow `unify-agent-service/docs/r03-r05-contracts.md`, including its wallet
   prerequisite and legacy credential-definition inventory. A successful build
   in GitHub does not update the EC2 container.
2. Preserve the existing agent configuration and `agent-data` volume. Back up
   operational state before replacing the container. Never use `docker compose
   down -v` to resolve this incident.
3. Verify an authenticated `GET /api/credentials/{exchangeId}/lifecycle` against
   the running service. It must return the matching exchange and revocation
   identifiers, a non-negative integer `revision`, and a stable non-empty
   `eventId`. Check a saved historical record twice. The agent migrates old
   records to revision zero and preserves their existing status and timestamp.
4. Deploy this portal fix. No portal database migration is required.
5. Retry **Revoke** for an affected credential whose portal status is stale.
   The portal reads the authoritative snapshot, records its terminal revocation
   and audit evidence, and returns success without sending another revoke call.
   The recovered audit preserves the original agent reason and time. It does
   not attribute the earlier action to the administrator making the retry.
6. Confirm that the portal status and audit show the same terminal result. For
   an unrelated future lifecycle change, confirm that its callback is accepted.

If the agent is still outdated, the portal now rejects the operation with 503
and an instruction to update the agent **before** sending a lifecycle mutation.
Do not fabricate revisions or mark a credential revoked based on a browser
error. A bound, revisioned agent snapshot remains the source of truth.

Manual and scheduled writes include the revision read during preflight. If the
agent state changes concurrently, it returns a conflict rather than applying
the change to an unexpected state. A suspension or reactivation request for an
already revoked credential repairs the portal's terminal state and returns 409.
