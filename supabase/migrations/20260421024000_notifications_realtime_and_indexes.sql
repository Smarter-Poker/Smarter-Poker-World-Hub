-- =============================================================
-- Notifications: Performance + Realtime hardening migration
-- =============================================================
-- Author: AG-1 Audit Pass 5
-- Purpose: Composite index for fast user-scoped delete queries,
--          plus ensure Realtime replication is enabled for DELETE events.
-- =============================================================

-- 1. Composite index: (user_id, id) — used by DELETE API query:
--    WHERE user_id = $1 AND id IN (...)
--    Supabase PG planner will use this for O(1) delete by ID per user.
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_id
    ON public.notifications (user_id, id);

-- 2. Composite index: (user_id, created_at DESC) — used by list API:
--    ORDER BY created_at DESC WHERE user_id = $1
--    More efficient than separate indexes for this specific query shape.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications (user_id, created_at DESC);

-- 3. Ensure realtime is enabled for the notifications table
--    (needed for DELETE change events to propagate to the client subscription)
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 4. Ensure the table is in the supabase_realtime publication
--    (idempotent — safe to run multiple times)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

-- =============================================================
-- Notes:
-- REPLICA IDENTITY FULL is required for DELETE realtime events.
-- Without it, payload.old will be empty and our [Audit#3] DELETE
-- subscription handler (which reads payload.old.id) will silently
-- fail to sync deletions across tabs/devices.
-- =============================================================
