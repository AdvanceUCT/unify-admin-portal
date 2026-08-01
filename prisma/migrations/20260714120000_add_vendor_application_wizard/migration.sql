-- Step A: Add DRAFT to enum (must commit before any reference to 'DRAFT')
ALTER TYPE "VendorApplicationStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'PENDING';
