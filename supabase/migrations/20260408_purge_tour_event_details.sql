-- ============================================================
-- FULL PURGE: tour_event_details
-- Reason: ALL rows were fabricated by scrape_full_coverage.py
--         using hardcoded templates and invented venue names.
--         No real scraping was performed. Zero data is valid.
-- Date: 2026-04-08
-- ============================================================

TRUNCATE TABLE tour_event_details RESTART IDENTITY CASCADE;
