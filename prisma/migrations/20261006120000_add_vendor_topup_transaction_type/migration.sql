-- Enum additions for refunds, vendor overdraft, vendor top-ups and threshold
-- payouts (docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md §6.1, §6.2 B10).
--
-- Postgres cannot use a newly added enum value later in the same transaction,
-- so these values are added on their own, before the migration that
-- references VENDOR_TOPUP in CHECK constraints and trigger functions.

ALTER TYPE "WalletTransactionType" ADD VALUE 'VENDOR_TOPUP';

ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_WALLET_SETTINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_PAYMENT_SUSPENDED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_PAYMENT_REINSTATED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_WALLET_TOPUP_COMPLETED';
