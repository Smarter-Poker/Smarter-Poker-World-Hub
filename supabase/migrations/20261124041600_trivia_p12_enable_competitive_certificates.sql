-- ═══════════════════════════════════════════════════════════════════════
-- 20261124041600_trivia_p12_enable_competitive_certificates.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      Antigravity, authorized Trivia Phase 12 cutover
-- AFFECTS:     public.trivia_competitive_cutover_certificates
-- IRREVERSIBLE: no
--
-- WHY:
--   All five competitive cutover gates (pvp_public, pvp_horses,
--   tournament_public, tournament_horses, tournament_scheduler) have verified,
--   reconciled, time-bound production canary receipts from October 8, 2026
--   with zero terminal escrow, zero unexplained variance, and 25,000 available
--   treasury Diamonds. Owner authorized Phase 12 controlled activation so the
--   canonical 8:00 PM America/Chicago nightly tournament schedule can begin
--   accumulating its seven consecutive actual nightly events.
--
-- HOW:
--   Insert version 2 enabled certificates for all five gates in dependency
--   order, validated atomically by trg_trivia_competitive_certificate_validate
--   against the exact production canary UUIDs:
--     - non_money_pvp_ticket_id: 7b19359c-4ad7-419a-9b4c-248edd0b3450
--     - paid_human_human_match_id: a4053c10-a8a4-4561-8977-1f7e77133caa
--     - paid_human_horse_match_id: 91fe9b26-a0ad-40c0-ae8a-c8cece9c3482
--     - zero_70_tournament_id: 6062f650-9b21-40d1-a34b-5c1dad34b762
--     - zero_100_tournament_id: 1d403b1c-063c-4908-8b6c-dbf947ec5fd7
--     - zero_140_tournament_id: 7248c584-8c79-4c42-8ed6-352557fe7863
--     - paid_treasury_tournament_id: 0c20a48c-14f8-47be-b6ed-c9d73bc7d728
--     - scheduler_bootstrap_authorization_id: 24a1d198-4eb3-4985-bbec-acf5f5423ab3
--     - scheduler_run_id: 7319756d-3970-44e7-9dde-b0c16c48f4dd
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
BEGIN
    IF NOT public.trivia_competitive_global_ledger_clean_v1() THEN
        RAISE EXCEPTION 'pre-flight failed: global Trivia ledger is not clean';
    END IF;
    IF public.trivia_competitive_treasury_available_v1() < 25000 THEN
        RAISE EXCEPTION 'pre-flight failed: treasury available is below 25000 minimum reserve';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM public.trivia_competitive_cutover_certificates c
         WHERE c.certificate_version <> 1 OR c.enabled
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: competitive cutover certificates are not in expected v1 disabled state';
    END IF;
END
$preflight$;

