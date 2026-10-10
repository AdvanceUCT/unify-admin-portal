# Vendor integration hub

AD-217, AD-218 and AD-220 share an owner-only hub at `/vendor/integrations`. Existing credential scopes, branch restrictions, webhook contracts and durable financial operations are unchanged. No database migration is added.

## Page structure

The landing page uses the approved light design: white surfaces, navy accents, underlined Website verification / POS payments / API keys tabs, 32px page title, 24px section headings and 16px body text. Website and POS instructions sit beside their callback settings on desktop and stack on mobile. Technical examples expand on demand. Keyboard tabs support arrows, Home and End. Form values survive tab changes, while newly revealed secrets are cleared, including late responses from an abandoned tab. Existing deep links retain their separate navigation, guides, preset key creation and callback history.

| URL | Purpose |
| --- | --- |
| `/vendor/integrations` | Configure website verification, POS payments and shared keys in three focused tabs. |
| `/vendor/integrations/guides` | Select verification, payments or refunds. |
| `/vendor/integrations/guides/verification` | Start a checkout verification and read the decision. |
| `/vendor/integrations/guides/payments` | Create a fixed sale, display its QR, read receipt or cancel. |
| `/vendor/integrations/guides/refunds` | Register frozen terms, execute explicitly, recover or cancel. |
| `/vendor/integrations/keys` | Create preset/custom permissions and review masked keys. |
| `/vendor/integrations/callbacks?type=verification` | Configure verification callbacks and inspect recorded attempts. |
| `/vendor/integrations/callbacks?type=payments` | Configure payment/refund events and inspect delivery/retry history. |
| `/vendor/integrations/reference` | Search shared endpoint examples and troubleshooting. |

Owner access remains required. Guides and keys use the deployment's `APP_URL`, never a selectable unsupported live/sandbox mode. Current payment-provider configuration is test-only. Empty, loading, failed and partially configured states have explicit next actions. A configuration badge does not claim successful end-to-end acceptance.

## Contracts and one-time secrets

`src/lib/vendors/integrationGuide.ts` contains shared typed endpoint content, presets, cURL/Node request generation, synthetic response examples and separate callback signature examples. No example contains an issued secret. Copying code never inserts a key from the key-management screen.

Key presets use the existing exact scopes. Refunds are an explicit opt-in. New payment/refund keys require selected owned branches; inactive branches remain visible for authorized recovery, while new execution still checks eligibility. Checkout verification uses the default verification branch. A restricted key must include that branch.

Secret creation and replacement are explicit actions. Requests are not automatically repeated after ambiguous failure. Key creation refreshes masked records after a lost acknowledgment. A secret lost in transit cannot be recovered; revoke/reissue the key or explicitly replace the callback secret. Secrets remain in component memory until hidden or the user leaves the page, and are never written to browser storage.

`GET /api/vendor/integrations/webhook/history?limit=20&cursor=...` is additive and owner-authenticated. It pages verification attempts with a stable attemptedAt/id boundary and vendor-bound cursor validation. Limits are 1–50. The response contains `items`, `nextCursor` and `lastSuccess`. Each item exposes attempt ID/number, verification identifiers, checkout reference, current verification status, delivery status, HTTP status, timestamp and safe failure description. It omits stored error messages, student attributes, secrets and historical destinations. Responses disable caching.

Verification callbacks sign raw body bytes and retain their existing manual retry endpoint. Payment callbacks sign `timestamp + "." + rawBody`, enforce a five-minute receiving tolerance and have their existing automatic retry schedule. Payment history and manual retry continue using the existing API and delivery records. Retrying uses the current destination and can repeat an event; receiving systems must deduplicate durably and reread authoritative state before fulfillment.

Existing verification callbacks and external checkout responses may include a safe student summary. Payment events contain no student identity. No public response shape or financial eligibility rule is changed by this UI increment.

## Testing and release

Local validation covers unit/component tests, TypeScript and lint; the tabbed presentation was also checked with synthetic data at desktop/mobile sizes and 200% zoom-equivalent sizing. GitHub Actions CI covers lint, types, unit tests, isolated PostgreSQL regressions and the Next build. Added history regressions cover tied timestamps, foreign cursors, safe projection and suspended-vendor access. Existing refund, callback and credential regressions remain part of CI.

The Integration browser review workflow uses Chromium at desktop and mobile sizes. Synthetic fixtures import the production presentation components and portal CSS, while replacing only navigation adapters and API responses. The fixture server refuses to run outside GitHub Actions. It never connects to live records. Screenshots, browser errors, horizontal overflow, deep links, endpoint search, language selection and keyboard navigation are checked. Reports and screenshots are uploaded as `integration-browser-review` artifacts for visual inspection.

These fixtures do not prove authenticated routing or a physical student payment. Server-route authorization tests and the Next build cover routing separately. Record final commit/run URLs and inspected screenshots in the delivery evidence. Keep this PR unmerged and undeployed until separately authorized. Do not transition Jira tickets during implementation.

## Design references

- [Plaid quickstart](https://plaid.com/docs/quickstart/) explains prerequisites and the integration flow before deeper requests.
- [Stripe API keys](https://docs.stripe.com/keys) distinguishes server credentials from webhook signing secrets.
- [Paystack webhooks](https://paystack.com/docs/payments/webhooks/) explains polling, callback delivery and receiving-server behavior.
- [Playwright CI](https://playwright.dev/docs/ci-intro) describes GitHub Actions browser tests and report artifacts.
