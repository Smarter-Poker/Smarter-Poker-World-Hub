-- ============================================================
-- Backfill is_read column to match read column for all notifications
-- This fixes the badge count persistence bug where notifications
-- had read=true but is_read=NULL, causing the unread count query
-- to still count them as unread.
-- ============================================================

-- Set is_read=true for all notifications where read=true but is_read is false or null
UPDATE public.notifications
SET is_read = true
WHERE read = true
  AND (is_read IS NULL OR is_read = false);

-- Set is_read=false for all notifications where read=false and is_read is null
UPDATE public.notifications
SET is_read = false
WHERE read = false
  AND is_read IS NULL;
