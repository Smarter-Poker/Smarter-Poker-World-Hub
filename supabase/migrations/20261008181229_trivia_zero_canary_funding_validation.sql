-- TIER: 3
-- AUTHOR: Codex, authorized Trivia programme qualification
-- AFFECTS: public.trivia_competitive_tournament_canary_ready_v1(uuid,integer,boolean)
-- IRREVERSIBLE: no
-- WHY: Original zero-fee admission and its immutable entrant constraint require
-- funding_source=none. The qualification predicate incorrectly required
-- player_wallet even for zero-fee canaries, making genuine free-entry evidence
-- impossible. The PG17 regression fails against the installed predecessor.
-- HOW: Match funding to the explicit paid classification; reject NULL. Preserve
-- named-wallet/time binding, entered-human requirement, exact horse target,
-- terminal settlement, paid prize/journal and reconciliation checks. No entrant,
-- wallet, journal, certificate, flag, scheduler or privilege changes.
BEGIN;
DO $preflight$
BEGIN
 IF md5(pg_catalog.pg_get_functiondef('public.trivia_competitive_tournament_canary_ready_v1(uuid,integer,boolean)'::regprocedure)) <> '8735454d414ecd263951bb6b867a9a48' THEN
  RAISE EXCEPTION 'canary funding predecessor changed; requalify before installation';
 END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='trivia_competitive_tournament_canary_ready_v1') <> 1 THEN
  RAISE EXCEPTION 'ambiguous canary validator overload';
 END IF;
