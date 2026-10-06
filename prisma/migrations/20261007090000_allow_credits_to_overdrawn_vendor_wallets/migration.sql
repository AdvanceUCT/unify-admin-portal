-- Credits to an overdrawn vendor wallet must always post (spec O5: new sales pay
-- the deficit down; T5: a confirmed top-up is always credited). The previous
-- definition only let a vendor balance end below zero for REFUND/PAYOUT, so a
-- SPEND or a partial VENDOR_TOPUP that reduced, but did not clear, a deficit was
-- rejected. A credit can never make a balance worse, so it is always allowed.
-- Copied from 20261006121000_refunds_overdraft_threshold_payouts; only the
-- `signed_amount >= 0` condition is new. `negativeSince` is unchanged while the
-- balance stays negative, so a partial pay-down does not reset the overdraft clock.
CREATE OR REPLACE FUNCTION apply_ledger_entry_to_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_status "WalletTransactionStatus";
  transaction_currency TEXT;
  transaction_type "WalletTransactionType";
  account_type "WalletAccountType";
  account_status "WalletAccountStatus";
  account_currency TEXT;
  signed_amount BIGINT;
  updated_rows INTEGER;
BEGIN
  SELECT "status", "currency", "type"
  INTO transaction_status, transaction_currency, transaction_type
  FROM "wallet_transaction"
  WHERE "id" = NEW."walletTransactionId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet transaction % does not exist', NEW."walletTransactionId";
  END IF;

  IF transaction_status <> 'PENDING' THEN
    RAISE EXCEPTION 'Ledger entries may only be attached to a pending transaction';
  END IF;

  SELECT "type", "status", "currency"
  INTO account_type, account_status, account_currency
  FROM "wallet_account"
  WHERE "id" = NEW."accountId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet account % does not exist', NEW."accountId";
  END IF;

  IF account_status = 'CLOSED' THEN
    RAISE EXCEPTION 'Closed wallet accounts cannot receive ledger entries';
  END IF;

  IF NEW."currency" <> transaction_currency OR NEW."currency" <> account_currency THEN
    RAISE EXCEPTION 'Ledger entry currency must match transaction and account currency';
  END IF;

  signed_amount := CASE
    WHEN NEW."direction" = 'CREDIT' THEN NEW."amountMinor"
    ELSE -NEW."amountMinor"
  END;

  PERFORM set_config('unify.wallet_projection_write', 'on', true);
  BEGIN
    UPDATE "wallet_account_balance" AS balance
    SET
      "postedBalanceMinor" = balance."postedBalanceMinor" + signed_amount,
      "negativeSince" = CASE
        WHEN account_type = 'VENDOR' AND balance."postedBalanceMinor" + signed_amount < 0
          THEN COALESCE(balance."negativeSince", clock_timestamp())
        ELSE NULL
      END,
      "version" = balance."version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE balance."accountId" = NEW."accountId"
      AND (
        account_type = 'SYSTEM'
        OR signed_amount >= 0
        OR balance."postedBalanceMinor" + signed_amount >= 0
        OR (account_type = 'VENDOR' AND transaction_type IN ('REFUND', 'PAYOUT'))
      );

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('unify.wallet_projection_write', 'off', true);
    RAISE;
  END;
  PERFORM set_config('unify.wallet_projection_write', 'off', true);

  IF updated_rows <> 1 THEN
    RAISE EXCEPTION 'Insufficient wallet balance or missing balance projection for account %', NEW."accountId";
  END IF;

  RETURN NEW;
END;
$$;
