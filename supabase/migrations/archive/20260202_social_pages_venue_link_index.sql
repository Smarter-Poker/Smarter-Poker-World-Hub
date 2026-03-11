-- ═══════════════════════════════════════════════════════════════════════════
-- Social Pages: linked_venue_id index + type safety
-- Ensures fast lookups when venue detail pages check for linked social pages
-- linked_venue_id is TEXT by design (stores integer venue IDs as strings)
-- ═══════════════════════════════════════════════════════════════════════════

-- Add index for fast venue-to-social-page lookups
CREATE INDEX IF NOT EXISTS idx_social_pages_linked_venue_id
    ON social_pages(linked_venue_id)
    WHERE linked_venue_id IS NOT NULL;

-- Add index for page_type + linked_venue_id compound lookups
CREATE INDEX IF NOT EXISTS idx_social_pages_venue_type_link
    ON social_pages(page_type, linked_venue_id)
    WHERE linked_venue_id IS NOT NULL;
