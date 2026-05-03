-- Phase 40 — Drop dead fn_get_or_create_conversation(uuid, uuid) overload (audit-trail copy)
-- Already applied via Supabase MCP on 2026-05-03.
-- 2 known production bugs (role 'owner' violates check; FK targets wrong table).
-- Only caller was unimported services/MessagingService.js. Live jsonb 3-arg
-- overload survives.
-- See .agent/audits/2026-05-01-conversation-schema-pivot.md (CORRECTION section)
-- and SMARTER-POKER-BUILD-TRACKER.md PHASE 40.
DROP FUNCTION IF EXISTS public.fn_get_or_create_conversation(user1_id uuid, user2_id uuid);
NOTIFY pgrst, 'reload schema';
