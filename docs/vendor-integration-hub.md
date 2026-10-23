# Vendor integrations

Owners use one integration layout with three route links. The landing route is Verification, Payments is its own workflow, and API keys is the only place to create or revoke credentials. There is no separate overview, guide index, callback page or API reference to navigate between.

## Canonical destinations

| Destination | Purpose |
|---|---|
| `/vendor/integrations` | Verification setup and examples |
| `/vendor/integrations#webhooks` | Verification webhook configuration and signature example |
| `/vendor/integrations/payments` | Sale setup and examples |
| `/vendor/integrations/payments#refunds` | Durable refund operations and interrupted-instruction recovery |
| `/vendor/integrations/payments#webhooks` | Payment/refund webhook configuration and signature example |
| `/vendor/integrations/keys?preset=payments&returnTo=payments` | Payment-key creation with a visible return action |

The primary navigation has the same heading, spacing and vendor theme on every route. Desktop pages have a sticky outline. Mobile pages have a sticky Jump to selector below the portal header. Section jumps focus their target and keep it clear of sticky controls. Browser refresh and Back/Forward retain the route.

## Guidance and contracts

Shared typed endpoint and step content generates each workflow's cURL and Node.js examples. Request fields, permissions, synthetic responses and recovery notes expand beside the relevant example. Each endpoint has one canonical anchor. API keys are never inserted into documentation. Examples use `APP_URL`, the selected branch and environment-variable placeholders. The existing test payment configuration remains; there is no sandbox/live switch or in-page API runner.

Verification and payments remain separate. A student does not need credential verification before paying. New refund integrations register frozen instructions, execute only after acknowledgement, and retain unresolved references after errors. The older refund POST wrapper remains under explicitly labelled compatibility details.

Real branch and key records determine prerequisites. Configured settings and recorded delivery success are separate facts. Manual integration-test checklists do not claim the system recorded those checks.

## Webhooks and one-time secrets

A single webhook controller serves verification or payments in its respective workflow. Delivery history is hidden from both workflows. No history is requested on page load or after settings changes. Stored records, authenticated history/retry APIs and delivery processing remain available; old delivery-history bookmarks open Webhooks.

Verification signs exact raw bytes and retains its manual retry contract. Payments sign `timestamp + "." + rawBody` with the existing timestamp tolerance and automatic retry schedule. Retry uses the current destination and can repeat an event. Receivers deduplicate event IDs durably and reread authoritative state before fulfillment. Delivery failure never reverses a verification decision or financial result.

Key presets, immutable permissions, explicit payment/refund branch restrictions, refund opt-in, default verification branch rules, revocation confirmations and webhook secret rotation remain. Secret-generating requests are never automatically retried. New secrets remain in component memory, support Copy and Hide, and disappear on route departure. A request completed after departure cannot reveal its secret on the returning page. A lost creation response requires authoritative recovery and explicit replacement when necessary.

## Existing links

Old guide, callback and reference routes remain owner-authenticated compatibility entry points. They replace the browser URL with the matching workflow and anchor, rather than rendering another copy of the content.

- Guide index and verification guide open Verification setup.
- Payment and refund guides open Payments setup or Refunds.
- Callback routes use the existing `type` query to choose Verification or Payments.
- API-reference endpoint fragments choose the matching workflow from the shared endpoint catalogue.
- Known guide-step fragments remain supported, including refund-step aliases. Unknown fragments fall back to the corresponding setup section.
- Closed enclosing details open when a legacy link targets a nested endpoint.

Keys retain their preset queries. Return destinations are restricted to the two known workflows. Owner authentication and all existing API authorization contracts remain in place.

## Validation and rollout

All automated checks run in GitHub Actions only, including lint, typecheck, unit, isolated PostgreSQL, browser and build checks. Synthetic browser fixtures import the same production shell, workflow composition, key content and loading/error components used by the real routes. Route-composition tests separately verify the owner-authenticated route functions and their shared layout. The fixture no longer renders a different overview component from production.

Browser coverage includes both viewport sizes, one shared heading and three consistent links, legacy redirects and anchors, browser history, keyboard focus, readable code, sticky-section offsets, configuration load failures, presets and clearing secrets on departure. Unit coverage retains secret rotation, late responses, clipboard failures, ambiguous mutations, branch restrictions and authenticated delivery API regressions. Reports and screenshots are uploaded as `integration-browser-review` artifacts.

Fixtures use synthetic data and actions. They do not prove a live authenticated vendor journey, send real webhooks or perform payments. Record the final commit, passing runs and inspected screenshots in PR evidence. Live acceptance and production deployment require separate authorization.

The previous navigation cleanup shipped with PR #129. No database migration, public API change, financial-policy change, merge or Jira transition is included.
