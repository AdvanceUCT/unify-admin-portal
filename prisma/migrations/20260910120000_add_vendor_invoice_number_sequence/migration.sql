-- A dedicated sequence gives invoice numbers real database-level atomicity
-- under concurrent issuance. Prisma has no native "sequence" concept, so
-- this is plain SQL with no corresponding schema.prisma model change;
-- application code calls nextval('vendor_invoice_number_seq') directly.
-- Never derive an invoice number from MAX(existing) + 1 — that is not
-- concurrency-safe.
CREATE SEQUENCE IF NOT EXISTS "vendor_invoice_number_seq" START 1;