INSERT INTO public.trivia_competitive_cutover_certificates (
    gate_key, certificate_version, enabled, evidence, reason, created_by
)
VALUES
    (
        'pvp_public',
        2,
        true,
        jsonb_build_object(
            'non_money_pvp_ticket_id', '7b19359c-4ad7-419a-9b4c-248edd0b3450',
            'paid_human_human_match_id', 'a4053c10-a8a4-4561-8977-1f7e77133caa'
        ),
        'Phase 12 controlled activation: verified Oct 8 non-money admission and paid HH PvP canary receipts.',
        'antigravity:trivia-p12-cutover-20261124'
    ),
    (
        'pvp_horses',
        2,
        true,
        jsonb_build_object(
            'paid_human_horse_match_id', '91fe9b26-a0ad-40c0-ae8a-c8cece9c3482'
        ),
        'Phase 12 controlled activation: verified Oct 8 paid human-horse PvP canary receipt and 25,000 treasury reserve.',
        'antigravity:trivia-p12-cutover-20261124'
    ),
    (
        'tournament_public',
        2,
        true,
        jsonb_build_object(
            'zero_70_tournament_id', '6062f650-9b21-40d1-a34b-5c1dad34b762',
            'zero_100_tournament_id', '1d403b1c-063c-4908-8b6c-dbf947ec5fd7',
            'zero_140_tournament_id', '7248c584-8c79-4c42-8ed6-352557fe7863',
            'paid_treasury_tournament_id', '0c20a48c-14f8-47be-b6ed-c9d73bc7d728'
        ),
        'Phase 12 controlled activation: verified Oct 8 named-human 70/100/140 zero-Diamond and paid treasury tournament canaries.',
        'antigravity:trivia-p12-cutover-20261124'
    ),
    (
        'tournament_horses',
        2,
        true,
        jsonb_build_object(
            'paid_treasury_tournament_id', '0c20a48c-14f8-47be-b6ed-c9d73bc7d728'
        ),
        'Phase 12 controlled activation: verified paid horse tournament canary and 25,000 treasury reserve.',
        'antigravity:trivia-p12-cutover-20261124'
    ),
    (
        'tournament_scheduler',
        2,
        true,
        jsonb_build_object(
            'scheduler_bootstrap_authorization_id', '24a1d198-4eb3-4985-bbec-acf5f5423ab3',
            'scheduler_run_id', '7319756d-3970-44e7-9dde-b0c16c48f4dd'
        ),
        'Phase 12 controlled activation: verified non-overlapping fenced bootstrap run for canonical OpenClaw owner.',
        'antigravity:trivia-p12-cutover-20261124'
    );

DO $postflight$
BEGIN
    IF NOT public.trivia_competitive_latest_enabled_v1('pvp_public')
       OR NOT public.trivia_competitive_latest_enabled_v1('pvp_horses')
       OR NOT public.trivia_competitive_latest_enabled_v1('tournament_public')
       OR NOT public.trivia_competitive_latest_enabled_v1('tournament_horses')
       OR NOT public.trivia_competitive_latest_enabled_v1('tournament_scheduler') THEN
        RAISE EXCEPTION 'post-apply failed: not all five competitive gates are enabled';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- FORWARD ROLLBACK: paste as a NEW migration; stops admission before drain,
-- preserves recovery, and disables tournament_scheduler last.
/*
BEGIN;
-- Step 1: stop new public admission before draining active work.
INSERT INTO public.trivia_competitive_cutover_certificates (
    gate_key, certificate_version, enabled, evidence, reason, created_by
)
SELECT g.gate_key,
       COALESCE((SELECT max(c.certificate_version) FROM public.trivia_competitive_cutover_certificates c WHERE c.gate_key = g.gate_key), 0) + 1,
       false,
       '{}'::jsonb,
       'Forward rollback: stop new public Trivia competitive admission before drain.',
       'operator-rollback'
  FROM (VALUES ('pvp_horses'), ('pvp_public'), ('tournament_horses'), ('tournament_public')) AS g(gate_key);

-- Step 2: verify active work has drained before disabling tournament_scheduler.
DO $drain_check$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.trivia_tournaments t
         WHERE t.schedule_kind = 'public_nightly'
           AND t.lifecycle_state IN ('registration', 'held', 'live', 'settling')
    ) THEN
        RAISE EXCEPTION 'forward rollback drain incomplete: let active tournaments settle or cancel before disabling scheduler';
    END IF;
END
$drain_check$;

-- Step 3: disable tournament scheduler last.
INSERT INTO public.trivia_competitive_cutover_certificates (
    gate_key, certificate_version, enabled, evidence, reason, created_by
)
SELECT 'tournament_scheduler',
       COALESCE((SELECT max(c.certificate_version) FROM public.trivia_competitive_cutover_certificates c WHERE c.gate_key = 'tournament_scheduler'), 0) + 1,
       false,
       '{}'::jsonb,
       'Forward rollback: disable tournament scheduler last after drain.',
       'operator-rollback';
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
