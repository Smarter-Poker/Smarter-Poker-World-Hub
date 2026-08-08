-- =======================================================================
-- 20260806180000_deduct_diamonds_writes_both_columns.sql
-- =======================================================================
-- TIER:        3            (money function replaced + data backfill)
-- AUTHOR:      claude (cowork session, 2026-08-06)
-- AFFECTS:     public.deduct_diamonds, public.profiles (2 drifted rows)
-- IRREVERSIBLE: no — ROLLBACK at the bottom
--
-- WHY
-- ───────────────────────────────────────────────────────────────────────
-- profiles carries TWO balance columns: `diamonds` (authoritative — read by
-- award_diamonds_v2, DiamondEngine.getBalance(), the header, the wallet and
-- the store) and `diamond_balance` (a vestigial duplicate). They must move
-- together or they drift.
--
--   add_diamonds_to_balance  writes BOTH.        (correct)
--   award_diamonds_v2        writes BOTH.        (correct, STEP 10)
--   deduct_diamonds          writes ONLY diamonds.  <-- the bug
--
-- So every CREDIT kept the two in step and every DEBIT pushed them apart by
-- the debit amount: game entry fees, trivia lifelines, peer transfers, VIP
-- purchases, live gifts. This is the live mechanical cause of the ~508k
-- historical drift that award_diamonds_v2's STEP 10 comment describes — that
-- comment fixed the symptom in one function while the actual leak stayed open
-- in another.
--
-- Two rows are already drifted in production. They are reconciled below to
-- `diamonds`, the authoritative column, so the fix does not leave the old
-- damage behind.
--
-- HOW
-- ───────────────────────────────────────────────────────────────────────
-- The function body is edited via pg_get_functiondef() + an asserted textual
-- replacement rather than re-pasted in full, so the rest of the function —
-- the idempotency check, the serialized cooldown, the insufficient-funds
-- guard — cannot be altered by transcription. The replacement asserts its
-- target exists first and that the substitution happened, so a whitespace
-- mismatch aborts loudly instead of silently doing nothing.
-- =======================================================================

-- --- 1. PRE-FLIGHT -----------------------------------------------------
DO $preflight$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'deduct_diamonds') THEN
        RAISE EXCEPTION 'pre-flight failed: deduct_diamonds not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
         WHERE proname = 'deduct_diamonds'
           AND position('diamond_balance' in prosrc) > 0
    ) THEN
        RAISE WARNING 'pre-flight: deduct_diamonds already mentions diamond_balance - continuing';
    END IF;
END
$preflight$;

-- --- 2. PATCH THE FUNCTION --------------------------------------------
DO $patch$
DECLARE
    v_def text;
    v_new text;
    v_old_update constant text :=
        'UPDATE profiles' || E'\n' ||
        '     SET diamonds   = diamonds - p_amount,' || E'\n' ||
        '         updated_at = now()';
    v_new_update constant text :=
        'UPDATE profiles' || E'\n' ||
        '     SET diamonds        = diamonds - p_amount,' || E'\n' ||
        '         diamond_balance = diamonds - p_amount,' || E'\n' ||
        '         updated_at      = now()';
BEGIN
    SELECT pg_get_functiondef(p.oid)
      INTO v_def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'deduct_diamonds';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'patch failed: could not read deduct_diamonds definition';
    END IF;

    IF position(v_old_update in v_def) = 0 THEN
        RAISE EXCEPTION 'patch failed: the expected UPDATE profiles block was not found';
    END IF;

    v_new := replace(v_def, v_old_update, v_new_update);
    IF v_new = v_def THEN
        RAISE EXCEPTION 'patch failed: replacement was a no-op';
    END IF;

    EXECUTE v_new;
END
$patch$;

-- --- 3. BACKFILL THE ALREADY-DRIFTED ROWS ------------------------------
-- `diamonds` wins: it is what every read path and every cap calculation uses.
UPDATE public.profiles
   SET diamond_balance = diamonds,
       updated_at      = now()
 WHERE diamonds IS DISTINCT FROM diamond_balance;

-- --- 4. POST-APPLY ASSERTIONS -----------------------------------------
DO $postcheck$
DECLARE
    v_src     text;
    v_drifted integer;
BEGIN
    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'deduct_diamonds';

    IF position('diamond_balance = diamonds - p_amount' in v_src) = 0 THEN
        RAISE EXCEPTION 'post-apply failed: deduct_diamonds still does not write diamond_balance';
    END IF;

    -- The debit itself must be unchanged.
    IF position('diamonds        = diamonds - p_amount' in v_src) = 0 THEN
        RAISE EXCEPTION 'post-apply failed: the diamonds debit was altered';
    END IF;

    SELECT COUNT(*) INTO v_drifted
      FROM public.profiles
     WHERE diamonds IS DISTINCT FROM diamond_balance;
    IF v_drifted > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % rows still drifted', v_drifted;
    END IF;

    -- Still service_role only. A browser-callable debit is not a mint, but it
    -- is a griefing vector against other users' balances.
    IF has_function_privilege('authenticated',
        'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: authenticated can EXECUTE deduct_diamonds';
    END IF;
    IF NOT has_function_privilege('service_role',
        'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: service_role LOST EXECUTE - spending is down';
    END IF;
END
$postcheck$;

-- =======================================================================
-- ROLLBACK (restores the single-column write; re-opens the drift)
-- =======================================================================
-- DO $rb$
-- DECLARE v_def text;
-- BEGIN
--     SELECT pg_get_functiondef(p.oid) INTO v_def
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'deduct_diamonds';
--     v_def := replace(v_def,
--         'SET diamonds        = diamonds - p_amount,' || E'\n' ||
--         '         diamond_balance = diamonds - p_amount,' || E'\n' ||
--         '         updated_at      = now()',
--         'SET diamonds   = diamonds - p_amount,' || E'\n' ||
--         '         updated_at = now()');
--     EXECUTE v_def;
-- END $rb$;
