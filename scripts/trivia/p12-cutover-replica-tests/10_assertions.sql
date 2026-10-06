\set ON_ERROR_STOP on

CREATE SCHEMA p12test;

CREATE FUNCTION p12test.add_paid_pvp(
    p_match_id uuid,
    p_human_id uuid,
    p_opponent_id uuid,
    p_match_kind text,
    p_winner_id uuid,
    p_created_at timestamptz)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_settlement uuid := pg_catalog.gen_random_uuid();
    v_journal uuid := pg_catalog.gen_random_uuid();
    v_escrow text := 'escrow:pvp:' || p_match_id::text;
    v_opponent_kind text :=
        CASE WHEN p_match_kind = 'human_horse' THEN 'horse' ELSE 'human' END;
    v_opponent_funding text :=
        CASE WHEN p_match_kind = 'human_horse' THEN 'treasury' ELSE 'player_wallet' END;
    v_winner_kind text :=
        CASE WHEN p_match_kind = 'human_horse' AND p_winner_id = p_opponent_id
             THEN 'horse' ELSE 'human' END;
BEGIN
    INSERT INTO public.trivia_pvp_matches (
        id, player1_id, player2_id, engine_version, match_kind, status,
        stake_amount, settlement_kind, winner_id, created_at, completed_at,
        deadline_at)
    VALUES (
        p_match_id, p_human_id, p_opponent_id, 'pvp-v2', p_match_kind,
        'completed', 10, 'win', p_winner_id, p_created_at,
        p_created_at + interval '3 minutes', p_created_at + interval '30 minutes');

    INSERT INTO public.trivia_pvp_settlement_decisions (
        match_id, decision_kind, winner_id, decided_at)
    VALUES (p_match_id, 'win', p_winner_id, p_created_at + interval '2 minutes');

    INSERT INTO public.trivia_ledger_accounts (
        account_code, kind, state, balance, min_balance, subject_id)
    VALUES (v_escrow, 'pvp_escrow', 'closed', 0, 0, p_match_id);

    INSERT INTO public.trivia_ledger_journals (
        id, settlement_id, operation, subject_type, subject_id,
        line_count, total_debit, total_credit)
    VALUES (v_journal, v_settlement, 'settlement', 'pvp_match', p_match_id,
            3, 20, 20);

    INSERT INTO public.trivia_settlements (
        id, subject_type, subject_id, escrow_account_code, state, outcome,
        terminal_at, settlement_journal_id, gross_pool, held_total,
        subsidy_total, released_total, refunded_total, paid_total,
        rake_amount, final_prize_pool)
    VALUES (v_settlement, 'pvp_match', p_match_id, v_escrow, 'settled', 'win',
            p_created_at + interval '3 minutes', v_journal, 20, 20,
            0, 0, 0, 18, 2, 18);

    INSERT INTO public.trivia_settlement_participants (
        settlement_id, user_id, participant_kind, funding_source,
        entry_amount, state, rake_share, payout_amount, exit_journal_id)
    VALUES
        (v_settlement, p_human_id, 'human', 'player_wallet', 10, 'settled',
         1, CASE WHEN p_winner_id = p_human_id THEN 18 ELSE 0 END, v_journal),
        (v_settlement, p_opponent_id, v_opponent_kind, v_opponent_funding, 10,
         'settled', 1, CASE WHEN p_winner_id = p_opponent_id THEN 18 ELSE 0 END,
         v_journal);

    INSERT INTO public.trivia_ledger_lines (
        journal_id, account_code, account_kind, amount, user_id,
        participant_kind, wallet_reference, wallet_kind,
        diamond_transaction_id, reconciliation_state)
    VALUES
        (v_journal, v_escrow, 'pvp_escrow', -20, NULL, NULL, NULL, NULL,
         NULL, 'internal'),
        (v_journal,
         CASE WHEN v_winner_kind = 'horse'
              THEN 'treasury:trivia' ELSE 'wallet:' || p_winner_id::text END,
         CASE WHEN v_winner_kind = 'horse' THEN 'treasury' ELSE 'player_wallet' END,
         18, p_winner_id, v_winner_kind,
         CASE WHEN v_winner_kind = 'human'
              THEN 'pvp_match_win_' || p_match_id::text END,
         CASE WHEN v_winner_kind = 'human' THEN 'pvp_win' END,
         CASE WHEN v_winner_kind = 'human'
              THEN pg_catalog.gen_random_uuid() END,
         CASE WHEN v_winner_kind = 'horse' THEN 'internal' ELSE 'linked' END),
        (v_journal, 'house:rake:pvp', 'house_revenue', 2, NULL, NULL,
         NULL, NULL, NULL, 'internal');

    INSERT INTO public.trivia_ledger_recon_settlement (
        settlement_id, subject_type, subject_id, terminal,
        nonzero_terminal_escrow, unexplained_variance)
    VALUES (v_settlement, 'pvp_match', p_match_id, true, false, 0);
