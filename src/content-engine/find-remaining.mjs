/**
 * Find and fix ALL remaining jargon names by querying ALL horses added today
 * that STILL have jargon names (checking the current DB state)
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

async function findRemaining() {
    // Get ALL today's horses AGAIN to see current state
    const { data } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id, location, created_at')
        .gte('created_at', '2026-03-11T00:00:00')
        .order('id');

    console.log(`Total today: ${data?.length}\n`);

    // Simple check: real name = 2+ words, both words >= 2 chars, no common jargon
    const JARGON_WORDS = /Fold|Bluff|Bet|Call|Raise|Pot|Chip|Stack|Grind|Table|Seat|Muck|Ante|Blind|Rake|Tilt|Draw|Flush|Straight|Pair|Set|Trip|Quad|GTO|ICM|EV|PLO|MTT|SNG|HUD|CBet|SPR|Straddle|Turbo|Rebuy|Addon|Bubble|Bounce|LateReg|MainEvent|SatPlayer|CashKing|Tourney|Freeze|Prog|Bounty|KnockOut|Jackpot|Spin|Session|Lag|Nit|Aggro|Passive|Tight|Loose|Value|Exploit|Float|Implied|Semi|Barrel|Probe|Delayed|Pure|Reverse|Balance|Nash|Under|Over|Thin|Equity|Variance|Swing|Coach|Review|Reconnect|Observer|Sweat|Tracker|History|Data|Numbers|Break/i;

    const jargon = data?.filter(h => {
        const name = h.name || '';
        if (!name.includes(' ')) return true; // single word
        if (JARGON_WORDS.test(name)) return true;
        const parts = name.split(' ');
        if (parts.some(p => p.length <= 3 && p === p.toUpperCase())) return true;
        return false;
    }) || [];

    console.log(`Still jargon: ${jargon.length}`);
    jargon.forEach((h, i) => console.log(`${String(i+1).padStart(3)}. id=${h.id} "${h.name}" alias=${h.alias}`));

    // Check for actual duplicates
    const nameCounts = {};
    for (const h of data || []) {
        nameCounts[h.name] = (nameCounts[h.name] || 0) + 1;
    }
    const dupes = Object.entries(nameCounts).filter(([,c]) => c > 1);
    if (dupes.length > 0) {
        console.log(`\nDuplicate names: ${dupes.length}`);
        dupes.forEach(([name, count]) => console.log(`  "${name}" x${count}`));
    }

    // Gender
    const m = data?.filter(h => h.gender === 'male').length || 0;
    const f = data?.filter(h => h.gender === 'female').length || 0;
    console.log(`\nGender: ${m} male / ${f} female`);
}

findRemaining().catch(console.error);
