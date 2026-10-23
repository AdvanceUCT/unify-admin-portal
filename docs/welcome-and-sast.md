# Welcome and South African time

Visual direction: warm campus paper, forest green and one oversized fictional student card. A serif headline leads to a short Android installation flow, followed by verification/payment context and audience actions. The card is a CSS illustration, with no personal data or remote assets. Entrance motion is disabled under reduced motion. No APK is published.

Anonymous visits to `/` open `/welcome` instead of sign-in. Authenticated staff retain their dashboard at `/`; protected deep links and explicit sign-in routes keep their existing authentication behavior. The welcome header links directly to `/fund`, `/vendor/sign-in` and `/sign-in`. Both sign-in forms link back to the welcome page.

Portal display/input helpers live in `src/lib/formatters/time.ts`. Calendar filter days are interpreted in Africa/Johannesburg, including the next day's exclusive boundary. Scheduled datetime-local inputs represent SAST. CSV columns explicitly name SAST +02:00 and use offset-bearing ISO values; filenames and PDF issue dates use the South African calendar day. API serialization, signed messages and stored dates remain UTC. Genuine date-only values retain their original representation.

Automated validation runs only in GitHub Actions. Browser fixtures share the production WelcomePage, integration shell and workflow components. Screenshots cover mobile and desktop. No migration or production deployment is included.
