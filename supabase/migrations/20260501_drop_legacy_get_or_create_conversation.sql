-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_drop_legacy_get_or_create_conversation.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3                              (DROP FUNCTION)
-- AUTHOR:      Cowork agent
-- AFFECTS:     rpcs: fn_get_or_create_conversation (uuid, uuid) variant only
-- IRREVERSIBLE: yes                            (rollback section below)
--
-- WHY:
--   Same incident class as Phase 29's add_diamonds_to_balance daily-login
--   500 flood. fn_get_or_create_conversation has TWO live overloads:
--
--     1) (p_user_id, p_other_user_id, p_conversation_type) → jsonb
--        — canonical, used by every API route (start-conversation,
--          approve-cashout, request-cashout, messenger.js).
--     2) (user1_id, user2_id)                              → uuid
--        — legacy, was called only from services/MessagingService.js,
--          which has just been pinned to the canonical overload
--          (commit landing alongside this migration).
--
--   PostgREST overload resolution between two same-named functions with
--   different return types and different param names is exactly the
--   ambiguity that caused 30-90 min daily-login 500s before. Drop the
--   legacy overload to make resolution unambiguous.
--
-- HOW (high level):
--   - DROP FUNCTION public.fn_get_or_create_conversation(uuid, uuid)
--   - NOTIFY pgrst to reload schema cache so new requests stop seeing
--     the dropped function.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_legacy_count integer;
    v_canonical_count integer;
BEGIN
    -- Both overloads must currently exist; canonical must stay; legacy must go.
    SELECT COUNT(*) INTO v_legacy_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_get_or_create_conversation'
      AND pg_get_function_arguments(p.oid) = 'user1_id uuid, user2_id uuid';

    SELECT COUNT(*) INTO v_canonical_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_get_or_create_conversation'
      AND pg_get_function_result(p.oid) = 'jsonb';

    IF v_legacy_count = 0 THEN
        RAISE EXCEPTION 'pre-flight failed: legacy overload (user1_id, user2_id) → uuid not found, nothing to drop';
    END IF;
    IF v_canonical_count = 0 THEN
        RAISE EXCEPTION 'pre-flight failed: canonical jsonb overload not found — DO NOT drop the legacy or all callers will break';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGE ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_get_or_create_conversation(uuid, uuid);

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_total integer;
    v_canonical_still_there boolean;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_get_or_create_conversation';

    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_get_or_create_conversation'
          AND pg_get_function_result(p.oid) = 'jsonb'
    ) INTO v_canonical_still_there;

    IF v_total <> 1 THEN
        RAISE EXCEPTION 'post-apply assertion failed: expected exactly 1 overload of fn_get_or_create_conversation, found %', v_total;
    END IF;
    IF NOT v_canonical_still_there THEN
        RAISE EXCEPTION 'post-apply assertion failed: canonical jsonb overload was dropped by mistake';
    END IF;
END $$;

-- ─── 4. SCHEMA-CACHE RELOAD ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a NEW _revert_drop_legacy_*.sql migration if needed)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(
--     user1_id uuid,
--     user2_id uuid
-- )
-- RETURNS uuid
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--     v_conv_id uuid;
-- BEGIN
--     -- Original body of legacy overload — paste from pg_get_functiondef
--     -- snapshot taken before drop. (Captured via:
--     --   SELECT pg_get_functiondef('public.fn_get_or_create_conversation(uuid,uuid)'::regprocedure);
--     -- )
--     RETURN v_conv_id;
-- END;
-- $$;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
