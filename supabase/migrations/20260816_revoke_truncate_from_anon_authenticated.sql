-- 2026-08-16. Revoke TRUNCATE from the two client-facing roles.
--
-- Supabase's bootstrap does `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,
-- authenticated`, and ALL includes TRUNCATE. Measured before this migration:
--   anon          held TRUNCATE on 674 of 737 public tables
--   authenticated held TRUNCATE on 676
-- including public.hand_history (the ~83 GB hand ledger) and
-- public.club_wallet_transactions (the money ledger). public.profiles was
-- already revoked, so hardening had been started and never finished.
--
-- Why RLS does not cover this: row-level security applies to SELECT, INSERT,
-- UPDATE and DELETE. It does NOT apply to TRUNCATE, which is gated solely by
-- the table privilege. No policy — however careful — prevents a TRUNCATE by a
-- role holding the grant, which is why every RLS review here looked past it.
--
-- Honest severity: PostgREST does not expose TRUNCATE, so the publishable key
-- alone cannot fire one. The reachable path is a SECURITY INVOKER function
-- building dynamic SQL from caller input, since such a function runs with the
-- caller's privileges — and 18 SECURITY INVOKER functions containing a dynamic
-- EXECUTE are currently anon-executable. This removes the consequence instead
-- of betting that all 18, and everything added later, are injection-free.
--
-- Safe by construction: no client legitimately truncates a table. Reads and
-- writes are untouched; only TRUNCATE is removed.
--
-- Verified after apply: anon TRUNCATE count 674 -> 1, authenticated 676 -> 1.
-- The residue is PostGIS-owned (spatial_ref_sys, geometry_columns,
-- geography_columns), which this role cannot revoke and which holds no
-- application data. SELECT/INSERT/UPDATE/DELETE counts unchanged; engine still
-- writing hands 0s stale.

DO $$
DECLARE
  r record;
  n_anon int := 0;
  n_auth int := 0;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    IF has_table_privilege('anon', r.tbl, 'TRUNCATE') THEN
      EXECUTE format('REVOKE TRUNCATE ON TABLE %s FROM anon', r.tbl);
      n_anon := n_anon + 1;
    END IF;
    IF has_table_privilege('authenticated', r.tbl, 'TRUNCATE') THEN
      EXECUTE format('REVOKE TRUNCATE ON TABLE %s FROM authenticated', r.tbl);
      n_auth := n_auth + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'TRUNCATE revoked: anon=% tables, authenticated=% tables', n_anon, n_auth;
END $$;

-- Stop the next `GRANT ALL`-style default from silently re-granting it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM authenticated;
