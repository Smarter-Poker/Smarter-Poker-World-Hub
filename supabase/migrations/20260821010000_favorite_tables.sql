-- ═══════════════════════════════════════════════════════════════════════
-- 20260821010000_favorite_tables.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Cowork (Claude)
-- AFFECTS:     tables: public.favorite_tables (new)   rpcs: -   rls: new policies
-- IRREVERSIBLE: no                            (see ROLLBACK at the bottom)
--
-- WHY:
--   FavoriteTablesWidget is mounted in ClubLobby and runs on every lobby load.
--   It reads and deletes from `favorite_tables`, and there is no such table in
--   the database — so the widget has never listed a favourite and its remove
--   button has never removed one. Found by diffing every .from() target in the
--   client against the live schema (12 missing; this is one of the two that is
--   actually mounted and user-facing).
--
--   The widget is complete otherwise: it renders the list, scopes the delete to
--   the authenticated user, and reports its own errors. It only ever needed the
--   table underneath it.
--
-- HOW (high level):
--   - favorite_tables(user_id, table_id) with a uniqueness constraint, so
--     favouriting twice is a no-op rather than a duplicate row.
--   - Both FKs cascade: a deleted account or a deleted table takes its
--     favourites with it rather than leaving rows pointing at nothing.
--   - RLS: a row is visible and writable only by the user it belongs to.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tables'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.tables not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'favorite_tables'
    ) THEN
        RAISE NOTICE 'pre-flight: favorite_tables already exists; this is a no-op';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.favorite_tables (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    table_id   uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT favorite_tables_user_table_unique UNIQUE (user_id, table_id)
);

COMMENT ON TABLE public.favorite_tables IS
    'A player''s starred tables. Read by FavoriteTablesWidget in the club lobby.';

-- The widget's only query is "every favourite for this user", so that is the
-- index. The unique constraint already covers (user_id, table_id) lookups.
CREATE INDEX IF NOT EXISTS favorite_tables_user_idx
    ON public.favorite_tables (user_id, created_at DESC);

ALTER TABLE public.favorite_tables ENABLE ROW LEVEL SECURITY;

-- Own rows only, on every verb. A favourite is private to the player who set
-- it; there is no reason for anyone else to read or write one.
DROP POLICY IF EXISTS favorite_tables_select_own ON public.favorite_tables;
CREATE POLICY favorite_tables_select_own
    ON public.favorite_tables FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS favorite_tables_insert_own ON public.favorite_tables;
CREATE POLICY favorite_tables_insert_own
    ON public.favorite_tables FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS favorite_tables_delete_own ON public.favorite_tables;
CREATE POLICY favorite_tables_delete_own
    ON public.favorite_tables FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, DELETE ON public.favorite_tables TO authenticated;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    n_policies integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'favorite_tables'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: favorite_tables was not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'favorite_tables' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'post-apply failed: RLS is not enabled on favorite_tables';
    END IF;

    SELECT count(*) INTO n_policies
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'favorite_tables';
    IF n_policies < 3 THEN
        RAISE EXCEPTION 'post-apply failed: expected 3 policies, found %', n_policies;
    END IF;
END $$;

COMMIT;

-- ─── ROLLBACK ─────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.favorite_tables;
