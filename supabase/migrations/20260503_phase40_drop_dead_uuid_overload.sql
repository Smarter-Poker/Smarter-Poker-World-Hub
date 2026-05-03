-- ═══════════════════════════════════════════════════════════════════════
-- 20260503_phase40_drop_dead_uuid_overload.sql
-- TIER 3 (function drop)
--
-- Drops the dead fn_get_or_create_conversation(uuid, uuid) → uuid overload.
-- Has 2 production bugs (role 'owner' violates messenger_participants_role_check;
-- FK targets wrong table). Only caller was unimported services/MessagingService.js.
-- The jsonb 3-arg overload (the live one targeting social_*) survives.
--
-- See .agent/audits/2026-05-01-conversation-schema-pivot.md (CORRECTION section)
-- for why the original "pivot" framing was wrong — social_* and messenger_*
-- are distinct features (DMs vs group chat), not competing schemas.
--
-- Already applied to production via Supabase MCP apply_migration on 2026-05-03;
-- this file is the audit-trail / reproduction copy.
-- ═══════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.fn_get_or_create_conversation(user1_id uuid, user2_id uuid);
NOTIFY pgrst, 'reload schema';
