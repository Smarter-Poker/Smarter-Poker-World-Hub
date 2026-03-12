/**
 * Find remaining horses with non-real names
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

async function checkRemaining() {
    const { data: todayHorses } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id')
        .gte('created_at', '2026-03-11T00:00:00')
        .order('name');

    console.log(`Total today's horses: ${todayHorses?.length}\n`);

    // Check for non-real names - real names have 2+ words, all words >= 2 chars, no abbreviations
    const suspicious = todayHorses?.filter(h => {
        const name = h.name || '';
        const parts = name.split(' ');
        // Single word
        if (parts.length === 1) return true;
        // Any word <= 3 chars that looks like abbreviation
        if (parts.some(p => p.length <= 3 && p === p.toUpperCase())) return true;
        // Contains poker jargon
        if (name.match(/Poker|Grind|Fold|Bluff|Check|Raise|Bet|Call|River|Flop|Turn|Stack|Chip|Card|Table|Seat|Dealer|Muck|Ante|Blind|Pot|Rake|Tilt|Bust|Draw|Flush|Straight|Full House|Royal|Pair|Set|Trip|Quad|Ace|King|Queen|Jack|MTT|PLO|HUD|GTO|ICM|EV|SNG|Sit.*Go/i)) return true;
        return false;
    }) || [];

    console.log(`Still suspicious names: ${suspicious.length}\n`);
    suspicious.forEach((h, i) => {
        console.log(`${String(i+1).padStart(3)}. "${h.name}" (alias: ${h.alias}, gender: ${h.gender})`);
    });

    // Show gender breakdown
    const males = todayHorses?.filter(h => h.gender === 'male').length || 0;
    const females = todayHorses?.filter(h => h.gender === 'female').length || 0;
    console.log(`\nGender: ${males} male / ${females} female`);
}

checkRemaining().catch(console.error);