END
$$;

DO $default_off$
DECLARE
    v_table text;
    v_blocked boolean;
BEGIN
    IF (SELECT count(*) FROM public.trivia_competitive_cutover_certificates
         WHERE certificate_version = 1 AND NOT enabled) <> 5
       OR EXISTS (SELECT 1 FROM public.trivia_competitive_cutover_certificates WHERE enabled)
       OR EXISTS (SELECT 1 FROM public.trivia_competitive_test_wallets)
       OR EXISTS (SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations) THEN
        RAISE EXCEPTION 'migration did not ship default-off with empty authority';
    END IF;

    FOR v_table IN SELECT unnest(ARRAY[
        'trivia_competitive_test_wallets',
        'trivia_competitive_cutover_certificates',
        'trivia_p12_scheduler_bootstrap_authorizations',
        'trivia_pvp_recovery_leases',
        'trivia_pvp_recovery_runs'])
    LOOP
        IF pg_catalog.has_table_privilege('service_role', 'public.' || v_table, 'SELECT')
           OR pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
           OR pg_catalog.has_table_privilege('anon', 'public.' || v_table, 'TRUNCATE') THEN
            RAISE EXCEPTION 'runtime ACL leaked on %', v_table;
        END IF;
        v_blocked := false;
        BEGIN
            EXECUTE pg_catalog.format('TRUNCATE TABLE public.%I', v_table);
        EXCEPTION WHEN insufficient_privilege THEN
            v_blocked := true;
        END;
        IF NOT v_blocked THEN
            RAISE EXCEPTION 'TRUNCATE guard did not fire on %', v_table;
        END IF;
    END LOOP;

    IF pg_catalog.has_function_privilege(
           'service_role', 'public.trivia_pvp_recover_v2(integer)', 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege(
           'service_role',
           'public.trivia_pvp_recovery_run_v1(text,integer,integer)',
           'EXECUTE')
       OR NOT pg_catalog.has_function_privilege(
           'service_role',
           'public.trivia_competitive_cutover_status_v1()',
           'EXECUTE') THEN
        RAISE EXCEPTION 'recovery/status function ACL is not exact';
    END IF;
END
$default_off$;

INSERT INTO public.trivia_competitive_test_wallets (
    user_id, wallet_name, authorization_reference, authorization_reason,
    authorized_by, authorized_at)
VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Named Human One',
     'replica-authorization-human-one', 'PG17 cutover evidence human one.',
     'p12-replica', pg_catalog.clock_timestamp() - interval '2 hours'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Named Human Two',
     'replica-authorization-human-two', 'PG17 cutover evidence human two.',
     'p12-replica', pg_catalog.clock_timestamp() - interval '2 hours'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Late Named Human',
     'replica-authorization-late-human', 'PG17 time-binding negative evidence.',
     'p12-replica', pg_catalog.clock_timestamp());

DO $ledger_clean$
DECLARE
    v_recon uuid := '91000000-0000-4000-8000-000000000001';
