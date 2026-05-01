-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_retrocredit_orphaned_daily_login_claims.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data-only, idempotent via reference_id dedup)
-- AUTHOR:      Cowork agent (audit pass after Phase 29 daily-login fix)
-- AFFECTS:     data: diamond_transactions (inserts via add_diamonds_to_balance)
-- IRREVERSIBLE: no — re-running is a no-op (function dedup)
--
-- WHY:
--   The pre-Phase-29 daily-login bug had this failure mode: handler inserts
--   `diamond_reward_claims` row, then RPC `add_diamonds_to_balance` fails
--   (PostgREST overload ambiguity). The claim row stayed; the diamonds
--   never landed. User saw "already claimed today" the next time without
--   ever receiving the credit. Bug fixed by 4d75febb62 (consolidate
--   add_diamonds_to_balance overloads); but the historical victims
--   need to be retro-credited.
--
--   Verified victims (last 14 days):
--     KingFish (47965354-…)   14 claims × 50  = 700 💎
--     mason    (3bb71bfe-…)   2 claims × 5    = 10 💎
--     SeanHovater (628c0ddc-…)  2 claims × 5    = 10 💎
--     AudreyGaliunas (b4f88502-…) 1 claim × 5  = 5 💎
--                                              ────
--                                              725 💎 owed across 4 users
--
-- HOW (high level):
--   - Detect orphans: claims with NO diamond_transaction whose reference_id
--     matches `daily_login_<user_id>_<claim_date>` (the handler's pattern).
--   - For each, call add_diamonds_to_balance with that exact reference_id
--     so the function's own idempotency check naturally dedups if anything
--     was already credited.
--   - Post-apply: assert 0 orphans remain.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ─────────────────────────────────────────────────────
DO $$
DECLARE v_orphan_count integer;
BEGIN
    SELECT COUNT(*) INTO v_orphan_count
    FROM diamond_reward_claims drc
    WHERE drc.reward_type = 'daily_login'
      AND drc.claimed_at > NOW() - INTERVAL '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM diamond_transactions dt
        WHERE dt.reference_id = 'daily_login_' || drc.user_id::text || '_' || drc.claim_date::text
      );

    IF v_orphan_count = 0 THEN
        RAISE NOTICE 'Pre-flight: 0 orphans found — already credited (idempotent re-run)';
    ELSE
        RAISE NOTICE 'Pre-flight: % orphans by reference_id', v_orphan_count;
    END IF;
END $$;

-- ─── 2. RETRO-CREDIT ──────────────────────────────────────────────────
DO $$
DECLARE r RECORD; v_result jsonb; v_credited integer := 0; v_dup integer := 0;
BEGIN
    FOR r IN
        SELECT drc.user_id, drc.claim_date, drc.diamonds_awarded
        FROM diamond_reward_claims drc
        WHERE drc.reward_type = 'daily_login'
          AND drc.claimed_at > NOW() - INTERVAL '14 days'
          AND NOT EXISTS (
            SELECT 1 FROM diamond_transactions dt
            WHERE dt.reference_id = 'daily_login_' || drc.user_id::text || '_' || drc.claim_date::text
          )
        ORDER BY drc.claimed_at
    LOOP
        SELECT add_diamonds_to_balance(
            p_user_id := r.user_id,
            p_amount := r.diamonds_awarded,
            p_type := 'daily_login',
            p_description := 'Retro-credit for orphaned daily_login claim ' || r.claim_date::text
                             || ' (rollback-bug victim, pre-fix 4d75febb62)',
            p_reference_id := 'daily_login_' || r.user_id::text || '_' || r.claim_date::text
        ) INTO v_result;

        IF (v_result->>'success')::boolean THEN
            v_credited := v_credited + 1;
        ELSE
            v_dup := v_dup + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Credited: %, dedup-skipped: %', v_credited, v_dup;
END $$;

-- ─── 3. POST-APPLY ASSERTION ──────────────────────────────────────────
-- Every claim in the lookback window must now have a matching reference_id
-- transaction. If any orphan remains, the migration aborts.
DO $$
DECLARE v_remaining integer;
BEGIN
    SELECT COUNT(*) INTO v_remaining
    FROM diamond_reward_claims drc
    WHERE drc.reward_type = 'daily_login'
      AND drc.claimed_at > NOW() - INTERVAL '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM diamond_transactions dt
        WHERE dt.reference_id = 'daily_login_' || drc.user_id::text || '_' || drc.claim_date::text
      );

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Post-apply: % orphans still remain', v_remaining;
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (if necessary):
-- DELETE FROM diamond_transactions
--   WHERE reference_id LIKE 'daily_login_%'
--     AND description LIKE '%Retro-credit for orphaned daily_login claim%'
--     AND created_at > '2026-05-01 16:47:00'::timestamptz
--     AND created_at < '2026-05-01 16:48:00'::timestamptz;
-- (Then manually subtract the diamonds from each user's profiles.diamonds /
-- diamond_balance — the dual-column reset matters since add_diamonds_to_balance
-- bumped both. Rollback is awkward; idempotent re-application of the migration
-- is safer.)
