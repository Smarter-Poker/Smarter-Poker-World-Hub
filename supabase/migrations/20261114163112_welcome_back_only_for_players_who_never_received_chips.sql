-- 20261114163112_welcome_back_only_for_players_who_never_received_chips
--
-- TIER 2: one new read-only helper and a guarded patch of the welcome-back
-- run. No wallet, ledger or award row is written by this migration.
--
-- OWNER RULE, 2026-11-14 10:19 Central, verbatim:
--   "Welcome Back Chips PROMO IS ONLY FOR USERS THAT HAVE NEVER RECEIVED ANY
--    CHIPS, THAT USER HAD ALREADY RECEIVED CHIPS IN THERE ACCOUNT, AND SHOULD
--    NOT RECEIVE DUPLICATE CHIPS. THIS WAS DESIGNED FOR PLAYERS WHO SIGNED UP,
--    BUT NEVER RECEIVED ANY CHIPS OR PLAYED A HAND. IT MUST CHECK IF A PLAYER
--    RECEIVED ANY CHIPS, DO NOT SEND, IF IT EVER RECEIVED A PROMO
--    PREVIOUSLY... DO NOT SEND."
--
-- WHY: fn_sp_signup_welcome_back_run (Club Arena migration 20261104145956,
-- hardened 20261104184347 / 20261107130207) only asked whether a sign-up had
-- played a hand. MeepMeep signed up 2026-11-12 19:10 Central, was sent 50
-- chips from twin2983's promo wallet at 23:02, never sat down, and was paid
-- the 25 welcome-back chips at 2026-11-13 19:17 Central (chip_transactions
-- 07ddbdc4-701f-47cb-9fd4-7d89b9c62a91). Three more sign-ups who already hold
-- agent promo chips (Kewski, CesarOrtiz05, NaughtyNoah) were due to be paid
-- the same way on 2026-11-14.
--
-- WHAT CHANGES:
--   1. fn_sp_player_has_received_chips(user): true when ANY chip credit ever
--      reached the player - any chip_transactions row addressed to them
--      (cashier send, agent/club/union promo, transfer, ticket, prize,
--      disbursement, any type) or any chip_ledger credit to their player
--      wallet. Clawed-back or reversed credits still count: "if it ever
--      received". Diamonds and the daily Free Buy tickets every account gets
--      are not chips and are not counted.
--   2. The run never selects a player for whom (1) is true.
--   3. A 'no_club' or 'failed' row whose player has since received chips is
--      closed with "Already Received Chips Before Welcome Back", so it is not
--      retried, nudged to join a club, or reported as unpaid.
--   4. The run reports how many rows (3) closed.
--   Everything else in the run is byte-for-byte the installed body: the
--   function is patched from pg_get_functiondef and the migration aborts if
--   any expected predecessor text is missing.
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_sp_player_has_received_chips(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.chip_transactions ct
                  WHERE ct.to_user_id = p_user_id AND ct.amount > 0)
      OR EXISTS (SELECT 1 FROM public.chip_ledger l
                  WHERE l.to_entity_id = p_user_id AND l.to_type = 'player_wallet' AND l.amount > 0);
$function$;

