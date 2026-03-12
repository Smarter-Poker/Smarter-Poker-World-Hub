/**
 * Fix remaining 7 horses that ran out of names
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

const EXTRA_NAMES = [
    { name: 'Zane Whitaker', gender: 'male', alias: 'ZaneW_LV' },
    { name: 'Elliot Chambers', gender: 'male', alias: 'elliot.chambers' },
    { name: 'Nina Volkov', gender: 'female', alias: 'NinaV2026' },
    { name: 'Rhonda Baptiste', gender: 'female', alias: 'RhondaBATL' },
    { name: 'Marco Pellegrini', gender: 'male', alias: 'MarcoPMIA' },
    { name: 'Yuki Watanabe', gender: 'female', alias: 'yuki.watanabe' },
    { name: 'Theo Andersen', gender: 'male', alias: 'TheoA_DEN' },
];

async function fixRemaining() {
    // Find horses still with poker-jargon names
    const { data: todayHorses } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id, location')
        .gte('created_at', '2026-03-11T00:00:00')
        .order('id');

    // Filter for remaining poker-jargon names
    const remaining = todayHorses?.filter(h => {
        const name = h.name || '';
        if (!name.includes(' ')) return true;
        const parts = name.split(' ');
        if (parts.some(p => p.length <= 3 && p === p.toUpperCase())) return true;
        if (name.match(/Poker|Grind|Fold|Bluff|Check|Raise|Bet|Call|River|Flop|Turn|Stack|Chip|Card|Table|Seat|Dealer|Muck|Ante|Blind|Pot|Rake|Tilt|Draw|Flush|Straight|Pair|Set|MTT|PLO|HUD|GTO|ICM|EV|SNG/i)) return true;
        return false;
    }) || [];

    console.log(`Remaining horses to fix: ${remaining.length}`);
    if (remaining.length === 0) {
        console.log('✅ All horses have real names!');
        return;
    }

    remaining.forEach((h, i) => console.log(`  ${i+1}. "${h.name}" (alias: ${h.alias})`));

    let fixed = 0;
    for (let i = 0; i < remaining.length && i < EXTRA_NAMES.length; i++) {
        const horse = remaining[i];
        const fix = EXTRA_NAMES[i];

        const { error: authErr } = await supabase
            .from('content_authors')
            .update({ name: fix.name, alias: fix.alias, gender: fix.gender })
            .eq('id', horse.id);

        if (authErr) { console.error(`❌ ${horse.name}:`, authErr.message); continue; }

        if (horse.profile_id) {
            await supabase
                .from('profiles')
                .update({ display_name: fix.name, username: fix.alias })
                .eq('id', horse.profile_id);
        }

        console.log(`  ✅ "${horse.name}" → "${fix.name}" (${fix.gender}) alias: ${fix.alias}`);
        fixed++;
    }

    console.log(`\n✅ Fixed ${fixed} remaining horses`);
}

fixRemaining().catch(console.error);
