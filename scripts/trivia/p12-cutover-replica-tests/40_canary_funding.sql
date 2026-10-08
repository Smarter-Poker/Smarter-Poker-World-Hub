\set ON_ERROR_STOP on
-- Disposable PG17 replica only. Use the funding shape original admission writes.
BEGIN;
UPDATE public.trivia_tournament_entrants SET funding_source = 'none'
 WHERE tournament_id = '92000000-0000-4000-8000-000000000001';
DO $free_entry$
DECLARE
 v_zero constant uuid := '92000000-0000-4000-8000-000000000001';
 v_paid constant uuid := '92000000-0000-4000-8000-000000000002';
BEGIN
 IF NOT public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, false) THEN
  RAISE EXCEPTION 'original zero-entry funding none must qualify with named human and terminal settlement';
 END IF;
 IF public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, NULL) THEN
  RAISE EXCEPTION 'unknown paid classification must fail closed';
 END IF;
 UPDATE public.trivia_tournament_entrants SET funding_source = 'player_wallet' WHERE tournament_id = v_zero;
 IF public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, false) THEN
  RAISE EXCEPTION 'free entry with paid funding mismatch falsely qualified';
 END IF;
 UPDATE public.trivia_tournament_entrants SET funding_source = 'none', entry_state = 'cancelled' WHERE tournament_id = v_zero;
 IF public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, false) THEN
  RAISE EXCEPTION 'zero canary without entered human falsely qualified';
 END IF;
 UPDATE public.trivia_tournament_entrants SET entry_state = 'entered', display_name = ' ' WHERE tournament_id = v_zero;
 IF public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, false) THEN
  RAISE EXCEPTION 'blank named human falsely qualified';
 END IF;
 UPDATE public.trivia_tournament_entrants SET display_name = 'Named Human One', entered_at = pg_catalog.clock_timestamp() - interval '3 hours' WHERE tournament_id = v_zero;
 IF public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, false) THEN
  RAISE EXCEPTION 'wallet authorized after entry falsely qualified';
 END IF;
 UPDATE public.trivia_tournament_entrants SET entered_at = pg_catalog.clock_timestamp() - interval '25 minutes' WHERE tournament_id = v_zero;
 UPDATE public.trivia_ledger_accounts SET balance = 1 WHERE subject_id = v_zero;
 IF public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, false) THEN
  RAISE EXCEPTION 'nonzero terminal escrow falsely qualified';
 END IF;
 UPDATE public.trivia_ledger_accounts SET balance = 0 WHERE subject_id = v_zero;
 UPDATE public.trivia_ledger_recon_settlement SET unexplained_variance = 1 WHERE subject_id = v_zero;
 IF public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, false) THEN
  RAISE EXCEPTION 'zero-canary reconciliation variance falsely qualified';
 END IF;
 UPDATE public.trivia_ledger_recon_settlement SET unexplained_variance = 0 WHERE subject_id = v_zero;
 IF NOT public.trivia_competitive_tournament_canary_ready_v1(v_zero, 0, false)
    OR NOT public.trivia_competitive_tournament_canary_ready_v1(v_paid, 1, true) THEN
  RAISE EXCEPTION 'valid free and paid shapes must qualify';
 END IF;
 UPDATE public.trivia_tournament_entrants SET funding_source = 'none' WHERE tournament_id = v_paid AND participant_kind = 'human' AND entry_state = 'entered';
 IF public.trivia_competitive_tournament_canary_ready_v1(v_paid, 1, true) THEN
  RAISE EXCEPTION 'paid entry without player wallet funding falsely qualified';
 END IF;
 UPDATE public.trivia_tournament_entrants SET funding_source = 'treasury' WHERE tournament_id = v_paid AND participant_kind = 'human' AND entry_state = 'entered';
 IF public.trivia_competitive_tournament_canary_ready_v1(v_paid, 1, true) THEN
  RAISE EXCEPTION 'human paid treasury funding falsely qualified';
 END IF;
END
$free_entry$;
ROLLBACK;
SELECT 'p12 zero/paid canary funding boundaries PASS' AS result;