END
$preflight$;
CREATE OR REPLACE FUNCTION public.trivia_competitive_tournament_canary_ready_v1(
    p_tournament_id uuid,
    p_expected_target integer,
    p_paid boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_t public.trivia_tournaments%ROWTYPE;
    v_horses integer;
    v_humans integer;
BEGIN
    SELECT * INTO v_t FROM public.trivia_tournaments t WHERE t.id = p_tournament_id;
    IF p_paid IS NULL
       OR v_t.id IS NULL
       OR v_t.engine_version IS NULL
       OR v_t.schedule_kind NOT IN ('canary', 'test')
       OR v_t.lifecycle_state <> 'settled'
       OR (p_expected_target IS NOT NULL AND v_t.horse_target <> p_expected_target)
       OR (p_paid AND v_t.entry_fee <= 0)
       OR (NOT p_paid AND v_t.entry_fee <> 0) THEN
        RETURN false;
    END IF;
    SELECT count(*) FILTER (WHERE e.participant_kind = 'horse')::integer
      INTO v_horses
      FROM public.trivia_tournament_entrants e
     WHERE e.tournament_id = v_t.id AND e.entry_state = 'entered';
    SELECT count(*)::integer
      INTO v_humans
      FROM public.trivia_tournament_entrants e
     WHERE e.tournament_id = v_t.id
       AND e.participant_kind = 'human'
       AND e.entry_state = 'entered'
       AND e.funding_source = CASE WHEN p_paid THEN 'player_wallet' ELSE 'none' END
       AND length(btrim(e.display_name)) BETWEEN 1 AND 80
       AND public.trivia_competitive_test_wallet_active_at_v1(
               e.participant_id, e.entered_at);
    IF v_horses <> v_t.horse_target
       OR (p_expected_target IS NOT NULL AND v_horses <> p_expected_target)
       OR v_humans < 1
       OR EXISTS (
            SELECT 1 FROM public.trivia_tournament_entrants e
             WHERE e.tournament_id = v_t.id
               AND e.participant_kind = 'human'
               AND e.entry_state = 'entered'
               AND (e.funding_source <> CASE WHEN p_paid THEN 'player_wallet' ELSE 'none' END
                    OR length(btrim(e.display_name)) NOT BETWEEN 1 AND 80
                    OR NOT public.trivia_competitive_test_wallet_active_at_v1(
                           e.participant_id, e.entered_at))) THEN
        RETURN false;
    END IF;
    IF NOT public.trivia_competitive_settlement_ready_v1('tournament', v_t.id, p_paid) THEN
        RETURN false;
    END IF;
    IF p_paid AND NOT EXISTS (
        SELECT 1
          FROM public.trivia_settlements s
          JOIN public.trivia_ledger_journals j
            ON j.id = s.settlement_journal_id AND j.settlement_id = s.id
          JOIN public.trivia_ledger_recon_settlement r ON r.settlement_id = s.id
         WHERE s.subject_type = 'tournament'
           AND s.subject_id = v_t.id
           AND s.state = 'settled'
           AND s.outcome = 'prizes'
           AND s.terminal_at IS NOT NULL
           AND s.gross_pool > 0
           AND j.operation = 'settlement'
           AND j.subject_type = 'tournament'
           AND j.subject_id = v_t.id
           AND j.total_debit = j.total_credit
           AND j.line_count = (
                SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id)
           AND (SELECT COALESCE(sum(l.amount), 0)
                  FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 0
           AND NOT EXISTS (
                SELECT 1 FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_kind = 'player_wallet'
                   AND (l.reconciliation_state <> 'linked'
                        OR l.wallet_reference IS NULL
                        OR l.diamond_transaction_id IS NULL))
           AND r.terminal
           AND NOT r.nonzero_terminal_escrow
           AND r.unexplained_variance = 0
           AND EXISTS (
                SELECT 1 FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.funding_source = 'treasury')) THEN
        RETURN false;
    END IF;
    RETURN true;
END
$$;

DO $postflight$
DECLARE v_src text;
BEGIN
 SELECT p.prosrc INTO v_src FROM pg_catalog.pg_proc p WHERE p.oid='public.trivia_competitive_tournament_canary_ready_v1(uuid,integer,boolean)'::regprocedure;
 IF pg_catalog.regexp_count(v_src, 'CASE WHEN p_paid THEN ''player_wallet'' ELSE ''none'' END') <> 2
    OR pg_catalog.strpos(v_src, 'IF p_paid IS NULL') = 0
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid='public.trivia_competitive_tournament_canary_ready_v1(uuid,integer,boolean)'::regprocedure AND p.prosecdef AND p.proowner='postgres'::regrole AND p.proconfig=ARRAY['search_path=""'] AND p.proacl=ARRAY['postgres=X/postgres']::aclitem[]) THEN
  RAISE EXCEPTION 'canary funding implementation or original security changed';
 END IF;
END
$postflight$;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- FORWARD ROLLBACK: paste as a NEW migration; does not rewrite evidence or money.
/*
BEGIN;
CREATE OR REPLACE FUNCTION public.trivia_competitive_tournament_canary_ready_v1(
    p_tournament_id uuid,
    p_expected_target integer,
    p_paid boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_t public.trivia_tournaments%ROWTYPE;
    v_horses integer;
    v_humans integer;
BEGIN
    SELECT * INTO v_t FROM public.trivia_tournaments t WHERE t.id = p_tournament_id;
    IF v_t.id IS NULL
       OR v_t.engine_version IS NULL
       OR v_t.schedule_kind NOT IN ('canary', 'test')
       OR v_t.lifecycle_state <> 'settled'
       OR (p_expected_target IS NOT NULL AND v_t.horse_target <> p_expected_target)
       OR (p_paid AND v_t.entry_fee <= 0)
       OR (NOT p_paid AND v_t.entry_fee <> 0) THEN
        RETURN false;
    END IF;
    SELECT count(*) FILTER (WHERE e.participant_kind = 'horse')::integer
      INTO v_horses
      FROM public.trivia_tournament_entrants e
     WHERE e.tournament_id = v_t.id AND e.entry_state = 'entered';
    SELECT count(*)::integer
      INTO v_humans
      FROM public.trivia_tournament_entrants e
     WHERE e.tournament_id = v_t.id
       AND e.participant_kind = 'human'
       AND e.entry_state = 'entered'
       AND e.funding_source = 'player_wallet'
       AND length(btrim(e.display_name)) BETWEEN 1 AND 80
       AND public.trivia_competitive_test_wallet_active_at_v1(
               e.participant_id, e.entered_at);
    IF v_horses <> v_t.horse_target
       OR (p_expected_target IS NOT NULL AND v_horses <> p_expected_target)
       OR v_humans < 1
       OR EXISTS (
            SELECT 1 FROM public.trivia_tournament_entrants e
             WHERE e.tournament_id = v_t.id
               AND e.participant_kind = 'human'
               AND e.entry_state = 'entered'
               AND (e.funding_source <> 'player_wallet'
                    OR length(btrim(e.display_name)) NOT BETWEEN 1 AND 80
                    OR NOT public.trivia_competitive_test_wallet_active_at_v1(
                           e.participant_id, e.entered_at))) THEN
        RETURN false;
    END IF;
    IF NOT public.trivia_competitive_settlement_ready_v1('tournament', v_t.id, p_paid) THEN
        RETURN false;
    END IF;
    IF p_paid AND NOT EXISTS (
        SELECT 1
          FROM public.trivia_settlements s
          JOIN public.trivia_ledger_journals j
            ON j.id = s.settlement_journal_id AND j.settlement_id = s.id
          JOIN public.trivia_ledger_recon_settlement r ON r.settlement_id = s.id
         WHERE s.subject_type = 'tournament'
           AND s.subject_id = v_t.id
           AND s.state = 'settled'
           AND s.outcome = 'prizes'
           AND s.terminal_at IS NOT NULL
           AND s.gross_pool > 0
           AND j.operation = 'settlement'
           AND j.subject_type = 'tournament'
           AND j.subject_id = v_t.id
           AND j.total_debit = j.total_credit
           AND j.line_count = (
                SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id)
           AND (SELECT COALESCE(sum(l.amount), 0)
                  FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 0
           AND NOT EXISTS (
                SELECT 1 FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_kind = 'player_wallet'
                   AND (l.reconciliation_state <> 'linked'
                        OR l.wallet_reference IS NULL
                        OR l.diamond_transaction_id IS NULL))
           AND r.terminal
           AND NOT r.nonzero_terminal_escrow
           AND r.unexplained_variance = 0
           AND EXISTS (
                SELECT 1 FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.funding_source = 'treasury')) THEN
        RETURN false;
    END IF;
    RETURN true;
END
$$;
COMMIT;
*/
