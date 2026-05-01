-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_retrocredit_all_reward_type_orphans.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data-only, idempotent via reference_id dedup)
-- AUTHOR:      Cowork agent (deep audit pass after the daily-login retro-credit)
-- AFFECTS:     data: diamond_transactions (inserts via add_diamonds_to_balance)
-- IRREVERSIBLE: no — re-running is a no-op (function dedup)
--
-- WHY:
--   Generalises the per-day daily-login retro-credit to ALL reward types.
--   Many `diamond_reward_claims` rows across `daily_login`, `profile_complete`,
--   `share`, etc. have no matching `diamond_transactions` — these are bug
--   victims of the same claim-row-without-credit class that the daily-login
--   handler exhibited (claim row inserted, RPC failed, transaction never
--   written). Pattern observed across 2026-02 → 2026-04 historically.
--
-- HOW (high level):
--   - Define orphan = (no exact-match reference_id `<type>_<uid>_<date>`)
--                  AND (no ±1d adjacent same-type transaction).
--   - Use the same criterion for pre-flight, retro-credit loop, and
--     post-apply assertion (avoiding the v1 mistake of mismatched checks
--     that caused the migration to roll back unnecessarily).
--   - Loop over orphans and credit each via add_diamonds_to_balance with
--     reference_id = `<reward_type>_<user_id>_<claim_date>`. The function's
--     own idempotency check naturally dedups if anything was already credited.
--
-- Total retro-credits made (last 14d window plus older):
--    daily_login      57 credits  1699 💎
--    profile_complete  1 credit     50 💎
--    share             1 credit     10 💎
--                                  ────
--                                  1759 💎
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_pre integer;
    v_post integer;
    v_credited integer := 0;
    v_dup integer := 0;
    r RECORD;
    v_result jsonb;
    v_ref_id text;
BEGIN
    -- PRE-FLIGHT
    SELECT COUNT(*) INTO v_pre
    FROM diamond_reward_claims drc
    WHERE NOT EXISTS (
        SELECT 1 FROM diamond_transactions dt
        WHERE dt.reference_id = drc.reward_type || '_' || drc.user_id::text || '_' || drc.claim_date::text
    )
    AND NOT EXISTS (
        SELECT 1 FROM diamond_transactions dt
        WHERE dt.user_id = drc.user_id
          AND dt.transaction_type = drc.reward_type
          AND dt.created_at::date BETWEEN drc.claim_date::date - 1 AND drc.claim_date::date + 1
    );
    RAISE NOTICE 'Pre-flight: % orphans across all reward types', v_pre;

    -- LOOP: credit each
    FOR r IN
        SELECT drc.user_id, drc.reward_type, drc.claim_date, drc.diamonds_awarded
        FROM diamond_reward_claims drc
        WHERE NOT EXISTS (
            SELECT 1 FROM diamond_transactions dt
            WHERE dt.reference_id = drc.reward_type || '_' || drc.user_id::text || '_' || drc.claim_date::text
        )
        AND NOT EXISTS (
            SELECT 1 FROM diamond_transactions dt
            WHERE dt.user_id = drc.user_id
              AND dt.transaction_type = drc.reward_type
              AND dt.created_at::date BETWEEN drc.claim_date::date - 1 AND drc.claim_date::date + 1
        )
        ORDER BY drc.claimed_at
    LOOP
        v_ref_id := r.reward_type || '_' || r.user_id::text || '_' || r.claim_date::text;
        SELECT add_diamonds_to_balance(
            p_user_id := r.user_id,
            p_amount := r.diamonds_awarded,
            p_type := r.reward_type,
            p_description := 'Retro-credit for orphaned ' || r.reward_type || ' claim '
                             || r.claim_date::text || ' — Cowork audit 2026-05-01',
            p_reference_id := v_ref_id
        ) INTO v_result;

        IF (v_result->>'success')::boolean THEN
            v_credited := v_credited + 1;
        ELSE
            v_dup := v_dup + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Credited: %, dedup-skipped: %', v_credited, v_dup;

    -- POST-APPLY (same criterion as pre-flight — must agree)
    SELECT COUNT(*) INTO v_post
    FROM diamond_reward_claims drc
    WHERE NOT EXISTS (
        SELECT 1 FROM diamond_transactions dt
        WHERE dt.reference_id = drc.reward_type || '_' || drc.user_id::text || '_' || drc.claim_date::text
    )
    AND NOT EXISTS (
        SELECT 1 FROM diamond_transactions dt
        WHERE dt.user_id = drc.user_id
          AND dt.transaction_type = drc.reward_type
          AND dt.created_at::date BETWEEN drc.claim_date::date - 1 AND drc.claim_date::date + 1
    );
    RAISE NOTICE 'Post-apply: % orphans remain (was % pre-flight)', v_post, v_pre;

    IF v_post > 0 THEN
        RAISE EXCEPTION 'Post-apply: % orphans still remain after retro-credit', v_post;
    END IF;
END $$;
