-- Slug History Table
-- Tracks old slugs for redirect support + 30-day cooldown after deletion
-- Used by: check-slug.js (cooldown), API GET (redirect), API PUT/DELETE (history insert)
CREATE TABLE IF NOT EXISTS slug_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid REFERENCES social_pages(id) ON DELETE SET NULL,
  old_slug text NOT NULL,
  new_slug text,
  reason text DEFAULT 'changed' CHECK (reason IN ('changed', 'deleted')),
  changed_at timestamptz DEFAULT now()
);

-- Fast lookup by old slug for redirect resolution
CREATE INDEX IF NOT EXISTS idx_slug_history_old_slug ON slug_history(old_slug);
-- Fast lookup by page for history viewing
CREATE INDEX IF NOT EXISTS idx_slug_history_page_id ON slug_history(page_id);

-- Enable RLS
ALTER TABLE slug_history ENABLE ROW LEVEL SECURITY;

-- Public read for redirect resolution
CREATE POLICY "slug_history_public_read" ON slug_history
  FOR SELECT USING (true);

-- Only service role inserts (via API)
CREATE POLICY "slug_history_service_insert" ON slug_history
  FOR INSERT WITH CHECK (true);