BEGIN
    IF NOT public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'empty reconciled replica should be ledger-clean';
    END IF;

    INSERT INTO public.trivia_pvp_matches (
        id, player1_id, player2_id, engine_version, match_kind, status,
        stake_amount, created_at, deadline_at)
    VALUES (
        '91000000-0000-4000-8000-000000000002',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        'pvp-v2', 'human_human', 'active', 10, pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp() + interval '10 minutes');
    INSERT INTO public.trivia_ledger_recon_settlement
    VALUES (v_recon, 'pvp_match',
            '91000000-0000-4000-8000-000000000002', false, false, 0);
    IF NOT public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'fresh active PvP settlement must not block cutover';
    END IF;
    UPDATE public.trivia_pvp_matches
       SET deadline_at = pg_catalog.clock_timestamp() - interval '1 second'
     WHERE id = '91000000-0000-4000-8000-000000000002';
    IF public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'expired PvP settlement must block cutover';
    END IF;
    DELETE FROM public.trivia_ledger_recon_settlement WHERE settlement_id = v_recon;
    DELETE FROM public.trivia_pvp_matches
     WHERE id = '91000000-0000-4000-8000-000000000002';

    INSERT INTO public.trivia_tournaments (
        id, schedule_kind, start_time, end_time, lifecycle_state, horse_target,
        engine_version, entry_fee, created_at)
    VALUES (
        '91000000-0000-4000-8000-000000000003', 'canary',
        pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '20 minutes',
        'scheduled', 0, 'tournament-v2', 0, pg_catalog.clock_timestamp());
    INSERT INTO public.trivia_ledger_recon_settlement
    VALUES (v_recon, 'tournament',
            '91000000-0000-4000-8000-000000000003', false, false, 0);
    IF NOT public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'future active tournament settlement must not block cutover';
    END IF;
    UPDATE public.trivia_tournaments
       SET end_time = pg_catalog.clock_timestamp() - interval '1 second'
     WHERE id = '91000000-0000-4000-8000-000000000003';
    IF public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'stale tournament settlement must block cutover';
    END IF;
    DELETE FROM public.trivia_ledger_recon_settlement WHERE settlement_id = v_recon;
    DELETE FROM public.trivia_tournaments
     WHERE id = '91000000-0000-4000-8000-000000000003';

    INSERT INTO public.trivia_ledger_recon_settlement
    VALUES (v_recon, 'unknown', pg_catalog.gen_random_uuid(), false, false, 0);
    IF public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'orphan nonterminal reconciliation must block cutover';
    END IF;
    DELETE FROM public.trivia_ledger_recon_settlement WHERE settlement_id = v_recon;

    INSERT INTO public.trivia_ledger_recon_settlement
    VALUES (v_recon, 'pvp_match', pg_catalog.gen_random_uuid(), true, false, 0);
    IF public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'terminal orphan reconciliation must block cutover';
    END IF;
    DELETE FROM public.trivia_ledger_recon_settlement WHERE settlement_id = v_recon;

    INSERT INTO public.trivia_ledger_recon_settlement
    VALUES (v_recon, 'pvp_match', pg_catalog.gen_random_uuid(), true, false, 1);
    IF public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'terminal variance must block cutover';
    END IF;
    UPDATE public.trivia_ledger_recon_settlement
       SET unexplained_variance = 0, nonzero_terminal_escrow = true
     WHERE settlement_id = v_recon;
    IF public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'terminal nonzero escrow must block cutover';
    END IF;
    DELETE FROM public.trivia_ledger_recon_settlement WHERE settlement_id = v_recon;

    INSERT INTO public.trivia_ledger_recon_reference
    VALUES ('bad-reference', 'pending');
    IF public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'unreconciled reference must block cutover';
    END IF;
    DELETE FROM public.trivia_ledger_recon_reference;
END
$ledger_clean$;

-- Zero-Diamond canaries require a real terminal settlement row, while paid
-- canaries must be settled prizes rather than merely refunded/voided.
INSERT INTO public.trivia_tournaments (
    id, schedule_kind, start_time, end_time, lifecycle_state, horse_target,
    engine_version, entry_fee, created_at, settled_at)
VALUES
    ('92000000-0000-4000-8000-000000000001', 'canary',
     pg_catalog.clock_timestamp() - interval '20 minutes',
     pg_catalog.clock_timestamp() - interval '10 minutes',
     'settled', 0, 'tournament-v2', 0,
     pg_catalog.clock_timestamp() - interval '30 minutes',
     pg_catalog.clock_timestamp() - interval '5 minutes'),
    ('92000000-0000-4000-8000-000000000002', 'test',
     pg_catalog.clock_timestamp() - interval '20 minutes',
     pg_catalog.clock_timestamp() - interval '10 minutes',
     'settled', 1, 'tournament-v2', 10,
     pg_catalog.clock_timestamp() - interval '30 minutes',
     pg_catalog.clock_timestamp() - interval '5 minutes');

