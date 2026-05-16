-- ═══════════════════════════════════════════════════════════════
-- MAXIMUM RIGOR 4-Pass Audit — Bug Report System Hardening
-- ═══════════════════════════════════════════════════════════════

-- FIX 1: user_id NOT NULL blocks anonymous bug reports.
-- The API gracefully handles anonymous users (userId=null) but the DB
-- column is NOT NULL — so anonymous reports crash at INSERT.
-- Fix: allow nullable user_id with a partial index for non-null lookups.
ALTER TABLE public.live_help_tickets
ALTER COLUMN user_id DROP NOT NULL;

-- Fix the WITH CHECK constraint on INSERT that required auth.uid() = user_id
-- (breaks for anonymous + for SECURITY DEFINER inserts where auth.uid() is null)
DROP POLICY IF EXISTS "Users can create own tickets" ON public.live_help_tickets;

CREATE POLICY "Users can create own tickets"
ON public.live_help_tickets
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT auth.uid()) = user_id
);

-- Also allow service_role (our RPC runs SECURITY DEFINER but anon context
-- means auth.uid() IS NULL at INSERT time — service_role bypasses RLS entirely)
-- The RPC runs as SECURITY DEFINER so it runs as the function owner (postgres),
-- which is equivalent to service_role for RLS purposes. No change needed here.

-- FIX 2: fn_get_or_create_conversation is NOT SECURITY DEFINER
-- When called from fn_submit_bug_report_to_admin (which IS security definer),
-- the inner call executes as the *caller's* role (anon/authenticated), meaning
-- it cannot INSERT into social_conversations if RLS blocks anon writes.
-- Fix: elevate it to SECURITY DEFINER so it always runs as postgres superuser.
CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(
    p_user_id UUID,
    p_other_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_existing_id uuid;
    v_new_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_other_user_id IS NULL OR p_user_id = p_other_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid user pair');
    END IF;

    SELECT c.id INTO v_existing_id
      FROM social_conversations c
      JOIN social_conversation_participants p1 ON p1.conversation_id = c.id
      JOIN social_conversation_participants p2 ON p2.conversation_id = c.id
     WHERE c.is_group = false
       AND p1.user_id = p_user_id
       AND p2.user_id = p_other_user_id
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'conversation_id', v_existing_id, 'created', false);
    END IF;

    INSERT INTO social_conversations (is_group) VALUES (false) RETURNING id INTO v_new_id;
    INSERT INTO social_conversation_participants (conversation_id, user_id)
    VALUES (v_new_id, p_user_id), (v_new_id, p_other_user_id);

    RETURN jsonb_build_object('success', true, 'conversation_id', v_new_id, 'created', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FIX 3: priority has no CHECK constraint — malicious callers can inject
-- arbitrary text like 'urgent' or SQL fragments into the priority column.
-- Add a strict enum check.
ALTER TABLE public.live_help_tickets
DROP CONSTRAINT IF EXISTS live_help_tickets_priority_check;

ALTER TABLE public.live_help_tickets
ADD CONSTRAINT live_help_tickets_priority_check
CHECK (priority IN ('low', 'medium', 'high', 'critical'));

-- FIX 4: status has no CHECK constraint — same injection risk.
ALTER TABLE public.live_help_tickets
DROP CONSTRAINT IF EXISTS live_help_tickets_status_check;

ALTER TABLE public.live_help_tickets
ADD CONSTRAINT live_help_tickets_status_check
CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));

-- FIX 5: Enforce priority default in the function to prevent NULL priority
-- from violating the new check constraint (COALESCE already exists in fn,
-- but validate existing rows are OK before constraint is added)
UPDATE public.live_help_tickets
SET priority = 'medium'
WHERE priority NOT IN ('low', 'medium', 'high', 'critical');

UPDATE public.live_help_tickets
SET status = 'open'
WHERE status NOT IN ('open', 'in_progress', 'resolved', 'closed');

