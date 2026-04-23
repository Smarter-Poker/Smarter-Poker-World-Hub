-- Migration: Drop FK constraint blocking reel likes
-- 
-- Problem: social_likes.post_id had a FK → social_posts.id
-- When a user likes a social_reels row (UUID not in social_posts), the INSERT fails
-- with a FK violation error. Reel likes have silently failed since the table was created.
--
-- Fix: Drop the restrictive FK. social_likes.post_id is a polymorphic ID
-- (can reference social_posts OR social_reels), so no FK constraint is correct.

ALTER TABLE social_likes
    DROP CONSTRAINT IF EXISTS social_likes_post_id_fkey;
