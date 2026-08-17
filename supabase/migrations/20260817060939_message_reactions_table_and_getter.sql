-- APPLIED TO PRODUCTION 2026-08-17 06:09:39 UTC (version 20260817060939)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Message reactions: the whole feature was non-functional at both ends.
--
--   WRITE  fn_toggle_message_reaction() reads and writes public.message_reactions.
--          That table had never existed, so every call raised
--          "relation message_reactions does not exist".
--   READ   MessagingService.getReactions() calls rpc('get_message_reactions'),
--          which had never existed either. Its error branch returns [] and logs
--          "RPC not available", which is why the UI showed no reactions rather
--          than an error.
--
-- The client also treated the toggle's jsonb return as a bare boolean; that is
-- fixed separately in club-arena ebf494775.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction    text NOT NULL CHECK (length(reaction) BETWEEN 1 AND 32),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_unique_per_user UNIQUE (message_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user    ON public.message_reactions(user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;
CREATE POLICY message_reactions_select ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
       WHERE m.id = message_reactions.message_id
         AND (
              m.sender_id    = auth.uid()
           OR m.recipient_id = auth.uid()
           OR m.receiver_id  = auth.uid()
           OR EXISTS (
                SELECT 1 FROM public.messages m2
                 WHERE m2.conversation_id = m.conversation_id
                   AND (m2.sender_id = auth.uid() OR m2.recipient_id = auth.uid() OR m2.receiver_id = auth.uid())
              )
         )
    )
  );

DROP POLICY IF EXISTS message_reactions_write ON public.message_reactions;
CREATE POLICY message_reactions_write ON public.message_reactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.message_reactions IS
  'Emoji reactions on messenger messages. Written by fn_toggle_message_reaction(), read by get_message_reactions().';

CREATE OR REPLACE FUNCTION public.get_message_reactions(p_message_id uuid)
RETURNS TABLE(reaction text, count integer, user_reacted boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT r.reaction,
         count(*)::integer,
         bool_or(r.user_id = auth.uid())
    FROM public.message_reactions r
   WHERE r.message_id = p_message_id
   GROUP BY r.reaction
   ORDER BY count(*) DESC, r.reaction;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_message_reactions(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_message_reactions(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_message_reactions(uuid) IS
  'Reaction summary for one message. SECURITY INVOKER on purpose - RLS on message_reactions decides what the caller may see.';

DO $assert$
DECLARE v_msg uuid; v_user uuid; v_res jsonb; v_rows int;
BEGIN
  SELECT m.id, m.sender_id INTO v_msg, v_user
    FROM public.messages m WHERE m.sender_id IS NOT NULL ORDER BY m.created_at DESC LIMIT 1;
  IF v_msg IS NULL THEN
    RAISE NOTICE 'no messages present - skipping round-trip assertion';
    RETURN;
  END IF;

  v_res := public.fn_toggle_message_reaction(v_msg, v_user, ':probe:');
  IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE
     OR COALESCE((v_res->>'added')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'toggle did not add the reaction: %', v_res;
  END IF;

  SELECT count(*) INTO v_rows FROM public.message_reactions
   WHERE message_id = v_msg AND user_id = v_user AND reaction = ':probe:';
  IF v_rows <> 1 THEN RAISE EXCEPTION 'expected 1 stored reaction, found %', v_rows; END IF;

  v_res := public.fn_toggle_message_reaction(v_msg, v_user, ':probe:');
  IF COALESCE((v_res->>'added')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'second toggle did not remove the reaction: %', v_res;
  END IF;

  SELECT count(*) INTO v_rows FROM public.message_reactions
   WHERE message_id = v_msg AND reaction = ':probe:';
  IF v_rows <> 0 THEN RAISE EXCEPTION 'probe reaction was not cleaned up (% rows)', v_rows; END IF;

  RAISE NOTICE 'message reactions round-trip verified (add then remove)';
END
$assert$;
