<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
-- Phase 40 — Drop dead fn_get_or_create_conversation(uuid, uuid) overload (audit-trail copy)
-- Already applied via Supabase MCP on 2026-05-03.
-- 2 known production bugs (role 'owner' violates check; FK targets wrong table).
-- Only caller was unimported services/MessagingService.js. Live jsonb 3-arg
-- overload survives.
-- See .agent/audits/2026-05-01-conversation-schema-pivot.md (CORRECTION section)
-- and SMARTER-POKER-BUILD-TRACKER.md PHASE 40.
DROP FUNCTION IF EXISTS public.fn_get_or_create_conversation(user1_id uuid, user2_id uuid);
=======
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
-- ═══════════════════════════════════════════════════════════════════════
-- 20260503_phase40_drop_dead_uuid_overload.sql
-- TIER 3 (function drop)
--
-- Drops the dead fn_get_or_create_conversation(uuid, uuid) → uuid
-- overload. Has 2 production bugs (role 'owner' violates
-- messenger_participants_role_check; FK targets wrong table). Only
-- caller was services/MessagingService.js which is unimported. The
-- jsonb 3-arg overload (the live one targeting social_*) survives.
--
-- See .agent/audits/2026-05-01-conversation-schema-pivot.md for the
-- "no actual pivot, just two-feature carve-out" correction.
--
-- Already applied to production via Supabase MCP apply_migration on 2026-05-03;
-- this file is the audit-trail/reproduction copy.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_get_or_create_conversation'
          AND pg_get_function_identity_arguments(p.oid) = 'user1_id uuid, user2_id uuid'
    ) INTO v_exists;
    IF NOT v_exists THEN RAISE NOTICE 'Pre-flight: uuid overload absent (idempotent)'; RETURN; END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_get_or_create_conversation(user1_id uuid, user2_id uuid);

DO $$
DECLARE v_remaining integer;
BEGIN
    SELECT COUNT(*) INTO v_remaining FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_get_or_create_conversation';
    IF v_remaining <> 1 THEN RAISE EXCEPTION 'Post-apply: expected 1 overload, found %', v_remaining; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_get_or_create_conversation'
          AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_other_user_id uuid, p_conversation_type text'
    ) THEN RAISE EXCEPTION 'Post-apply: jsonb overload not found — wrong overload was dropped'; END IF;
    RAISE NOTICE 'Post-apply: 1 overload survives (jsonb 3-arg, the live one)';
END $$;

<<<<<<< Updated upstream
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
NOTIFY pgrst, 'reload schema';
