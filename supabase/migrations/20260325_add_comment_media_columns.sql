-- ═══════════════════════════════════════════════════════════════════════════
-- Add media support to social_comments (GIF + Image attachments)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS media_type TEXT; -- 'gif' | 'image'
