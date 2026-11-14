-- 20261114171206_welcome_back_refused_at_the_ledger_write
--
-- TIER 2: one BEFORE INSERT guard on chip_transactions. No wallet, ledger or
-- award row is written by this migration. Kept in its own short transaction
-- because CREATE TRIGGER holds a write-blocking lock on chip_transactions;
-- lock_timeout makes it give up rather than queue buy-ins behind it.
--
-- OWNER RULE, 2026-11-14 10:19 Central: Welcome Back Chips is only for a
-- player who has never received any chips ("IF IT EVER RECEIVED A PROMO
-- PREVIOUSLY... DO NOT SEND"). Asked at 11:04 Central: "how do we insure users
-- never get promo chips they aren't supposed to."
--
-- Migration 20261114163112 put the rule in fn_sp_signup_welcome_back_run's
-- candidate selection, which protects the hourly run only. This guard
-- enforces it at the write itself: any chip_transactions insert carrying the
-- Welcome Back program's op_id (md5('signup-welcome-back:' || player), the
-- run's per-player key) is refused when the player has any other chip credit.
-- The raise happens inside fn_promo_disburse, so the wallet debit and credit
-- roll back with it and a refused payment moves nothing, whoever calls the
-- door: the hourly run, a manual replay, or a future job reusing the program.
-- The payment's own chip_ledger leg is written earlier in the same
-- transaction with created_at = now(); "created_at <> now()" excludes it and
-- still sees a credit committed by any other transaction, earlier or during a
-- long run.
--
-- Proved on production in rolled-back transactions before install: a Welcome
-- Back payment to Kewski (sent 50 promo chips by ChiToWnBaLLn) was refused
-- with "Welcome Back Chips Refused: Player Already Received Chips"; an
-- unrelated union promo to the same player still succeeded.
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_ca_refuse_welcome_back_to_funded_player()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.metadata ->> 'op_id' = md5('signup-welcome-back:' || NEW.to_user_id::text)::uuid::text
     AND (EXISTS (SELECT 1 FROM public.chip_transactions ct
                   WHERE ct.to_user_id = NEW.to_user_id AND ct.amount > 0 AND ct.created_at <> now())
          OR EXISTS (SELECT 1 FROM public.chip_ledger l
                      WHERE l.to_entity_id = NEW.to_user_id AND l.to_type = 'player_wallet'
                        AND l.amount > 0 AND l.created_at <> now())) THEN
    RAISE EXCEPTION 'Welcome Back Chips Refused: Player Already Received Chips'
      USING ERRCODE = '23514', DETAIL = format('player %s', NEW.to_user_id);
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_ca_refuse_welcome_back_to_funded_player() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_ca_refuse_welcome_back_to_funded_player() IS
  'Refuses a Welcome Back Chips payment (op md5(signup-welcome-back:player)) to a player with any other chip credit (Dan, 2026-11-14).';

CREATE TRIGGER zz_welcome_back_never_funded_guard
  BEFORE INSERT ON public.chip_transactions
  FOR EACH ROW
  WHEN (NEW.transaction_type = 'promo_disbursement' AND NEW.to_user_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_ca_refuse_welcome_back_to_funded_player();

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.chip_transactions'::regclass
                  AND tgname = 'zz_welcome_back_never_funded_guard' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'welcome-back guard trigger is not installed and enabled';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ca_refuse_welcome_back_to_funded_player()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ca_refuse_welcome_back_to_funded_player()', 'EXECUTE') THEN
    RAISE EXCEPTION 'guard function is executable by a client role';
  END IF;
END $verify$;

COMMIT;
