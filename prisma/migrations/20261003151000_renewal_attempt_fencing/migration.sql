ALTER TABLE credential_validity_policy ADD COLUMN version SERIAL NOT NULL;
CREATE UNIQUE INDEX credential_validity_policy_version_key ON credential_validity_policy(version);
ALTER TABLE credential_renewal_record ADD COLUMN "activeAttemptId" TEXT;
ALTER TABLE credential_offer_attempt ADD COLUMN automatic BOOLEAN NOT NULL DEFAULT false;
