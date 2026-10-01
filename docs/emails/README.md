# Wallet Signature emails

All ten application emails share a green UNIFY header, readable body, accessible action, and contextual footer. HTML and plain text come from the same typed message content. No image download is required to read a code or use an action.

Open `index.html` locally to review each email at desktop and mobile widths. The optional dark preview illustrates our CSS; it does not establish Gmail or Outlook compatibility. The HTML and plain-text files under `email-previews/` contain fictional people, a fictional OTP, and inactive example.invalid links. They are presentation samples, not valid account invitations or credentials.

## What changed

- A pure shared renderer in `src/lib/email/layout.ts` supplies presentation tables, inline styles, escaping, wrapping links, and progressive dark-mode styles.
- `src/lib/email/templates.ts` defines the ten messages. Absolute invitation and activation dates use Africa/Johannesburg and explicitly say SAST. OTP and password reset retain their supplied relative lifetimes.
- The existing nine email senders use these renderers. Payment OTP email delivery moved into its own email module; OTP generation, cooldown, attempts, verification and session behavior did not change.
- Application approval explicitly means credential-verifier approval. It does not represent approval to accept payments.
- Existing recipients, configured senders, Reply-To, console/email modes, provider results and delivery failures remain unchanged. Supplied URLs remain unchanged in the button and fallback link. No tracking redirect was introduced.

## Automated evidence

Implementation commit: `fbf06191d726f202cc73c9e9225172d9e509d2cb`.

- [CI](https://github.com/AdvanceUCT/unify-admin-portal/actions/runs/36797441966): lint and typecheck passed; 919 unit tests passed, including 38 email rendering and sender compatibility tests. The PostgreSQL payment suite passed 30 tests; the billing suite passed 32 tests against isolated databases.
- [Production build](https://github.com/AdvanceUCT/unify-admin-portal/actions/runs/36797441864) passed.
- Coverage includes every template, escaped names/reasons/attributes, unchanged URLs, plain-text content, selectable OTP, expiry, long content, multiline help requests, optional metadata, transport settings and failure propagation. Existing OTP/authentication regressions remain in the suite.

Automated checks run in GitHub Actions only.

## Acceptance and rollout

Pending: review these actual-source previews; then send representative fictional samples to the user-agreed test inbox. Check Gmail Android and Outlook in light/dark mode with images disabled, code readability, button/fallback URLs, expiry and complete content. If a client is unavailable, record that acceptance gap instead of claiming success.

Also pending: one real credential activation through the existing authorized test flow on the phone. Fictional samples do not prove wallet handoff.

After review, deploy to the existing test deployment for acceptance; complete production rollout only after the required inbox checks pass. No wallet APK, POS release, schema change, API change, dependency or sender configuration change is included. Revert the presentation change if delivery or URL behavior regresses.

Merge portal #114 first, then this email PR. This branch starts at #114's latest head, rather than the older main branch. QStash is the scheduler that periodically wakes the payment callback dispatcher; it has no role in rendering or sending these transactional emails, and this PR does not change it.
