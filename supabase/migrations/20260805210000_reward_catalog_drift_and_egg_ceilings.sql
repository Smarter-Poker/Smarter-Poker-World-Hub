-- =======================================================================
-- 20260805210000_reward_catalog_drift_and_egg_ceilings.sql
-- =======================================================================
-- TIER:        3            (money function replaced + catalog rows updated)
-- AUTHOR:      claude (cowork session, 2026-08-05)
-- AFFECTS:     public.diamond_reward_catalog (4 rows)
--              public.award_diamonds_v2 (2 constants + egg payout rule)
-- IRREVERSIBLE: no — ROLLBACK section at the bottom
--
-- WHY
-- ───────────────────────────────────────────────────────────────────────
-- award_diamonds_v2 reads its per-action rules from diamond_reward_catalog,
-- NOT from src/config/diamondRewards.js. The two had drifted apart on five
-- fields. A diff of every catalog row against the JS config found:
--
--   1. easter_egg.counts_toward_daily_cap = true   (config says false)
--      This is the expensive one. Step 8 does
--          v_award := LEAST(v_award, v_daily_remaining, v_monthly_remaining)
--      so a 500 ◆ legendary egg paid at most the daily cap — 110 free /
--      150 VIP — and often far less for anyone who had already done their
--      dailies. The excess was silently discarded AND the ledger row was
--      still written, so the reference_id was burned and the rest of the
--      award could never be recovered. Meanwhile pages/hub/diamond-store.js
--      promises users, in three places, that eggs pay "on top of your normal
--      daily cap". The database was the only thing that disagreed.
--
--   2. easter_egg.max_per_day = NULL               (config says 3)
--
--   3. first_training_session.lifetime = false     (config says true)
--      A once-ever 15 ◆ welcome bonus was repayable every single day.
--
--   4. referral_qualified.max_per_day = NULL       (config says 20)
--      Bounded in practice by the c_referral_max_month = 20 rule in step 5b.
--
--   5. referral_vip_conversion.max_per_day = NULL  (config says 20)
--      This one has NO step-5b periodic rule, does not count toward the
--      daily or monthly cap, is not lifetime, and pays 500 ◆. Its only
--      bounds were reference_id idempotency and the 60-second velocity
--      guard (5 per action). It is serverOnly, so a browser cannot reach
--      it, but any loop or retry storm in the referral flow could have
--      minted without limit.
--
-- Also raises the two egg ceilings. c_egg_max_single was 250 while sixteen
-- catalog eggs are priced above it (nine of which now have working
-- verifiers), so those were being truncated before the caps even ran.
-- Dan authorised up to 1000 on 2026-08-05.
--
-- And makes egg payouts ALL-OR-NOTHING. Previously
--     v_requested := LEAST(v_egg_request, c_egg_monthly_cap - v_egg_month_total)
-- paid a fraction of a milestone egg when the monthly egg budget was nearly
-- spent, wrote the ledger row, and burned the reference_id — so a 500 ◆
-- achievement could pay 40 ◆ once and never again. Now an egg that does not
-- fit in the remaining budget is deferred whole: no row is written, no
-- reference_id is burned, and the next sweep picks it up. Nothing is lost,
-- it is only delayed.
--
-- LIABILITY CHANGE (deliberate, approved): the per-user easter-egg budget
-- goes from 500 ◆ ($5) to 1000 ◆ ($10) per calendar month, and eggs now sit
-- outside the 110/150 daily and 3300/4500 monthly ceilings rather than
-- inside them. Worst case per user per month becomes 4300 ◆ free /
-- 5500 ◆ VIP. Only reachable by unlocking genuine milestone achievements.
-- The 2,500,000 ◆ platform circuit breaker is unchanged and still binds.
--
-- HOW
-- ───────────────────────────────────────────────────────────────────────
-- The function body is edited via pg_get_functiondef() + textual
-- replacement rather than being re-pasted in full, so the 400-odd lines
-- this migration does NOT intend to change cannot be accidentally altered
-- by transcription. Every replacement asserts its target exists first and
-- that the substitution actually happened, so a whitespace mismatch aborts
-- loudly instead of silently no-opping.
--
-- See .agent/workflows/migration-safety.md.
-- =======================================================================

