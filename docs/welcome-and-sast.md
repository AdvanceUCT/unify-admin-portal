# Welcome and South African time

Visual direction: warm campus paper, forest green and one oversized fictional student card. A serif headline leads to a short Android installation flow, followed by verification/payment context and audience actions. The card is a CSS illustration, with no personal data or remote assets. Entrance motion is disabled under reduced motion. No APK is published.

The public homepage renders at `/` for every visitor, with or without a portal session. `/welcome` remains available as an alias. The staff overview is at `/dashboard`, behind the existing admin layout and role checks. Default staff sign-in, setup completion, cross-portal admin redirects and the Overview navigation target `/dashboard`. Protected deep links retain their callback destinations. The welcome header links directly to `/fund`, `/vendor/sign-in` and `/sign-in`.

The previous proxy-only redirect was insufficient: Next's build discovers proxy files next to `src/app`, while the existing proxy module lives at repository root. Its unit tests did not prove deployed routing. The public root route now works independently of that legacy proxy module. A GitHub Actions smoke check starts the actual Next production build with synthetic configuration, verifies `/` with/without a session cookie and verifies the unauthenticated dashboard guard. It does not connect to the live database.

Portal display/input helpers live in `src/lib/formatters/time.ts`. Calendar filter days are interpreted in Africa/Johannesburg, including the next day's exclusive boundary. Scheduled datetime-local inputs represent SAST. CSV columns explicitly name SAST +02:00 and use offset-bearing ISO values; filenames and PDF issue dates use the South African calendar day. API serialization, signed messages and stored dates remain UTC. Genuine date-only values retain their original representation.

Automated validation runs only in GitHub Actions. Browser fixtures share the production WelcomePage, integration shell and workflow components. Screenshots cover mobile and desktop. No migration or production deployment is included.
