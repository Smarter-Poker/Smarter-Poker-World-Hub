-- Indexes to support fast enrichment pass queries
-- Targets: score < 60, NULLs on event_date, not permanently_ungettable

CREATE INDEX IF NOT EXISTS idx_vdt_completeness_score
    ON venue_daily_tournaments (scrape_completeness_score ASC)
    WHERE human_verified = false;

CREATE INDEX IF NOT EXISTS idx_vdt_event_date_null
    ON venue_daily_tournaments (venue_id, day_of_week)
    WHERE event_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_vdt_venue_id
    ON venue_daily_tournaments (venue_id);

CREATE INDEX IF NOT EXISTS idx_vdt_parent_id
    ON venue_daily_tournaments (parent_tournament_id)
    WHERE parent_tournament_id IS NOT NULL;

-- Partial index for enrichment target: score < 60, not permanently blocked
CREATE INDEX IF NOT EXISTS idx_vdt_needs_enrichment
    ON venue_daily_tournaments (venue_id, scrape_completeness_score)
    WHERE scrape_completeness_score < 60
      AND human_verified = false;
