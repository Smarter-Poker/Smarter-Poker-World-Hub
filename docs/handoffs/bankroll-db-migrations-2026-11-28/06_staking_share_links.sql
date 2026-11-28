-- ═══════════════════════════════════════════════════════════════════════
-- 06_staking_share_links.sql
-- Install as: supabase/migrations/<UTC stamp>_staking_share_links.sql
-- DRAFT - NOT INSTALLED. Nothing in this folder has been applied anywhere.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive: new table, RLS, one SECURITY DEFINER reader)
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     tables: public.staking_share_links (new)
--              functions: public.fn_staking_statement(uuid)
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS: none yet. Planned:
--   - Staking Tracker "Share With Backer": insert
--     { arrangement_id, expires_at } into staking_share_links (user_id
--     defaults to auth.uid()), show https://smarter.poker/hub/backer/<token>,
--     and "Revoke" = update revoked_at = now().
--   - A public backer page calling supabase.rpc('fn_staking_statement',
--     { p_token }) with the anon key, totalling the rows with stakingMath.
--
-- WHY:
--   A staked player today exports a CSV and sends it. A backer link shows the
--   deal's current statement without an account, and the player can revoke
--   it or let it expire.
--
-- HOW:
--   - staking_share_links(token uuid PK default gen_random_uuid(),
--     arrangement_id -> staking_arrangements ON DELETE CASCADE, user_id ->
--     auth.users ON DELETE CASCADE default auth.uid(), created_at,
--     expires_at default now() + 30 days (must be after created_at),
--     revoked_at).
--   - RLS: the owner selects, creates, updates and deletes only their own
--     links, and may only create/move a link for an arrangement they own.
--     anon has no table rights at all.
--   - fn_staking_statement(p_token): SECURITY DEFINER, STABLE, search_path
--     pinned. When the token exists, is not revoked, has not expired, and
--     its arrangement still belongs to the link's owner, it returns that
--     deal's statement rows: entry_date, category, gross_result,
--     player_share, backer_share, makeup_before, makeup_after, in played
--     order (entry_date, start_time, staking row created_at, ledger id - the
--     order stakingMath replayStakingDeal uses). Nothing else: no names,
--     emails, phones, notes, venues, amounts in/out, ids or other deals.
--     Any invalid token returns zero rows (no error), so a caller cannot tell
--     "revoked" from "never existed".
--   - The shares are the stored staking_sessions values, which the owner's
--     Staking Tracker rewrites to the played-order replay on every load
--     (loadStakingDeal). An owner edit not yet followed by a Tracker load can
--     lag; the backer page should show "As of the player's last update".
--   - EXECUTE granted to anon and authenticated, revoked from PUBLIC.
--
-- RATE LIMITING: PostgREST has no per-function rate limit, and Supabase's
--   auth rate limits do not cover rpc. Tokens are random v4 UUIDs (122 bits),
--   so guessing one is not feasible; the limit protects cost, not secrecy.
--   Serve the backer page through a Next API route that calls this function
--   server-side with a per-IP and per-token limit, rather than exposing the
--   rpc to the browser directly, and keep links short-lived (30-day
--   default). The token is a bearer secret: never log it in full.
--
-- BREAK WINDOW: the database refuses DDL from :50 to :03 UTC every hour.
-- Run `date -u` first; a refused run applied nothing - apply ONCE after :03.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.staking_share_links') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.staking_share_links already exists (installed already?)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'fn_staking_statement') THEN
    RAISE EXCEPTION 'pre-flight failed: fn_staking_statement already exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'staking_sessions' AND column_name = 'ledger_entry_id') THEN
    RAISE EXCEPTION 'pre-flight failed: staking_sessions.ledger_entry_id not found';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staking_arrangements'::regclass) THEN
    RAISE EXCEPTION 'pre-flight failed: RLS is off on staking_arrangements';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
