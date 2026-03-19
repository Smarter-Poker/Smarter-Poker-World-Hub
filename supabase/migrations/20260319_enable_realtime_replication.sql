-- ═══════════════════════════════════════════════════════════════════════════════
-- Enable Supabase Realtime replication for PostgresSync tables
-- ═══════════════════════════════════════════════════════════════════════════════
-- These tables are subscribed to by Club Arena's PostgresSyncHooks.ts
-- Without replication enabled, realtime channels get CHANNEL_ERROR
-- ═══════════════════════════════════════════════════════════════════════════════

-- Use IF NOT EXISTS pattern: check if table is already in publication before adding
DO $$
BEGIN
    -- wallets (financial integrity — instant balance updates)
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'wallets') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
        RAISE NOTICE 'Added wallets to supabase_realtime';
    END IF;

    -- profiles (user display name, avatar changes)
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
        RAISE NOTICE 'Added profiles to supabase_realtime';
    END IF;

    -- clubs (club settings, name changes)
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'clubs') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE clubs;
        RAISE NOTICE 'Added clubs to supabase_realtime';
    END IF;

    -- unions (union settings changes)
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'unions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE unions;
        RAISE NOTICE 'Added unions to supabase_realtime';
    END IF;

    -- tables (game table creation, status changes)
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tables') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tables;
        RAISE NOTICE 'Added tables to supabase_realtime';
    END IF;

    -- tournaments (tournament status, registration changes)
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tournaments') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
        RAISE NOTICE 'Added tournaments to supabase_realtime';
    END IF;

    -- user_table_settings: skipped — table does not exist yet

    -- club_members (membership changes, role updates)
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'club_members') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE club_members;
        RAISE NOTICE 'Added club_members to supabase_realtime';
    END IF;
END $$;
