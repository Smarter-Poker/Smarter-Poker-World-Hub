-- ═══════════════════════════════════════════════════════════════════════
-- 20261124041500_trivia_pvp_horse_ready_subsidy_fix.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      Antigravity, authorized Trivia Phase 12 cutover
-- AFFECTS:     public.trivia_competitive_pvp_paid_ready_v1(uuid)
-- IRREVERSIBLE: no
--
-- WHY:
--   Phase 2's authoritative trivia_ledger_subsidy() adds a horse entry's
--   amount to BOTH trivia_settlements.held_total AND trivia_settlements.subsidy_total
--   (20260930043221_trivia_p2_ledger_foundation.sql). For a 10-Diamond
--   human_horse PvP match (such as production canary
--   91fe9b26-a0ad-40c0-ae8a-c8cece9c3482), gross_pool=20, held_total=20,
--   and subsidy_total=10. trivia_competitive_pvp_paid_ready_v1() erroneously
--   checked `s.held_total + s.subsidy_total = s.gross_pool` (20 + 10 = 30 != 20),
--   double-counting the horse subsidy and making every real Phase 2 human_horse
--   PvP canary fail the pvp_horses cutover certificate guard.
--
-- HOW:
--   Replace the double-counting sum with the exact Phase 2 invariant:
--   `s.held_total = s.gross_pool` and
--   `s.subsidy_total = CASE WHEN m.match_kind = 'human_horse' THEN m.stake_amount ELSE 0 END`.
--   Preserve all decision, named-wallet, escrow, journal, participant, and
--   reconciliation predicates, as well as owner/SECURITY DEFINER/search_path/ACL.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
BEGIN
    IF md5(pg_catalog.pg_get_functiondef(
           'public.trivia_competitive_pvp_paid_ready_v1(uuid)'::regprocedure))
       <> '34cf6358080e6cea095fd079057281c0' THEN
        RAISE EXCEPTION 'pvp_paid_ready predecessor changed; requalify before installation';
    END IF;
    IF (SELECT count(*)
          FROM pg_catalog.pg_proc p
          JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'trivia_competitive_pvp_paid_ready_v1') <> 1 THEN
        RAISE EXCEPTION 'ambiguous trivia_competitive_pvp_paid_ready_v1 overload';
    END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.trivia_competitive_pvp_paid_ready_v1(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_pvp_matches m
          JOIN public.trivia_pvp_settlement_decisions d ON d.match_id = m.id
          JOIN public.trivia_settlements s
            ON s.subject_type = 'pvp_match' AND s.subject_id = m.id
          JOIN public.trivia_ledger_accounts a
            ON a.account_code = s.escrow_account_code
          JOIN public.trivia_ledger_journals j
            ON j.id = s.settlement_journal_id AND j.settlement_id = s.id
          JOIN public.trivia_ledger_recon_settlement r ON r.settlement_id = s.id
         WHERE m.id = p_match_id
           AND m.engine_version = 'pvp-v2'
           AND m.match_kind IN ('human_human', 'human_horse')
           AND m.status IN ('complete', 'completed')
           AND m.completed_at IS NOT NULL
           AND m.stake_amount > 0
           AND m.settlement_kind = 'win'
           AND d.decision_kind = 'win'
           AND d.winner_id = m.winner_id
           AND d.decided_at <= m.completed_at
           AND public.trivia_competitive_test_wallet_active_at_v1(
                   m.player1_id, m.created_at)
           AND (m.match_kind = 'human_horse'
                OR public.trivia_competitive_test_wallet_active_at_v1(
                       m.player2_id, m.created_at))
           AND s.state = 'settled'
           AND s.outcome IN ('win', 'forfeit')
           AND s.terminal_at IS NOT NULL
           AND s.gross_pool = m.stake_amount * 2
           AND s.held_total = s.gross_pool
           AND s.subsidy_total = CASE WHEN m.match_kind = 'human_horse' THEN m.stake_amount ELSE 0 END
           AND s.released_total = 0
           AND s.refunded_total = 0
           AND s.paid_total > 0
           AND s.rake_amount > 0
           AND s.paid_total + s.rake_amount = s.gross_pool
           AND s.final_prize_pool = s.paid_total
           AND a.kind = 'pvp_escrow'
           AND a.subject_id = m.id
           AND a.balance = 0
           AND a.state = 'closed'
           AND r.terminal
           AND NOT r.nonzero_terminal_escrow
           AND r.unexplained_variance = 0
           AND j.operation = 'settlement'
           AND j.subject_type = 'pvp_match'
           AND j.subject_id = m.id
           AND j.line_count = 3
           AND j.total_debit = s.gross_pool
           AND j.total_credit = s.gross_pool
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = 2
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.participant_kind = 'human'
                   AND p.funding_source = 'player_wallet') =
               CASE WHEN m.match_kind = 'human_human' THEN 2 ELSE 1 END
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.participant_kind = 'horse'
                   AND p.funding_source = 'treasury') =
               CASE WHEN m.match_kind = 'human_horse' THEN 1 ELSE 0 END
           AND NOT EXISTS (
                SELECT 1 FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND (p.state <> 'settled'
                        OR p.exit_journal_id IS DISTINCT FROM j.id
                        OR p.entry_amount <> m.stake_amount
                        OR (p.participant_kind = 'human'
                            AND (p.funding_source <> 'player_wallet'
                                 OR NOT public.trivia_competitive_test_wallet_active_at_v1(
                                            p.user_id, m.created_at)))))
           AND (SELECT COALESCE(sum(p.payout_amount), 0)
                  FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = s.paid_total
           AND (SELECT COALESCE(sum(p.rake_share), 0)
                  FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = s.rake_amount
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 3
           AND (SELECT COALESCE(sum(l.amount), 0) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 0
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_code = s.escrow_account_code
                   AND l.account_kind = 'pvp_escrow'
                   AND l.amount = -s.gross_pool
                   AND l.reconciliation_state = 'internal') = 1
           AND EXISTS (
                SELECT 1
                  FROM public.trivia_settlement_participants winner
                 WHERE winner.settlement_id = s.id
                   AND winner.user_id = d.winner_id
                   AND winner.state = 'settled'
                   AND winner.payout_amount = s.paid_total
                   AND (
                       (winner.participant_kind = 'human'
                        AND winner.funding_source = 'player_wallet'
                        AND public.trivia_competitive_test_wallet_active_at_v1(
                                winner.user_id, m.created_at)
                        AND (SELECT count(*) FROM public.trivia_ledger_lines l
                              WHERE l.journal_id = j.id
                                AND l.account_kind = 'player_wallet'
                                AND l.user_id = winner.user_id
                                AND l.amount = s.paid_total
                                AND l.wallet_kind = 'pvp_win'
                                AND l.wallet_reference IS NOT NULL
                                AND l.diamond_transaction_id IS NOT NULL
                                AND l.reconciliation_state = 'linked') = 1)
                       OR
                       (m.match_kind = 'human_horse'
                        AND winner.participant_kind = 'horse'
                        AND winner.funding_source = 'treasury'
                        AND (SELECT count(*) FROM public.trivia_ledger_lines l
                              WHERE l.journal_id = j.id
                                AND l.account_code = 'treasury:trivia'
                                AND l.account_kind = 'treasury'
                                AND l.user_id = winner.user_id
                                AND l.participant_kind = 'horse'
                                AND l.amount = s.paid_total
                                AND l.wallet_reference IS NULL
                                AND l.diamond_transaction_id IS NULL
                                AND l.reconciliation_state = 'internal') = 1)
                   ))
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_code = 'house:rake:pvp'
                   AND l.account_kind = 'house_revenue'
                   AND l.amount = s.rake_amount
                   AND l.reconciliation_state = 'internal') = 1
    )
