-- Phase 6 (scheduling, reconciliation, operational controls): at most one
-- RUNNING billing_run row per jobType at a time. This is the real
-- concurrency guard for overlapping cron/CLI/admin invocations of the same
-- job — application code still checks leaseExpiresAt to decide whether a
-- stale RUNNING row can be taken over, but two truly concurrent attempts to
-- start the same job race this index, not a race condition in JS.
CREATE UNIQUE INDEX "billing_run_one_running_per_job_type" ON "billing_run"("jobType") WHERE ("status" = 'RUNNING');
