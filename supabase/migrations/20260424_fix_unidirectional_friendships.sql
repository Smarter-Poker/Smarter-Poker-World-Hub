-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Create missing reverse friendship rows
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Root cause: HorseSocialEngine.acceptFriendRequests() was only updating
-- the original row to 'accepted' without creating the reverse row.
-- This caused friend counts to be inconsistent because some friendships
-- had 2 rows (bidirectional, correct) and some had only 1 row.
--
-- This migration creates the missing reverse rows for all accepted
-- friendships that only have a single-direction record.
--
-- Safe to run multiple times (uses NOT EXISTS guard).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO friendships (user_id, friend_id, status, created_at)
SELECT 
    f.friend_id AS user_id,
    f.user_id AS friend_id,
    'accepted' AS status,
    f.created_at
FROM friendships f
WHERE f.status = 'accepted'
AND NOT EXISTS (
    SELECT 1 FROM friendships f2 
    WHERE f2.user_id = f.friend_id 
    AND f2.friend_id = f.user_id
    AND f2.status = 'accepted'
)
ON CONFLICT DO NOTHING;
