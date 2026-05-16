-- Remove the legacy 3-arg overload of fn_get_or_create_conversation that conflicts
-- with our call in fn_submit_bug_report_to_admin (ambiguous overload error).
-- The 3-arg version uses a deprecated p_conversation_type param not needed by
-- any current caller. The 2-arg SECURITY DEFINER version is the correct one.
DROP FUNCTION IF EXISTS public.fn_get_or_create_conversation(uuid, uuid, text);
