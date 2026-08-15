#!/usr/bin/env node
/**
 * Apply all pending video library migrations to Supabase production DB.
 * Run: node scripts/apply_video_migrations.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    query_timeout: 30000,
});

async function run() {
    const client = await pool.connect();
    console.log('Connected to production database');

    try {
        // ── Migration 1: tags column on video_library_videos ─────────────
        console.log('\n[1/5] Adding tags column to video_library_videos...');
        await client.query(
            "ALTER TABLE video_library_videos ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;"
        );
        console.log('✅ tags column ready');

        // ── Migration 2: video_playlists table ───────────────────────────
        console.log('\n[2/5] Creating video_playlists table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS video_playlists (
                id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                name       TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ video_playlists created');

        // ── Migration 3: video_playlist_items table ──────────────────────
        console.log('\n[3/5] Creating video_playlist_items table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS video_playlist_items (
                id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                playlist_id UUID NOT NULL REFERENCES video_playlists(id) ON DELETE CASCADE,
                video_id    TEXT NOT NULL,
                video_title TEXT,
                video_source TEXT,
                sort_order  INTEGER DEFAULT 0,
                created_at  TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(playlist_id, video_id)
            )
        `);
        console.log('✅ video_playlist_items created');

        // ── RLS on playlist tables ───────────────────────────────────────
        await client.query('ALTER TABLE video_playlists ENABLE ROW LEVEL SECURITY');
        await client.query('ALTER TABLE video_playlist_items ENABLE ROW LEVEL SECURITY');

        // Drop+recreate RLS policies (idempotent)
        await client.query('DROP POLICY IF EXISTS "Users can manage their own playlists" ON video_playlists');
        await client.query(`
            CREATE POLICY "Users can manage their own playlists"
            ON video_playlists FOR ALL
            USING (auth.uid() = user_id)
        `);

        await client.query('DROP POLICY IF EXISTS "Users can manage their own playlist items" ON video_playlist_items');
        await client.query(`
            CREATE POLICY "Users can manage their own playlist items"
            ON video_playlist_items FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM video_playlists
                    WHERE id = video_playlist_items.playlist_id
                    AND user_id = auth.uid()
                )
            )
        `);
        console.log('✅ Playlist RLS policies applied');

        // ── Migration 4: extend video_analysis for the library analyze API ─
        console.log('\n[4/5] Adding video_id + library columns to video_analysis...');
        await client.query('ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS video_id TEXT');
        await client.query('ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS video_title TEXT');
        await client.query('ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS analysis JSONB');
        await client.query('ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS has_transcript BOOLEAN DEFAULT false');
        await client.query('ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS transcript_length INTEGER DEFAULT 0');
        console.log('✅ video_analysis columns extended');

        // Unique index on video_id for the upsert { onConflict: 'video_id' }
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_video_analysis_video_id_unique
            ON video_analysis(video_id)
            WHERE video_id IS NOT NULL
        `);
        console.log('✅ video_analysis.video_id unique index ready');

        // RLS addendum: allow service role to write library analysis rows
        await client.query('DROP POLICY IF EXISTS "video_analysis_service_write" ON video_analysis');
        await client.query(`
            CREATE POLICY "video_analysis_service_write"
            ON video_analysis FOR ALL TO service_role
            USING (true) WITH CHECK (true)
        `);

        // Allow anon/authed users to read analysis by video_id
        await client.query('DROP POLICY IF EXISTS "video_analysis_public_read" ON video_analysis');
        await client.query(`
            CREATE POLICY "video_analysis_public_read"
            ON video_analysis FOR SELECT
            USING (true)
        `);
        console.log('✅ video_analysis RLS extended');

        // ── Migration 5: add indexes for playlist queries ────────────────
        console.log('\n[5/5] Adding playlist query indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_video_playlists_user_id
            ON video_playlists(user_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_video_playlist_items_playlist_id
            ON video_playlist_items(playlist_id)
        `);
        console.log('✅ Playlist indexes created');

        console.log('\n════════════════════════════════════════');
        console.log(' ALL MIGRATIONS APPLIED SUCCESSFULLY ✓');
        console.log('════════════════════════════════════════\n');

    } catch (err) {
        console.error('\n❌ MIGRATION FAILED:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

run();
