-- 20261006043212_hendon_sync_runs_carry_a_one_run_token.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Applied to production as version 20261006043212 (reserved as 20261006043154,
-- the version its table comment names).
-- TIER:         2 (new table, no data)
-- AUTHOR:       Claude, privacy follow-ups 2026-10-06
-- AFFECTS:      public.hendon_sync_tokens (new)
-- IRREVERSIBLE: no
--
-- WHY:
--   /api/hendonmob/auto-sync pasted HENDON_AUTO_SYNC_SECRET into every prompt
--   it sent to Manus (a third party) as the credential for the callback
--   /api/hendonmob/auto-sync-receive, so a standing secret that both STARTS
--   the paid all-user scrape and WRITES any profile's HendonMob stats sat in
--   Manus's task history. Each run now mints a random one-run token, stores
--   only its SHA-256 here with the accounts the run queued and an expiry, and
--   the receive endpoint accepts it only for those accounts until it expires.
--
-- HOW:
--   Creates the table with RLS on and no grant to anon or authenticated:
--   only the service role (the two API routes) reads or writes it.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.hendon_sync_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_ids    uuid[] NOT NULL CHECK (cardinality(user_ids) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '2 days')
);

COMMENT ON TABLE public.hendon_sync_tokens IS
  'One-run callback tokens for the HendonMob Manus sync: SHA-256 of a random token, the accounts that run may write HendonMob stats for, and an expiry. Service role only. Migration 20261006043154.';

ALTER TABLE public.hendon_sync_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hendon_sync_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hendon_sync_tokens TO service_role;

DO $post$
BEGIN
  IF has_table_privilege('authenticated', 'public.hendon_sync_tokens', 'SELECT')
     OR has_table_privilege('anon', 'public.hendon_sync_tokens', 'SELECT') THEN
    RAISE EXCEPTION 'hendon_sync_tokens must not be readable by a browser role';
  END IF;
END
$post$;

COMMIT;
