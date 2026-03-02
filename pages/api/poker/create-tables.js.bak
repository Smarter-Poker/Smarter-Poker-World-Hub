/**
 * Create Tables API - Creates poker_venues and tournament_series tables
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' });
    }

    const results = [];

    try {
        // Create poker_venues table
        const venuesSQL = `
            CREATE TABLE IF NOT EXISTS poker_venues (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                venue_type TEXT CHECK (venue_type IN ('casino', 'card_room', 'poker_club', 'home_game')),
                address TEXT,
                city TEXT NOT NULL,
                state TEXT NOT NULL,
                country TEXT DEFAULT 'US',
                phone TEXT,
                website TEXT,
                games_offered TEXT[],
                stakes_cash TEXT[],
                poker_tables INTEGER,
                hours_weekday TEXT,
                hours_weekend TEXT,
                trust_score REAL DEFAULT 4.0,
                is_featured BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                lat REAL,
                lng REAL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(name, city, state)
            );
        `;

        const { error: venuesError } = await supabase.rpc('exec_sql', { sql: venuesSQL });
        if (venuesError) {
            results.push({ table: 'poker_venues', success: false, error: venuesError.message });
        } else {
            results.push({ table: 'poker_venues', success: true });
        }

        // Create tournament_series table
        const seriesSQL = `
            CREATE TABLE IF NOT EXISTS tournament_series (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                short_name TEXT,
                venue_name TEXT,
                location TEXT NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                main_event_buyin NUMERIC,
                main_event_guaranteed NUMERIC,
                total_events INTEGER,
                total_guaranteed NUMERIC,
                website TEXT,
                series_type TEXT CHECK (series_type IN ('major', 'regional', 'circuit', 'online')),
                is_featured BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(name, start_date)
            );
        `;

        const { error: seriesError } = await supabase.rpc('exec_sql', { sql: seriesSQL });
        if (seriesError) {
            results.push({ table: 'tournament_series', success: false, error: seriesError.message });
        } else {
            results.push({ table: 'tournament_series', success: true });
        }

        // Create indexes
        const indexSQL = `
            CREATE INDEX IF NOT EXISTS idx_venues_state ON poker_venues(state);
            CREATE INDEX IF NOT EXISTS idx_venues_city ON poker_venues(city);
            CREATE INDEX IF NOT EXISTS idx_venues_type ON poker_venues(venue_type);
            CREATE INDEX IF NOT EXISTS idx_series_start ON tournament_series(start_date);
            CREATE INDEX IF NOT EXISTS idx_series_type ON tournament_series(series_type);
        `;

        await supabase.rpc('exec_sql', { sql: indexSQL }).catch(() => { });

        return res.status(200).json({
            success: results.every(r => r.success),
            results,
            message: 'Tables created. If errors, run SQL manually in Supabase Dashboard.'
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message, results });
    }
}
