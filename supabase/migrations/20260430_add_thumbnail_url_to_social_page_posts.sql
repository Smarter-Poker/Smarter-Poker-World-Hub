-- social_page_posts mirrors into social_posts (which HAS thumbnail_url) but
-- the source row didn't have its own column. Native club-page rendering
-- loses the thumbnail. Adding it directly on the source table closes the
-- gap. /api/social/pages/posts now also INSERTs thumbnail_url, and the
-- transcode worker back-propagates new URLs to social_page_posts via
-- metadata.source_post_id when it finishes.

ALTER TABLE social_page_posts
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT NULL;
