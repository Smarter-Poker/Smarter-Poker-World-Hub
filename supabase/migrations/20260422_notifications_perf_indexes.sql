-- ================================================================
-- Notification Performance Indexes
-- ================================================================
-- Without these, every notification query does a full table seq scan
-- on 527+ rows. These indexes make lookups instant regardless of
-- how many notifications accumulate in the table.

-- Primary query pattern: user_id + created_at DESC (used in feed.js)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

-- Secondary: user_id + read (used for unread counts in get-header-stats)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON notifications (user_id, read)
    WHERE read = false;

-- Tertiary: read=false partial index (mark-all-read uses this)
-- Already covered by idx_notifications_user_read

-- page_notifications: follow the same pattern
CREATE INDEX IF NOT EXISTS idx_page_notifications_page_type_created
    ON page_notifications (page_type, page_id, created_at DESC);

-- notification_reads: user + notification_id lookups
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_notif
    ON notification_reads (user_id, notification_id);
