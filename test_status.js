import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const client = createClient(supabaseUrl, supabaseKey);

const test = async () => {
    // Check pipeline_snapshots / snapshot table
    const { data: snaps, error: se } = await client.from('pipeline_snapshots').select('*').order('created_at', { ascending: false }).limit(5);
    console.log('pipeline_snapshots:', snaps, se?.message);
    
    // Check fact_games count
    const { count: gameCount } = await client.from('fact_games').select('*', { count: 'exact', head: true });
    console.log('fact_games total count:', gameCount);
    
    // Most recent game date
    const { data: latestGame } = await client.from('fact_games').select('official_date').order('official_date', { ascending: false }).limit(1);
    console.log('Latest game date:', latestGame?.[0]?.official_date);
    
    // pred_market_output latest
    const { data: latestPred } = await client.from('pred_market_output').select('as_of_ts, game_pk').order('as_of_ts', { ascending: false }).limit(1);
    console.log('Latest pred:', latestPred?.[0]);
    
    // Check raw_odds freshness
    const { data: latestOdds } = await client.from('raw_odds').select('knowledge_time').order('knowledge_time', { ascending: false }).limit(1);
    console.log('Latest odds:', latestOdds?.[0]);
};
test();
