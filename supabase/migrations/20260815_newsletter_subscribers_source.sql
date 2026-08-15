-- ═══════════════════════════════════════════════════════════════════════════
-- newsletter_subscribers.source — CHECK 13 phantom-column finding.
--
-- IMPACT: pages/api/news/subscribe.js inserts {email, source} for every NEW
-- subscription; the column never existed, the insert 42703'd and threw, and
-- the handler returned 500 — new newsletter signups have NEVER worked (only
-- re-activation of pre-existing rows succeeded). The code deliberately
-- sanitizes a provenance slug (default 'news_hub'); additive column keeps
-- that design with zero code change.
--
-- Applied to production 2026-08-15 via Supabase MCP apply_migration as
-- 20260815_newsletter_subscribers_source. This file is the auditable mirror.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='newsletter_subscribers' AND column_name='source'
  ) THEN
    RAISE EXCEPTION 'ABORT: newsletter_subscribers.source missing after ALTER';
  END IF;
END $$;

-- ROLLBACK (paste-ready):
-- ALTER TABLE public.newsletter_subscribers DROP COLUMN IF EXISTS source;
