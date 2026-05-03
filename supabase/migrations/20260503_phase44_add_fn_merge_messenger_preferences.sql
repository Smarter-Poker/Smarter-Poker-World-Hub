-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 44 — Add fn_merge_messenger_preferences (referenced but not deployed)
-- ═══════════════════════════════════════════════════════════════════════════
-- Bug: pages/hub/messenger.js calls supabase.rpc('fn_merge_messenger_preferences')
-- twice (push-prompt accept + push-prompt dismiss). The RPC did not exist in
-- pg_proc, so every click hit a "function not found" error. Both call sites
-- have a .catch(async () => SELECT+UPDATE fallback) that masked the failure,
-- so feature worked but created log noise + extra RPC round-trip per click.
--
-- Fix: ship the actual function. Atomic JSONB merge into
-- profiles.messenger_preferences, no read-write race.
--
-- Args:
--   p_user_id uuid     — target profile
--   p_key     text     — preference key (e.g. 'pushPromptHandled')
--   p_value   jsonb    — value (callers pass true; supabase-js coerces to jsonb)
--
-- Applied to production via Supabase MCP on 2026-05-03. This file is the
-- on-disk audit-trail copy. CREATE OR REPLACE makes it idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_merge_messenger_preferences(
    p_user_id uuid,
    p_key     text,
    p_value   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Caller must be the target user (or a service role; service-role bypasses RLS but also bypasses this guard, which is fine).
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'unauthorized: can only update own preferences';
    END IF;

    UPDATE public.profiles
       SET messenger_preferences = jsonb_set(
             COALESCE(messenger_preferences, '{}'::jsonb),
             ARRAY[p_key],
             p_value,
             true
           )
     WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_merge_messenger_preferences(uuid, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_merge_messenger_preferences(uuid, text, jsonb) FROM anon, public;

COMMENT ON FUNCTION public.fn_merge_messenger_preferences(uuid, text, jsonb) IS
    'Atomic JSONB merge into profiles.messenger_preferences. Phase 44 — was previously a JS-only fallback path because this function did not exist.';
