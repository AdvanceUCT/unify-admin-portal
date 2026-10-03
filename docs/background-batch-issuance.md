# Background batch issuance

Batch creation and failed-item retry return `202 Accepted` after saving a queued run. Next.js `after()` runs the existing agent batch call and email delivery after the response, so the administrator can navigate immediately and leave or close the browser.

Active run details poll every three seconds and history every five seconds, pausing in hidden tabs. Progress remains pending until the bulk agent response returns, then updates as delivery finishes.

Submission still waits for authentication, eligibility validation, and database writes before returning acceptance. It reuses the student data fetched during validation to build the response. Detail loading and polling fetch only the students referenced by the run. The submission button stays in its starting state through navigation, and the detail route shows a loading indicator while fetching progress.

The 100-student limit and agent's existing concurrency of four are unchanged. No additional queue service, scheduler, environment variables, migrations, or agent changes are required.

## Execution limits

This is after-response processing within the portal function, with a 300-second route budget subject to the hosting plan's limit ([Next.js after documentation](https://nextjs.org/docs/app/api-reference/functions/after)). It does not automatically resume after a server restart or hard timeout; such an interruption may leave a run active and requires inspection before retrying.
