-- ═══════════════════════════════════════════════════════════════════════
-- 20260905120000_content_ledgers_the_fleet_remembers_what_it_posted.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive)
-- AUTHOR:      Claude (Cowork), Fleet Content Programme phase 1
-- AFFECTS:     tables: content_asset_use (new), horse_phrase_ledger (new)
--              rls: both service_role only
-- IRREVERSIBLE: no
--
-- WHY:
--   The horse posting engine (smarter-poker-workers, src/lib/content-engine)
--   remembered what it had posted in two places and both forgot. Asset dedup
--   was `social_posts ... gte(created_at, now-48h).limit(100)` with no ORDER
--   BY: with 100 posts a day the window held ~200 rows and PostgREST handed
--   back an arbitrary hundred, so the same clip landed every other day - in
--   the 30 days to 2026-09-05, 133 poker clips carried 1,337 posts. Caption
--   dedup was a process-local Map in HumanVoiceEngine that reset on every
--   deploy; one sports caption was published verbatim by 26 different horses.
--   Audit: .agent/audits/2026-09-05-horse-content-engine-audit.md (D-03).
--
-- HOW (high level):
--   - content_asset_use: one row per (asset, horse). The UNIQUE index is the
--     rule "a horse never posts the same asset twice"; the platform-wide
--     window (90 days) is applied by the reader.
--   - horse_phrase_ledger: one row per published caption, normalised.
--   - Both seeded from the last 90 days of horse posts so the ledgers start
--     with August's memory rather than empty.
--   - service_role only. The workers service is the only writer; nothing
--     client-side reads these.
--
-- Production DDL policy (Club Arena CLAUDE.md s2): ONE transaction, so the
-- PostgREST schema reload fires once.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ─────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name IN ('content_asset_use','horse_phrase_ledger')) THEN
        RAISE EXCEPTION 'pre-flight failed: ledger table already exists';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='social_posts' AND column_name='link_url') THEN
        RAISE EXCEPTION 'pre-flight failed: social_posts.link_url missing';
    END IF;
END $$;

-- ─── 2. THE CHANGES ────────────────────────────────────────────────────
CREATE TABLE public.content_asset_use (
    id          bigserial PRIMARY KEY,
    asset_key   text        NOT NULL,
    horse_id    uuid        NOT NULL,
    post_id     uuid        NULL,
    used_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.content_asset_use IS
  'Fleet content ledger: which horse posted which asset (yt:<id> | url:<host><path>). UNIQUE (asset_key, horse_id) is the never-twice-per-horse rule; readers apply the platform-wide window. Writer: workers ContentLedger.ts.';
CREATE UNIQUE INDEX content_asset_use_horse_asset_uniq ON public.content_asset_use (asset_key, horse_id);
CREATE INDEX content_asset_use_key_used_idx ON public.content_asset_use (asset_key, used_at DESC);
CREATE INDEX content_asset_use_horse_used_idx ON public.content_asset_use (horse_id, used_at DESC);

CREATE TABLE public.horse_phrase_ledger (
    id          bigserial PRIMARY KEY,
    phrase_norm text        NOT NULL,
    horse_id    uuid        NOT NULL,
    post_id     uuid        NULL,
    used_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.horse_phrase_ledger IS
  'Fleet content ledger: every published horse caption, first line, lower-cased, punctuation stripped. Readers refuse a phrase used by the same horse in 90 days or by any horse in 48 hours. Writer: workers ContentLedger.ts.';
CREATE INDEX horse_phrase_ledger_phrase_used_idx ON public.horse_phrase_ledger (phrase_norm, used_at DESC);
CREATE INDEX horse_phrase_ledger_horse_used_idx ON public.horse_phrase_ledger (horse_id, used_at DESC);

ALTER TABLE public.content_asset_use   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horse_phrase_ledger ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS, anon/authenticated get nothing.

-- Seed the asset ledger from 90 days of horse posts. The key mirrors
-- ContentLedger.assetKeyFor(): YouTube ids collapse to yt:<id>, other links
-- to url:<host><path> with the query stripped.
INSERT INTO public.content_asset_use (asset_key, horse_id, post_id, used_at)
SELECT DISTINCT ON (k.asset_key, sp.author_id)
       k.asset_key, sp.author_id, sp.id, sp.created_at
FROM public.social_posts sp
JOIN public.profiles pr ON pr.id = sp.author_id AND pr.is_horse
CROSS JOIN LATERAL (
    SELECT COALESCE(sp.link_url, sp.media_urls->>0) AS raw
) r
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN r.raw ~ '(youtube\.com/shorts/|youtube\.com/watch\?(.*&)?v=|youtu\.be/|youtube\.com/embed/)[A-Za-z0-9_-]{11}'
            THEN 'yt:' || (regexp_match(r.raw, '(?:youtube\.com/shorts/|youtube\.com/watch\?(?:.*&)?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})'))[1]
        WHEN r.raw ~ '^https?://'
            THEN 'url:' || lower(split_part(split_part(r.raw, '://', 2), '/', 1))
                 || regexp_replace(split_part(regexp_replace(r.raw, '^https?://[^/]+', ''), '?', 1), '/+$', '')
        ELSE NULL
    END AS asset_key
) k
WHERE sp.created_at > now() - interval '90 days'
  AND k.asset_key IS NOT NULL
ORDER BY k.asset_key, sp.author_id, sp.created_at DESC;

-- Seed the phrase ledger from 90 days of horse captions (first line).
INSERT INTO public.horse_phrase_ledger (phrase_norm, horse_id, post_id, used_at)
SELECT n.phrase_norm, sp.author_id, sp.id, sp.created_at
FROM public.social_posts sp
JOIN public.profiles pr ON pr.id = sp.author_id AND pr.is_horse
CROSS JOIN LATERAL (
    SELECT btrim(regexp_replace(regexp_replace(lower(split_part(coalesce(sp.content,''), E'\n', 1)),
                 '[^a-z0-9\s]', '', 'g'), '\s+', ' ', 'g')) AS phrase_norm
) n
WHERE sp.created_at > now() - interval '90 days'
  AND n.phrase_norm <> '';

-- ─── 3. POST-APPLY ASSERTIONS ──────────────────────────────────────────
DO $$
DECLARE v_assets bigint; v_phrases bigint; v_posts bigint;
BEGIN
    SELECT count(*) INTO v_assets  FROM public.content_asset_use;
    SELECT count(*) INTO v_phrases FROM public.horse_phrase_ledger;
    SELECT count(*) INTO v_posts FROM public.social_posts sp
      JOIN public.profiles pr ON pr.id = sp.author_id AND pr.is_horse
     WHERE sp.created_at > now() - interval '90 days';
    IF v_posts > 0 AND v_assets = 0 THEN
        RAISE EXCEPTION 'post-apply failed: % horse posts in 90 days seeded 0 asset rows', v_posts;
    END IF;
    IF v_posts > 0 AND v_phrases < v_posts / 2 THEN
        RAISE EXCEPTION 'post-apply failed: % horse posts seeded only % phrase rows', v_posts, v_phrases;
    END IF;
    RAISE NOTICE 'content ledgers seeded: % asset rows, % phrase rows from % horse posts', v_assets, v_phrases, v_posts;
END $$;

COMMIT;
