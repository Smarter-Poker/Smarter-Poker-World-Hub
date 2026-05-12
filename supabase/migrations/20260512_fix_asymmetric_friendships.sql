-- ══════════════════════════════════════════════════════════════════════════════
-- BUG-6 FIX: Repair asymmetric friendship records
-- 
-- The accept handler previously used INSERT (not UPSERT) to create the reverse
-- friendship row, meaning any unique-constraint collision would silently leave
-- the friendship one-directional. This migration finds all accepted friendship
-- pairs where the reverse row is missing and inserts it.
--
-- Safe to run multiple times (idempotent via ON CONFLICT DO NOTHING).
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO friendships (user_id, friend_id, status, created_at)
SELECT
  f.friend_id AS user_id,
  f.user_id   AS friend_id,
  'accepted'  AS status,
  f.created_at
FROM friendships f
WHERE
  f.status = 'accepted'
  -- Only insert if the reverse row does NOT already exist
  AND NOT EXISTS (
    SELECT 1
    FROM friendships r
    WHERE r.user_id   = f.friend_id
      AND r.friend_id = f.user_id
      AND r.status    = 'accepted'
  )
ON CONFLICT (user_id, friend_id) DO UPDATE
  SET status = 'accepted';
