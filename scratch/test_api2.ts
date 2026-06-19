import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getMlbSupabase } from '../utils/supabase/mlb';

async function run() {
    const sb = getMlbSupabase();
    const { data: games, error } = await sb.from("fact_games")
        .select("game_pk,home_team_id,away_team_id,venue_id,first_pitch_utc")
        .eq("official_date", "2026-06-19").order("first_pitch_utc");
    console.log("error:", error);
    console.log("games length:", games?.length);
}
run();
