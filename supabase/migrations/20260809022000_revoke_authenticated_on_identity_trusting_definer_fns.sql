-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260809022000_revoke_authenticated_on_identity_trusting_definer_fns.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Third variant of the "side door" pattern, this time for `authenticated`.
--
-- A SECURITY DEFINER function bypasses RLS for whoever can execute it. Three
-- such functions take a user id as a PARAMETER and trust it, with no
-- auth.uid() check, while being executable by every logged-in user. Any
-- authenticated account could therefore read another person's data by
-- passing their uuid:
--
--   fn_get_user_conversations(p_user_id, p_context_entity_id)
--       Returns another user's private DM conversation list: conversation
--       ids, unread counts, and the display name of the other party in each
--       thread. A logged-in attacker could enumerate anyone's messaging.
--
--   sum_diamond_transactions(p_user_id, p_types[], p_start)
--       Returns another user's diamond totals by type and window —
--       financial history.
--
--   fn_send_message(p_conversation_id, p_sender_id, ...)
--       Its internal check verifies that the CLAIMED sender is a participant
--       of the conversation — not that the CALLER is that sender. It
--       therefore blocks posting into a conversation you are not in, but
--       does NOT block impersonating someone who is. Its own comment
--       ("belt-and-suspenders, send-message API already checks") shows the
--       real gate was always the API route, so the function should not have
--       been reachable from a browser at all.
--
-- SAFE TO REVOKE — every caller verified server-side, using the service role,
-- which is unaffected by these grants:
--   fn_get_user_conversations  → pages/api/messenger/get-conversations.js
--                                (its header documents "as service_role")
--   sum_diamond_transactions   → pages/api/live/gift.js,
--                                pages/api/store/diamond-transfer.js
--   fn_send_message            → pages/api/club-arena/approve-cashout.js,
--                                request-cashout.js, home-games/message-host.js,
--                                messenger/broadcast-message.js
-- No browser/client code calls any of the three.
--
-- NOT touched here, because they DO have real browser callers and revoking
-- would break shipping features — recorded for decision instead:
--   get_profile_picture_history(p_user_id)  → src/components/social/
--       ProfilePictureHistory.js passes a userId prop, so it may be an
--       intentional public-profile feature; it returns up to 20 previous
--       profile photos, including ones a user replaced.
--   fn_get_or_create_conversation(p_user_id, p_other_user_id)
--       → src/components/social/SharePostModal.jsx.
-- The correct fix for both is an internal identity pin (resolve the id from
-- auth.uid() unless the caller is service_role) — the pattern already used
-- by has_commander_access in this database — not a revoke.
--
-- Naming `public` in the revoke matters: revoking from a role alone is a
-- no-op when the privilege is actually held by PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- fn_get_user_conversations has two overloads; revoke both.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND p.proname='fn_get_user_conversations'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', r.sig);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'fn_get_user_conversations not found'; END IF;
  RAISE NOTICE 'revoked % overload(s) of fn_get_user_conversations', n;
END $$;

REVOKE EXECUTE ON FUNCTION public.sum_diamond_transactions(uuid, text[], timestamptz)
  FROM public, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_send_message(uuid, uuid, text, text, jsonb)
  FROM public, anon, authenticated;

-- Post-condition: none may remain reachable by anon or authenticated,
-- and service_role must retain EXECUTE on all of them.
DO $$
DECLARE r record; bad text := ''; lost text := '';
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public'
      AND (p.proname = 'fn_get_user_conversations'
        OR (p.proname = 'sum_diamond_transactions' AND p.pronargs = 3)
        OR (p.proname = 'fn_send_message' AND p.pronargs = 5))
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      bad := bad || r.sig || ' ';
    END IF;
    IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      lost := lost || r.sig || ' ';
    END IF;
  END LOOP;

  IF bad <> '' OR lost <> '' THEN
    RAISE EXCEPTION 'post-condition failed. still client-callable:[%]; service_role lost:[%]', bad, lost;
  END IF;
END $$;

COMMIT;
