# Refund timeouts and recovery

Refund registration commits a frozen instruction before execution. Execution atomically posts the refund, updates the operation and creates its webhook outbox event. An interrupted execution can leave a recoverable pending instruction; an error response alone does not prove whether money moved.

## Transaction limits

Refund operation transactions use a 15-second timeout and a five-second connection-acquisition limit. Other serializable transactions retain their current defaults. Serialization conflicts and deadlocks have at most three attempts. Timeouts, lost connections and ambiguous commit errors are not automatically retried. Refund routes have a 150-second execution allowance; the Vercel project must retain Fluid Compute support for that allowance.

Execution serializes the completed operation using its already calculated result, avoiding another refund-result lookup before commit. Completed operation reads and replays still validate the existing posting.

## Recovery controls

- **Refresh status** performs reads only. It neither registers an unacknowledged instruction nor executes a pending refund.
- **Retry refund** explicitly registers the original frozen terms if registration was unacknowledged, then executes that operation. It never replaces the key or amount.
- **Cancel pending refund** cancels the original instruction; a competing completed execution returns the completed result.

Pending instructions remain bound to their vendor and operator. Storage is cleared only after a validated completed, rejected or cancelled response. Missing records, malformed responses, HTTP errors and timeouts preserve recovery references. Successful completion updates refund totals and refreshes the wallet display.

## Error contract and diagnostics

Recognized database timeouts, availability failures and exhausted transaction conflicts return HTTP 503 with `error.code=REFUND_TEMPORARILY_UNAVAILABLE`. The message asks the client to refresh status and keep the original reference. This error does not mark the operation rejected. Unexpected failures remain HTTP 500. Existing business errors and success fields are preserved across portal, vendor API and compatibility endpoints.

Every refund error response has `error.requestId` and an `X-Request-ID` header. Server failures emit a structured `refund_request_failed` console event with the request ID, endpoint action, stage, elapsed milliseconds, transaction attempt count, category and allowlisted database error code. Logs omit raw exception messages, SQL, tokens, request bodies and student attributes. Request metadata uses AsyncLocalStorage so simultaneous requests do not overwrite each other.

## Evidence and rollout

The PostgreSQL latency regression was introduced separately on commit `f3d28d9`. It failed against the original transaction limit while the unit, lint, type and build checks passed: [before-fix CI](https://github.com/AdvanceUCT/unify-admin-portal/actions/runs/40110167976). The fixture delays database round trips by 150 ms and uses real isolated PostgreSQL, with synthetic records only.

The reported production request's original exception could not be retrieved from the available Vercel log window. The regression establishes the application timeout defect; it does not establish that Supabase's Management API incident caused that refund failure.

No migration or record cleanup is needed. Deploy separately after review. Then refresh the existing operation as its original operator. If pending, explicitly retry or cancel it. Confirm its terminal state, ledger posting count and balance changes. Never delete records or clear recovery storage to bypass a pending instruction.