BEGIN;

-- --- 1. PRE-FLIGHT ASSERTIONS ------------------------------------------
DO $preflight$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'award_diamonds_v2') THEN
        RAISE EXCEPTION 'pre-flight failed: award_diamonds_v2 not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.diamond_reward_catalog
         WHERE action_key = 'easter_egg' AND counts_toward_daily_cap
    ) THEN
        RAISE WARNING 'pre-flight: easter_egg.counts_toward_daily_cap already false - continuing (idempotent)';
    END IF;
END
$preflight$;

-- --- 2. CATALOG DRIFT -------------------------------------------------
-- Align the five drifted fields with src/config/diamondRewards.js. The
-- config is the design document; the table is what the money function
-- actually reads.

UPDATE public.diamond_reward_catalog
   SET counts_toward_daily_cap = false,   -- config: countsTowardDailyCap: false
       max_per_day             = 3,       -- config: maxPerDay: 3
       updated_at              = now()
 WHERE action_key = 'easter_egg';

UPDATE public.diamond_reward_catalog
   SET lifetime   = true,                 -- config: lifetime: true (once, ever)
       updated_at = now()
 WHERE action_key = 'first_training_session';

UPDATE public.diamond_reward_catalog
   SET max_per_day = 20,                  -- config: maxPerDay: 20
       updated_at  = now()
 WHERE action_key IN ('referral_qualified', 'referral_vip_conversion');

-- --- 3. FUNCTION CONSTANTS + EGG PAYOUT RULE --------------------------
DO $patch$
DECLARE
    v_def     text;
    v_new     text;
    v_partial constant text :=
        'v_requested := LEAST(v_egg_request, c_egg_monthly_cap - v_egg_month_total);';
    v_allornothing constant text :=
        'IF v_egg_request > c_egg_monthly_cap - v_egg_month_total THEN' || E'\n' ||
        '            RETURN jsonb_build_object(' || E'\n' ||
        '                ''success'', false, ''awarded'', 0, ''requested'', v_egg_request,' || E'\n' ||
        '                ''reason'', ''action_limit'', ''capped'', true,' || E'\n' ||
        '                ''daily_remaining'', v_daily_remaining,' || E'\n' ||
        '                ''monthly_remaining'', v_monthly_remaining,' || E'\n' ||
        '                ''balance_after'', v_balance' || E'\n' ||
        '            );' || E'\n' ||
        '        END IF;' || E'\n' ||
        '' || E'\n' ||
        '        v_requested := v_egg_request;';
BEGIN
    SELECT pg_get_functiondef(p.oid)
      INTO v_def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'award_diamonds_v2';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'patch failed: could not read award_diamonds_v2 definition';
    END IF;

    -- 3a. single-egg ceiling 250 -> 1000
    v_new := regexp_replace(
        v_def,
        'c_egg_max_single\s+constant integer := 250;',
        'c_egg_max_single       constant integer := 1000;'
    );
    IF v_new = v_def THEN
        RAISE EXCEPTION 'patch failed: c_egg_max_single := 250 not found (already patched, or reformatted)';
    END IF;
    v_def := v_new;

    -- 3b. monthly egg budget 500 -> 1000
    v_new := regexp_replace(
        v_def,
        'c_egg_monthly_cap\s+constant integer := 500;',
        'c_egg_monthly_cap      constant integer := 1000;'
    );
    IF v_new = v_def THEN
        RAISE EXCEPTION 'patch failed: c_egg_monthly_cap := 500 not found (already patched, or reformatted)';
    END IF;
    v_def := v_new;

    -- 3c. partial egg payout -> defer the whole egg
    IF position(v_partial in v_def) = 0 THEN
        RAISE EXCEPTION 'patch failed: partial-egg-payout line not found';
    END IF;
    v_def := replace(v_def, v_partial, v_allornothing);

    EXECUTE v_def;