$$;

DO $postflight$
DECLARE
    v_src text;
BEGIN
    SELECT p.prosrc INTO v_src
      FROM pg_catalog.pg_proc p
     WHERE p.oid = 'public.trivia_competitive_pvp_paid_ready_v1(uuid)'::regprocedure;
    IF pg_catalog.strpos(v_src, 's.held_total = s.gross_pool') = 0
       OR pg_catalog.strpos(v_src, 's.subsidy_total = CASE WHEN m.match_kind = ''human_horse'' THEN m.stake_amount ELSE 0 END') = 0
       OR pg_catalog.strpos(v_src, 's.held_total + s.subsidy_total') <> 0
       OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.oid = 'public.trivia_competitive_pvp_paid_ready_v1(uuid)'::regprocedure
               AND p.prosecdef
               AND p.proowner = 'postgres'::regrole
               AND p.proconfig = ARRAY['search_path=""']
               AND p.proacl = ARRAY['postgres=X/postgres']::aclitem[]) THEN
        RAISE EXCEPTION 'pvp_paid_ready implementation or original security changed';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- FORWARD ROLLBACK: paste as a NEW migration; does not rewrite evidence or money.
/*
BEGIN;
CREATE OR REPLACE FUNCTION public.trivia_competitive_pvp_paid_ready_v1(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_pvp_matches m
          JOIN public.trivia_pvp_settlement_decisions d ON d.match_id = m.id
          JOIN public.trivia_settlements s
            ON s.subject_type = 'pvp_match' AND s.subject_id = m.id
          JOIN public.trivia_ledger_accounts a
            ON a.account_code = s.escrow_account_code
          JOIN public.trivia_ledger_journals j
            ON j.id = s.settlement_journal_id AND j.settlement_id = s.id
          JOIN public.trivia_ledger_recon_settlement r ON r.settlement_id = s.id
         WHERE m.id = p_match_id
           AND m.engine_version = 'pvp-v2'
           AND m.match_kind IN ('human_human', 'human_horse')
           AND m.status IN ('complete', 'completed')
           AND m.completed_at IS NOT NULL
           AND m.stake_amount > 0
           AND m.settlement_kind = 'win'
           AND d.decision_kind = 'win'
           AND d.winner_id = m.winner_id
           AND d.decided_at <= m.completed_at
           AND public.trivia_competitive_test_wallet_active_at_v1(
                   m.player1_id, m.created_at)
           AND (m.match_kind = 'human_horse'
                OR public.trivia_competitive_test_wallet_active_at_v1(
                       m.player2_id, m.created_at))
           AND s.state = 'settled'
           AND s.outcome IN ('win', 'forfeit')
           AND s.terminal_at IS NOT NULL
           AND s.gross_pool = m.stake_amount * 2
           AND s.held_total + s.subsidy_total = s.gross_pool
           AND s.released_total = 0
           AND s.refunded_total = 0
           AND s.paid_total > 0
           AND s.rake_amount > 0
           AND s.paid_total + s.rake_amount = s.gross_pool
           AND s.final_prize_pool = s.paid_total
           AND a.kind = 'pvp_escrow'
           AND a.subject_id = m.id
           AND a.balance = 0
           AND a.state = 'closed'
           AND r.terminal
           AND NOT r.nonzero_terminal_escrow
           AND r.unexplained_variance = 0
           AND j.operation = 'settlement'
           AND j.subject_type = 'pvp_match'
           AND j.subject_id = m.id
           AND j.line_count = 3
           AND j.total_debit = s.gross_pool
           AND j.total_credit = s.gross_pool
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = 2
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.participant_kind = 'human'
                   AND p.funding_source = 'player_wallet') =
               CASE WHEN m.match_kind = 'human_human' THEN 2 ELSE 1 END
           AND (SELECT count(*) FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND p.participant_kind = 'horse'
                   AND p.funding_source = 'treasury') =
               CASE WHEN m.match_kind = 'human_horse' THEN 1 ELSE 0 END
           AND NOT EXISTS (
                SELECT 1 FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id
                   AND (p.state <> 'settled'
                        OR p.exit_journal_id IS DISTINCT FROM j.id
                        OR p.entry_amount <> m.stake_amount
                        OR (p.participant_kind = 'human'
                            AND (p.funding_source <> 'player_wallet'
                                 OR NOT public.trivia_competitive_test_wallet_active_at_v1(
                                            p.user_id, m.created_at)))))
           AND (SELECT COALESCE(sum(p.payout_amount), 0)
                  FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = s.paid_total
           AND (SELECT COALESCE(sum(p.rake_share), 0)
                  FROM public.trivia_settlement_participants p
                 WHERE p.settlement_id = s.id) = s.rake_amount
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 3
           AND (SELECT COALESCE(sum(l.amount), 0) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id) = 0
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_code = s.escrow_account_code
                   AND l.account_kind = 'pvp_escrow'
                   AND l.amount = -s.gross_pool
                   AND l.reconciliation_state = 'internal') = 1
           AND EXISTS (
                SELECT 1
                  FROM public.trivia_settlement_participants winner
                 WHERE winner.settlement_id = s.id
                   AND winner.user_id = d.winner_id
                   AND winner.state = 'settled'
                   AND winner.payout_amount = s.paid_total
                   AND (
                       (winner.participant_kind = 'human'
                        AND winner.funding_source = 'player_wallet'
                        AND public.trivia_competitive_test_wallet_active_at_v1(
                                winner.user_id, m.created_at)
                        AND (SELECT count(*) FROM public.trivia_ledger_lines l
                              WHERE l.journal_id = j.id
                                AND l.account_kind = 'player_wallet'
                                AND l.user_id = winner.user_id
                                AND l.amount = s.paid_total
                                AND l.wallet_kind = 'pvp_win'
                                AND l.wallet_reference IS NOT NULL
                                AND l.diamond_transaction_id IS NOT NULL
                                AND l.reconciliation_state = 'linked') = 1)
                       OR
                       (m.match_kind = 'human_horse'
                        AND winner.participant_kind = 'horse'
                        AND winner.funding_source = 'treasury'
                        AND (SELECT count(*) FROM public.trivia_ledger_lines l
                              WHERE l.journal_id = j.id
                                AND l.account_code = 'treasury:trivia'
                                AND l.account_kind = 'treasury'
                                AND l.user_id = winner.user_id
                                AND l.participant_kind = 'horse'
                                AND l.amount = s.paid_total
                                AND l.wallet_reference IS NULL
                                AND l.diamond_transaction_id IS NULL
                                AND l.reconciliation_state = 'internal') = 1)
                   ))
           AND (SELECT count(*) FROM public.trivia_ledger_lines l
                 WHERE l.journal_id = j.id
                   AND l.account_code = 'house:rake:pvp'
                   AND l.account_kind = 'house_revenue'
                   AND l.amount = s.rake_amount
                   AND l.reconciliation_state = 'internal') = 1
    )
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