INSERT INTO public.trivia_tournament_canary_access (tournament_id, user_id)
VALUES
    ('92000000-0000-4000-8000-000000000001',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
    ('92000000-0000-4000-8000-000000000002',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
    ('92000000-0000-4000-8000-000000000002',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');

INSERT INTO public.trivia_tournament_entrants (
    tournament_id, participant_id, participant_kind, entry_state,
    funding_source, display_name, entered_at)
VALUES
    ('92000000-0000-4000-8000-000000000001',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'human', 'entered',
     'player_wallet', 'Named Human One',
     pg_catalog.clock_timestamp() - interval '25 minutes'),
    ('92000000-0000-4000-8000-000000000002',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'human', 'entered',
     'player_wallet', 'Named Human One',
     pg_catalog.clock_timestamp() - interval '25 minutes'),
    ('92000000-0000-4000-8000-000000000002',
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'horse', 'entered',
     'treasury', 'Smarter Horse One',
     pg_catalog.clock_timestamp() - interval '25 minutes'),
    ('92000000-0000-4000-8000-000000000002',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'human', 'cancelled',
     'player_wallet', 'Named Human Two',
     pg_catalog.clock_timestamp() - interval '25 minutes');

DO $zero_requires_settlement$
BEGIN
    IF public.trivia_competitive_tournament_canary_ready_v1(
           '92000000-0000-4000-8000-000000000001', 0, false) THEN
        RAISE EXCEPTION 'zero-Diamond canary passed without settlement row';
    END IF;
END
$zero_requires_settlement$;

INSERT INTO public.trivia_ledger_accounts (
    account_code, kind, state, balance, min_balance, subject_id)
VALUES
    ('escrow:tournament:92000000-0000-4000-8000-000000000001',
     'tournament_escrow', 'closed', 0, 0,
     '92000000-0000-4000-8000-000000000001'),
    ('escrow:tournament:92000000-0000-4000-8000-000000000002',
     'tournament_escrow', 'closed', 0, 0,
     '92000000-0000-4000-8000-000000000002');

INSERT INTO public.trivia_ledger_journals (
    id, settlement_id, operation, subject_type, subject_id,
    line_count, total_debit, total_credit)
VALUES (
    '92100000-0000-4000-8000-000000000002',
    '92200000-0000-4000-8000-000000000002',
    'settlement', 'tournament',
    '92000000-0000-4000-8000-000000000002', 3, 20, 20);

INSERT INTO public.trivia_settlements (
    id, subject_type, subject_id, escrow_account_code, state, outcome,
    terminal_at, settlement_journal_id, gross_pool, held_total,
    paid_total, rake_amount, final_prize_pool)
VALUES
    ('92200000-0000-4000-8000-000000000001', 'tournament',
     '92000000-0000-4000-8000-000000000001',
     'escrow:tournament:92000000-0000-4000-8000-000000000001',
     'voided', 'void', pg_catalog.clock_timestamp(), NULL, 0, 0, 0, 0, 0),
    ('92200000-0000-4000-8000-000000000002', 'tournament',
     '92000000-0000-4000-8000-000000000002',
     'escrow:tournament:92000000-0000-4000-8000-000000000002',
     'refunded', 'cancelled', pg_catalog.clock_timestamp(),
     '92100000-0000-4000-8000-000000000002', 20, 20, 18, 2, 18);

INSERT INTO public.trivia_ledger_lines (
    journal_id, account_code, account_kind, amount, user_id,
    participant_kind, wallet_reference, wallet_kind,
    diamond_transaction_id, reconciliation_state)
VALUES
    ('92100000-0000-4000-8000-000000000002',
     'escrow:tournament:92000000-0000-4000-8000-000000000002',
     'tournament_escrow', -20, NULL, NULL, NULL, NULL, NULL, 'internal'),
    ('92100000-0000-4000-8000-000000000002',
     'treasury:trivia', 'treasury', 18,
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'horse',
     NULL, NULL, NULL, 'internal'),
    ('92100000-0000-4000-8000-000000000002',
     'house:rake:tournament', 'house_revenue', 2,
     NULL, NULL, NULL, NULL, NULL, 'internal');

INSERT INTO public.trivia_settlement_participants (
    settlement_id, user_id, participant_kind, funding_source,
    entry_amount, state, rake_share, payout_amount, exit_journal_id)
VALUES
    ('92200000-0000-4000-8000-000000000002',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'human', 'player_wallet',
     10, 'settled', 1, 0, '92100000-0000-4000-8000-000000000002'),
    ('92200000-0000-4000-8000-000000000002',
     'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'horse', 'treasury',
     10, 'settled', 1, 18, '92100000-0000-4000-8000-000000000002');

INSERT INTO public.trivia_ledger_recon_settlement (
    settlement_id, subject_type, subject_id, terminal,
    nonzero_terminal_escrow, unexplained_variance)
VALUES
    ('92200000-0000-4000-8000-000000000001', 'tournament',
     '92000000-0000-4000-8000-000000000001', true, false, 0),
    ('92200000-0000-4000-8000-000000000002', 'tournament',
     '92000000-0000-4000-8000-000000000002', true, false, 0);

DO $tournament_settlement_shapes$
BEGIN
    IF NOT public.trivia_competitive_tournament_canary_ready_v1(
           '92000000-0000-4000-8000-000000000001', 0, false) THEN
        RAISE EXCEPTION 'terminal zero-Diamond canary was rejected';
    END IF;
    IF public.trivia_competitive_tournament_canary_ready_v1(
           '92000000-0000-4000-8000-000000000002', 1, true) THEN
        RAISE EXCEPTION 'refunded paid tournament falsely certified';
    END IF;
    UPDATE public.trivia_settlements
       SET state = 'settled', outcome = 'prizes'
     WHERE id = '92200000-0000-4000-8000-000000000002';
    IF NOT public.trivia_competitive_tournament_canary_ready_v1(
           '92000000-0000-4000-8000-000000000002', 1, true) THEN
        RAISE EXCEPTION 'settled paid tournament with balanced journal was rejected';
    END IF;
    IF (SELECT humans_entered
          FROM public.trivia_tournament_metrics_v1
         WHERE tournament_id = '92000000-0000-4000-8000-000000000002') <> 1 THEN
        RAISE EXCEPTION 'metrics counted a cancelled human as entered';
    END IF;
END
$tournament_settlement_shapes$;

-- Both human-v-horse winner branches and strict human-human proof.
SELECT p12test.add_paid_pvp(
    '93000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'human_human',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    pg_catalog.clock_timestamp());
SELECT p12test.add_paid_pvp(
    '93000000-0000-4000-8000-000000000002',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'human_horse',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    pg_catalog.clock_timestamp());
SELECT p12test.add_paid_pvp(
    '93000000-0000-4000-8000-000000000003',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    'human_horse',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    pg_catalog.clock_timestamp());
SELECT p12test.add_paid_pvp(
    '93000000-0000-4000-8000-000000000004',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
    'human_horse',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    pg_catalog.clock_timestamp() - interval '1 day');

DO $pvp_shapes$
BEGIN
    IF NOT public.trivia_competitive_pvp_paid_ready_v1(
               '93000000-0000-4000-8000-000000000001')
       OR NOT public.trivia_competitive_pvp_paid_ready_v1(
               '93000000-0000-4000-8000-000000000002')
       OR NOT public.trivia_competitive_pvp_paid_ready_v1(
               '93000000-0000-4000-8000-000000000003') THEN
        RAISE EXCEPTION 'a valid human-human, human-win, or horse-win PvP proof failed';
    END IF;
    IF public.trivia_competitive_pvp_paid_ready_v1(
           '93000000-0000-4000-8000-000000000004') THEN
        RAISE EXCEPTION 'wallet authorization after match creation falsely certified';
    END IF;
END
$pvp_shapes$;

-- Certificate evidence must be strictly later than the latest disable.
DO $certificate_time_bind$
DECLARE
    v_disabled timestamptz;
    v_blocked boolean := false;
BEGIN
    SELECT created_at INTO v_disabled
      FROM public.trivia_competitive_cutover_certificates
     WHERE gate_key = 'pvp_public' AND certificate_version = 1;

    INSERT INTO public.trivia_pvp_queue (
        id, user_id, engine_version, stake_amount, status, match_id,
        joined_at, matched_at, ended_at)
    VALUES (
        '93100000-0000-4000-8000-000000000001',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        'pvp-v2', 10, 'cancelled', NULL, v_disabled, NULL,
        pg_catalog.clock_timestamp());
    BEGIN
        INSERT INTO public.trivia_competitive_cutover_certificates (
            gate_key, certificate_version, enabled, evidence, reason, created_by)
        VALUES (
            'pvp_public', 2, true,
            pg_catalog.jsonb_build_object(
                'non_money_pvp_ticket_id',
                '93100000-0000-4000-8000-000000000001',
                'paid_human_human_match_id',
                '93000000-0000-4000-8000-000000000001'),
            'Replica stale evidence must fail.', 'p12-replica');
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'certificate accepted evidence at the disable timestamp';
    END IF;

    UPDATE public.trivia_pvp_queue
       SET joined_at = pg_catalog.clock_timestamp(),
           ended_at = pg_catalog.clock_timestamp()
     WHERE id = '93100000-0000-4000-8000-000000000001';
    INSERT INTO public.trivia_competitive_cutover_certificates (
        gate_key, certificate_version, enabled, evidence, reason, created_by)
    VALUES (
        'pvp_public', 2, true,
        pg_catalog.jsonb_build_object(
            'non_money_pvp_ticket_id',
            '93100000-0000-4000-8000-000000000001',
            'paid_human_human_match_id',
            '93000000-0000-4000-8000-000000000001'),
        'Replica fresh time-bound PvP evidence.', 'p12-replica');
END
$certificate_time_bind$;

-- Public admission remains blocked. Replica-only trigger bypass seeds one
-- pre-existing public target solely to prove operator recovery cannot target it.
DO $public_admission$
DECLARE
    v_blocked boolean := false;
BEGIN
    BEGIN
        INSERT INTO public.trivia_tournaments (
            id, schedule_kind, start_time, end_time, lifecycle_state,
            horse_target, engine_version, entry_fee, created_at)
        VALUES (
            '94000000-0000-4000-8000-000000000001', 'public_nightly',
            pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 hour',
            'scheduled', 140, 'tournament-v2', 10, pg_catalog.clock_timestamp());
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'public nightly admission bypassed disabled cutover';
    END IF;
END
$public_admission$;

SET session_replication_role = replica;
INSERT INTO public.trivia_tournaments (
    id, schedule_kind, start_time, end_time, lifecycle_state,
    horse_target, engine_version, entry_fee, created_at)
VALUES (
    '94000000-0000-4000-8000-000000000002', 'public_nightly',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp() + interval '1 hour',
    'settling', 140, 'tournament-v2', 10, pg_catalog.clock_timestamp());
SET session_replication_role = origin;

INSERT INTO public.trivia_tournaments (
    id, schedule_kind, start_time, end_time, lifecycle_state,
    horse_target, engine_version, entry_fee, created_at)
VALUES (
    '22222222-2222-4222-8222-222222222222', 'canary',
    pg_catalog.clock_timestamp() - interval '1 hour',
    pg_catalog.clock_timestamp() - interval '10 minutes',
    'settling', 1, 'tournament-v2', 10,
    pg_catalog.clock_timestamp() - interval '2 hours');

DO $scheduler_pre_cert$
DECLARE
    v_result jsonb;
    v_run uuid;
    v_blocked boolean;
    v_holder constant text :=
        'operator:11111111-1111-4111-8111-111111111111:canary:22222222-2222-4222-8222-222222222222';
BEGIN
    v_result := public.trivia_tournament_scheduler_acquire(v_holder, 90);
    v_run := (v_result ->> 'run_id')::uuid;
    UPDATE public.trivia_tournament_scheduler_runs
       SET finished_at = pg_catalog.clock_timestamp()
     WHERE run_id = v_run;

    v_blocked := false;
    BEGIN
        PERFORM public.trivia_tournament_scheduler_tick(
            v_run, (v_result ->> 'fencing_token')::bigint, true, 1);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'pre-cert operator fence executed a scheduler tick';
    END IF;

    v_blocked := false;
    BEGIN
        PERFORM public.trivia_tournament_scheduler_acquire(
            'operator:11111111-1111-4111-8111-111111111111:canary:94000000-0000-4000-8000-000000000002',
            90);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'operator holder authorized a public target';
    END IF;

    v_blocked := false;
    BEGIN
        PERFORM public.trivia_tournament_scheduler_acquire(
            'operator:11111111-1111-4111-8111-111111111111:canary:not-a-uuid',
            90);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'operator prefix bypassed exact holder parsing';
    END IF;

    INSERT INTO public.trivia_p12_scheduler_bootstrap_authorizations (
        job_identity, holder_id, expected_fencing_token, reason, created_by,
        expires_at)
    SELECT public.trivia_tournament_scheduler_job(), 'bootstrap:exact-owner', 2,
           'Replica one-time exact scheduler fence.', 'p12-replica',
           pg_catalog.clock_timestamp() + interval '10 minutes';
    v_result := public.trivia_tournament_scheduler_acquire(
        'bootstrap:exact-owner', 90);
    v_run := (v_result ->> 'run_id')::uuid;
    IF NOT EXISTS (
        SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations a
         WHERE a.holder_id = 'bootstrap:exact-owner'
           AND a.expected_fencing_token = 2
           AND a.consumed_run_id = v_run
           AND a.consumed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'bootstrap authorization was not atomically run/fence bound';
    END IF;
    UPDATE public.trivia_tournament_scheduler_runs
       SET finished_at = pg_catalog.clock_timestamp()
     WHERE run_id = v_run;

    v_blocked := false;
    BEGIN
        PERFORM public.trivia_tournament_scheduler_acquire(
            'bootstrap:exact-owner', 90);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'one-time bootstrap authorization was reused';
    END IF;
END
$scheduler_pre_cert$;

-- A later standby must be informational, never mask the latest owner failure.
INSERT INTO public.trivia_pvp_recovery_runs (
    run_id, job_identity, holder_id, outcome, fencing_token,
    started_at, finished_at, healthy, result)
VALUES
    ('95000000-0000-4000-8000-000000000001',
     'openclaw:trivia-pvp-recovery', 'replica:unhealthy-owner', 'owner', 101,
     pg_catalog.clock_timestamp() + interval '10 minutes',
     pg_catalog.clock_timestamp() + interval '11 minutes', false,
     '{"success":false,"failed":1,"error":"secret-owner-detail","sqlstate":"XX000"}'),
    ('95000000-0000-4000-8000-000000000002',
     'openclaw:trivia-pvp-recovery', 'replica:later-standby', 'standby', NULL,
     pg_catalog.clock_timestamp() + interval '20 minutes',
     pg_catalog.clock_timestamp() + interval '21 minutes', true,
     '{"success":false,"owner":false,"outcome":"standby","detail":"secret-standby-detail"}');

DO $sanitized_status$
DECLARE
    v_status jsonb;
    v_keys text[];
BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
    v_status := public.trivia_competitive_cutover_status_v1();
    IF v_status #>> '{recovery_status,run_id}'
           <> '95000000-0000-4000-8000-000000000001'
       OR (v_status #>> '{recovery_status,healthy}')::boolean
       OR (v_status #>> '{recovery_status,success}')::boolean
       OR v_status #>> '{recovery_status,outcome}' <> 'owner' THEN
        RAISE EXCEPTION 'standby masked the latest owner health: %', v_status;
    END IF;
    SELECT pg_catalog.array_agg(key ORDER BY key) INTO v_keys
      FROM pg_catalog.jsonb_object_keys(v_status -> 'recovery_status') AS key;
    IF v_keys IS DISTINCT FROM ARRAY[
        'failed', 'finished_at', 'healthy', 'matches_scanned', 'outcome',
        'pending', 'run_id', 'settled', 'started_at', 'success',
        'tickets_expired']::text[]
       OR v_status -> 'recovery_status' ?| ARRAY[
            'holder_id', 'fencing_token', 'result', 'error', 'detail', 'sqlstate'] THEN
        RAISE EXCEPTION 'recovery status leaked or omitted fields: %', v_status;
    END IF;
END
$sanitized_status$;

DO $compatibility_fence$
DECLARE
    v_result jsonb;
BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
    v_result := public.trivia_pvp_recover_v2(10);
    IF (v_result ->> 'success')::boolean IS NOT TRUE
       OR (v_result ->> 'owner')::boolean IS NOT TRUE
       OR v_result ->> 'outcome' <> 'owner'
       OR v_result ->> 'run_id' IS NULL
       OR v_result ->> 'fencing_token' IS NULL THEN
        RAISE EXCEPTION 'compatibility RPC did not enter canonical recovery fence: %',
            v_result;
    END IF;
END
$compatibility_fence$;

SELECT pg_catalog.jsonb_build_object(
    'suite', 'trivia-p12-cutover-pg17',
    'postgres_major', pg_catalog.current_setting('server_version_num')::integer / 10000,
    'default_off_gates', 5,
    'pvp_winner_branches', 3,
    'zero_terminal_proved', true,
    'paid_tournament_proved', true,
    'scheduler_bootstrap_consumed', (
        SELECT count(*) FROM public.trivia_p12_scheduler_bootstrap_authorizations
         WHERE consumed_at IS NOT NULL),
    'recovery_status_owner_preferred', true
) AS result;