REVOKE ALL ON FUNCTION public.fn_sp_player_has_received_chips(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_player_has_received_chips(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_sp_player_has_received_chips(uuid) IS
  'True when any chip credit ever reached the player (any chip_transactions row to them, any chip_ledger player_wallet credit). Welcome Back Chips is only for players for whom this is false (Dan, 2026-11-14).';

DO $patch$
DECLARE
  original text;
  updated text;
  step text;
BEGIN
  original := pg_get_functiondef('public.fn_sp_signup_welcome_back_run(integer, date)'::regprocedure);
  updated := original;

  -- (a) a counter for rows closed because chips already landed
  step := replace(updated,
    $o$v_scanned int := 0; v_closed int := 0;$o$,
    $n$v_scanned int := 0; v_closed int := 0; v_closed_chips int := 0;$n$);
  IF step = updated THEN RAISE EXCEPTION 'welcome-back predecessor changed: counter declaration not found'; END IF;
  updated := step;

  -- (b) close parked rows whose player has since received chips
  step := replace(updated,
    $o$  GET DIAGNOSTICS v_closed = ROW_COUNT;
$o$,
    $n$  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Welcome Back Chips is only for a player who has never received a chip
  -- (Dan, 2026-11-14). A parked row whose player has since been sent chips by
  -- anyone is closed: not retried, not nudged, not reported as unpaid.
  UPDATE public.sp_signup_welcome_back_awards a
     SET status = 'closed', last_error = 'Already Received Chips Before Welcome Back', updated_at = now()
   WHERE a.status IN ('no_club', 'failed') AND public.fn_sp_player_has_received_chips(a.user_id);
  GET DIAGNOSTICS v_closed_chips = ROW_COUNT;
  v_closed := v_closed + v_closed_chips;
$n$);
  IF step = updated THEN RAISE EXCEPTION 'welcome-back predecessor changed: close step not found'; END IF;
  updated := step;

  -- (c) never select a player who has ever received chips
  step := replace(updated,
    $o$AND NOT public.fn_sp_player_has_played(h.id)$o$,
    $n$AND NOT public.fn_sp_player_has_played(h.id)
       -- Never received a chip from anyone, ever (Dan, 2026-11-14).
       AND NOT public.fn_sp_player_has_received_chips(h.id)$n$);
  IF step = updated THEN RAISE EXCEPTION 'welcome-back predecessor changed: candidate filter not found'; END IF;
  IF (length(step) - length(updated)) <> length($n$
       -- Never received a chip from anyone, ever (Dan, 2026-11-14).
       AND NOT public.fn_sp_player_has_received_chips(h.id)$n$) THEN
    RAISE EXCEPTION 'welcome-back candidate filter matched more than once';
  END IF;
  updated := step;

  -- (d) report it
  step := replace(updated,
    $o$'closed_count', v_closed,$o$,
    $n$'closed_count', v_closed, 'closed_received_chips_count', v_closed_chips,$n$);
  IF step = updated THEN RAISE EXCEPTION 'welcome-back predecessor changed: result field not found'; END IF;
  updated := step;

  EXECUTE updated;
END $patch$;

-- POST-APPLY ASSERTIONS
DO $verify$
DECLARE
  src text := pg_get_functiondef('public.fn_sp_signup_welcome_back_run(integer, date)'::regprocedure);
BEGIN
  IF position('fn_sp_player_has_received_chips(h.id)' IN src) = 0 THEN
    RAISE EXCEPTION 'run does not filter on received chips';
  END IF;
  IF position('Already Received Chips Before Welcome Back' IN src) = 0 THEN
    RAISE EXCEPTION 'run does not close parked rows that received chips';
  END IF;
  IF has_function_privilege('anon', 'public.fn_sp_signup_welcome_back_run(integer, date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_sp_signup_welcome_back_run(integer, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_sp_player_has_received_chips(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_sp_player_has_received_chips(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a welcome-back function lost its service-only ACL';
  END IF;
  -- MeepMeep held twin2983's 50 promo chips before the award: must read true.
  IF NOT public.fn_sp_player_has_received_chips('3752e8b6-d7d4-4fc2-a68f-15c634b7d02e') THEN
    RAISE EXCEPTION 'helper misses MeepMeep''s promo credit';
  END IF;
END $verify$;

COMMIT;

-- ROLLBACK (re-applies the predecessor behaviour; run as a new migration):
-- re-run the CREATE OR REPLACE body of fn_sp_signup_welcome_back_run from
-- Club Arena migration 20261107130207, then
-- DROP FUNCTION public.fn_sp_player_has_received_chips(uuid);