CREATE TABLE public.staking_share_links (
  token          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arrangement_id uuid NOT NULL REFERENCES public.staking_arrangements(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at     timestamptz,
  CONSTRAINT staking_share_links_expires_after_created CHECK (expires_at > created_at)
);

COMMENT ON TABLE public.staking_share_links IS
  'Bearer links that let a backer read one staking deal''s statement via fn_staking_statement. Owner-managed under RLS. 2026-11-28.';

CREATE INDEX staking_share_links_user_idx ON public.staking_share_links (user_id, created_at DESC);
CREATE INDEX staking_share_links_arrangement_idx ON public.staking_share_links (arrangement_id);

ALTER TABLE public.staking_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own share links"
  ON public.staking_share_links FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Owners create share links for own deals"
  ON public.staking_share_links FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.staking_arrangements a
                WHERE a.id = arrangement_id AND a.user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Owners update own share links"
  ON public.staking_share_links FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.staking_arrangements a
                WHERE a.id = arrangement_id AND a.user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Owners delete own share links"
  ON public.staking_share_links FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.staking_share_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staking_share_links TO authenticated;

CREATE FUNCTION public.fn_staking_statement(p_token uuid)
RETURNS TABLE (
  entry_date    date,
  category      text,
  gross_result  numeric,
  player_share  numeric,
  backer_share  numeric,
  makeup_before numeric,
  makeup_after  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
  SELECT l.entry_date, l.category, s.gross_result, s.player_share, s.backer_share,
         s.makeup_before, s.makeup_after
    FROM public.staking_share_links k
    JOIN public.staking_arrangements a ON a.id = k.arrangement_id AND a.user_id = k.user_id
    JOIN public.staking_sessions s ON s.arrangement_id = a.id
    JOIN public.bankroll_ledger l ON l.id = s.ledger_entry_id AND l.user_id = k.user_id
   WHERE p_token IS NOT NULL
     AND k.token = p_token
     AND k.revoked_at IS NULL
     AND k.expires_at > now()
   ORDER BY l.entry_date, l.start_time NULLS FIRST, s.created_at NULLS FIRST, s.ledger_entry_id
$fn$;

COMMENT ON FUNCTION public.fn_staking_statement(uuid) IS
  'Backer statement for a valid, unrevoked, unexpired staking_share_links token: dates, category, gross, shares, makeup only. Zero rows otherwise. 2026-11-28.';

REVOKE ALL ON FUNCTION public.fn_staking_statement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_staking_statement(uuid) TO anon, authenticated;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staking_share_links'::regclass) THEN
    RAISE EXCEPTION 'post-apply: RLS is off on staking_share_links';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staking_share_links') <> 4 THEN
    RAISE EXCEPTION 'post-apply: expected 4 owner policies on staking_share_links';
  END IF;
  IF has_table_privilege('anon', 'public.staking_share_links', 'SELECT')
     OR has_table_privilege('anon', 'public.staking_share_links', 'INSERT') THEN
    RAISE EXCEPTION 'post-apply: anon holds a right on staking_share_links';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_staking_statement(uuid)'::regprocedure)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.fn_staking_statement(uuid)'::regprocedure
                    AND proconfig::text LIKE '%search_path=%') THEN
    RAISE EXCEPTION 'post-apply: fn_staking_statement must be SECURITY DEFINER with a pinned search_path';
  END IF;
  IF NOT has_function_privilege('anon', 'public.fn_staking_statement(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_staking_statement(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: anon and authenticated must be able to execute fn_staking_statement';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fn_staking_statement(gen_random_uuid())) THEN
    RAISE EXCEPTION 'post-apply: an unknown token returned statement rows';
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (invalidates every shared link):
-- BEGIN;
-- SET LOCAL lock_timeout = '2s';
-- DROP FUNCTION IF EXISTS public.fn_staking_statement(uuid);
-- DROP TABLE IF EXISTS public.staking_share_links;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════════════