END
$patch$;

-- --- 4. POST-APPLY ASSERTIONS -----------------------------------------
DO $postcheck$
DECLARE
    v_src text;
BEGIN
    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'award_diamonds_v2';

    IF v_src !~ 'c_egg_max_single\s+constant integer := 1000;' THEN
        RAISE EXCEPTION 'post-apply failed: c_egg_max_single is not 1000';
    END IF;
    IF v_src !~ 'c_egg_monthly_cap\s+constant integer := 1000;' THEN
        RAISE EXCEPTION 'post-apply failed: c_egg_monthly_cap is not 1000';
    END IF;
    IF position('v_requested := LEAST(v_egg_request, c_egg_monthly_cap' in v_src) > 0 THEN
        RAISE EXCEPTION 'post-apply failed: partial egg payout still present';
    END IF;

    -- The function must remain service_role only. CREATE OR REPLACE preserves
    -- the ACL, but asserting it here means a future refactor that drops and
    -- recreates the function cannot silently re-open the v1 minting hole.
    IF has_function_privilege('authenticated',
        'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: authenticated can EXECUTE award_diamonds_v2';
    END IF;
    IF has_function_privilege('anon',
        'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: anon can EXECUTE award_diamonds_v2';
    END IF;
    IF NOT has_function_privilege('service_role',
        'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: service_role LOST EXECUTE - rewards are down';
    END IF;

    -- Catalog must now match the JS config.
    IF EXISTS (
        SELECT 1 FROM public.diamond_reward_catalog
         WHERE action_key = 'easter_egg'
           AND (counts_toward_daily_cap OR max_per_day IS DISTINCT FROM 3)
    ) THEN
        RAISE EXCEPTION 'post-apply failed: easter_egg catalog row not aligned';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.diamond_reward_catalog
         WHERE action_key = 'first_training_session' AND lifetime
    ) THEN
        RAISE EXCEPTION 'post-apply failed: first_training_session.lifetime not true';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.diamond_reward_catalog
         WHERE action_key IN ('referral_qualified', 'referral_vip_conversion')
           AND max_per_day IS DISTINCT FROM 20
    ) THEN
        RAISE EXCEPTION 'post-apply failed: referral max_per_day not 20';
    END IF;
END
$postcheck$;

COMMIT;

-- =======================================================================
-- ROLLBACK (paste and run to revert; restores the pre-2026-08-05 behaviour)
-- =======================================================================
-- BEGIN;
--
-- UPDATE public.diamond_reward_catalog
--    SET counts_toward_daily_cap = true, max_per_day = NULL, updated_at = now()
--  WHERE action_key = 'easter_egg';
--
-- UPDATE public.diamond_reward_catalog
--    SET lifetime = false, updated_at = now()
--  WHERE action_key = 'first_training_session';
--
-- UPDATE public.diamond_reward_catalog
--    SET max_per_day = NULL, updated_at = now()
--  WHERE action_key IN ('referral_qualified', 'referral_vip_conversion');
--
-- DO $rb$
-- DECLARE v_def text;
-- BEGIN
--     SELECT pg_get_functiondef(p.oid) INTO v_def
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'award_diamonds_v2';
--     v_def := regexp_replace(v_def, 'c_egg_max_single\s+constant integer := 1000;',
--                             'c_egg_max_single       constant integer := 250;');
--     v_def := regexp_replace(v_def, 'c_egg_monthly_cap\s+constant integer := 1000;',
--                             'c_egg_monthly_cap      constant integer := 500;');
--     -- restore partial payout: replace the all-or-nothing block (from the IF
--     -- through 'v_requested := v_egg_request;') with the original one-liner.
--     v_def := regexp_replace(
--         v_def,
--         'IF v_egg_request > c_egg_monthly_cap - v_egg_month_total THEN[\s\S]*?v_requested := v_egg_request;',
--         'v_requested := LEAST(v_egg_request, c_egg_monthly_cap - v_egg_month_total);'
--     );
--     EXECUTE v_def;
-- END $rb$;
--
-- COMMIT;
