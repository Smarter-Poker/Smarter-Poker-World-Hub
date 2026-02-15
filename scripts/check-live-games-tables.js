require('dotenv').config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sql = `
CREATE TABLE IF NOT EXISTS club_live_games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    page_id UUID NOT NULL,
    game_name TEXT NOT NULL,
    game_type TEXT NOT NULL DEFAULT 'NLH',
    stakes TEXT NOT NULL DEFAULT '1/2',
    max_seats INTEGER NOT NULL DEFAULT 9,
    status TEXT NOT NULL DEFAULT 'open',
    table_number TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS club_game_seats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES club_live_games(id) ON DELETE CASCADE,
    seat_number INTEGER,
    player_id UUID,
    player_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved',
    waitlist_position INTEGER,
    reserved_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    UNIQUE(game_id, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_club_live_games_page_id ON club_live_games(page_id);
CREATE INDEX IF NOT EXISTS idx_club_live_games_status ON club_live_games(status);
CREATE INDEX IF NOT EXISTS idx_club_game_seats_game_id ON club_game_seats(game_id);
CREATE INDEX IF NOT EXISTS idx_club_game_seats_player_id ON club_game_seats(player_id);
`;

async function run() {
    const res = await fetch(url + '/rest/v1/rpc/exec_sql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ sql_string: sql })
    });
    if (res.ok) {
        console.log('Migration applied successfully via exec_sql RPC');
    } else {
        const text = await res.text();
        console.log('exec_sql RPC not available (' + res.status + '), trying pg_query...');
        const res2 = await fetch(url + '/rest/v1/rpc/pg_query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'Authorization': 'Bearer ' + key
            },
            body: JSON.stringify({ query: sql })
        });
        if (res2.ok) {
            console.log('Migration applied via pg_query');
        } else {
            console.log('Need to run migration manually in Supabase Dashboard SQL Editor.');
            console.log('Copy the SQL from: supabase/migrations/20260214_club_live_games.sql');
        }
    }
    // Verify
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(url, key);
    const { error: e1 } = await supabase.from('club_live_games').select('id').limit(1);
    const { error: e2 } = await supabase.from('club_game_seats').select('id').limit(1);
    console.log('club_live_games:', e1 ? 'NOT FOUND' : 'EXISTS');
    console.log('club_game_seats:', e2 ? 'NOT FOUND' : 'EXISTS');
}
run();
