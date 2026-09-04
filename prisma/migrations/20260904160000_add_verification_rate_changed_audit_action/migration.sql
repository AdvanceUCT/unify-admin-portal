-- AlterEnum (additive only — safe regardless of existing rows)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VERIFICATION_RATE_CHANGED';
