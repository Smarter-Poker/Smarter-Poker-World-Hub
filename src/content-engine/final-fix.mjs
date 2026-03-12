/**
 * Fix last ~14 horses + sync profiles.full_name for ALL today's horses
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

const JARGON = /ThreeBet|NutFlush|SnapCall|SetMiner|PocketPair|RiverRat|StraightDraw|OverBet|BottomPair|FlushDraw|OverPair|CheckBack|SplitPot|UnderPair|TopPair|SecondPair|BlockBet|PotControl|DonkBet|Squeeze|ColdCall|Exploit|Balanced|PostFlop|AnteUp|XRaise|CBet|SPR|Straddle|BombPot|DoubleBoard|EffStack|StackDepth|JamShove|StealBlind|Resteal|RiverBluff|TurnBet|PreFlop|MPGrinder|BBSpecial|SBWarrior|HeadsUp|ShortDeck|PLO|DeepStack|ChipDown|ChipUp|ShortStack|BigStack|MedStack|ShallowStack|Turbo|BreakEven|Hyper|SideEvent|Promo|RakeBack|MainEvent|BonusHunter|Sat|CashKing|Tourney|Freeze|Prog|Bounty|KnockOut|Jackpot|Spin|SNG|Rebuy|LateReg|Addon|Bubble|BigBlind|SmallBl|RakeHunter|TableCap|Dealer|AvgStack|ChipLead|FinalTable|ShortChip|NitCorner|Tag|Tricky|Maniac|Vol|Grinder|Loose|Solid|Session|Lag|Folding|Betting|Aggro|Passive|Tight|Bluff|Calling|Value|Raising|PotOdds|Probe|Delayed|Pure|Reverse|Float|Implied|Semi|Barrel|Fold|Under|GTO|Nash|Over|Thin|Chip|ICM|Real|Play|Rec|Roller|Nano|Micro|High|Mid|Low|Nit|Early|Table|Seat|Off|Peak|Weekend|TopUp|Wait|Auto|Night|Sit|Cash|Muck|Quick|Post|RunIt|Show|Coach|Time|Snap|Disconnect|Rail|Review|Reconnect|Observer|Sweat|Hand|Stat|Up|Down|Swing|Variance|HUD|Data|Numbers|Break|Full|Six|Polar|Linear|BetSize|RestealRob|CallingMachine|PassivePete|AggroAndy|BettingBeast|FoldingFiona|RaisingRita|TrickyTom/i;

const LAST_NAMES = [
    { n: 'Dominic Castellano', g: 'male' },
    { n: 'Leonard Whitmore', g: 'male' },
    { n: 'Marcus Beaumont', g: 'male' },
    { n: 'Nathaniel Spence', g: 'male' },
    { n: 'Raymond Colbert', g: 'male' },
    { n: 'Simon Wainwright', g: 'male' },
    { n: 'Theodore Bingham', g: 'male' },
    { n: 'Veronica Ashworth', g: 'female' },
    { n: 'Whitney Maxwell', g: 'female' },
    { n: 'Yvonne Cartwright', g: 'female' },
    { n: 'Zara Holloway', g: 'female' },
    { n: 'Ramona Sedgwick', g: 'female' },
    { n: 'Phoebe Garland', g: 'female' },
    { n: 'Octavia Drummond', g: 'female' },
    { n: 'Lydia Crestwell', g: 'female' },
    { n: 'Wallace Tremaine', g: 'male' },
    { n: 'Rodney Culpepper', g: 'male' },
    { n: 'Bryant Featherstone', g: 'male' },
    { n: 'Cassandra Ridgeway', g: 'female' },
    { n: 'Deirdre Ashcroft', g: 'female' },
];

async function finalFix() {
    console.log('🐴 FINAL FIX + PROFILE SYNC\n');

    // 1. Get all today's horses
    const { data: todayHorses } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id, location')
        .gte('created_at', '2026-03-11T00:00:00')
        .order('id');

    console.log(`Total today's horses: ${todayHorses?.length}\n`);

    // 2. Find remaining jargon names
    const remaining = todayHorses?.filter(h => {
        const name = h.name || '';
        if (JARGON.test(name)) return true;
        if (!name.includes(' ')) return true;
        const parts = name.split(' ');
        if (parts.length === 2 && parts[1].length <= 3 && parts[1] === parts[1].toUpperCase()) return true;
        return false;
    }) || [];

    console.log(`Remaining jargon names: ${remaining.length}`);
    remaining.forEach((h, i) => console.log(`  ${i+1}. "${h.name}" → alias: ${h.alias}`));

    // Get existing names/aliases
    const { data: all } = await supabase.from('content_authors').select('name, alias');
    const usedNames = new Set((all || []).map(h => h.name?.toLowerCase()));
    const usedAliases = new Set((all || []).map(h => h.alias?.toLowerCase()));
    for (const h of remaining) {
        usedNames.delete(h.name?.toLowerCase());
        usedAliases.delete(h.alias?.toLowerCase());
    }

    let fixed = 0;
    let nameIdx = 0;
    for (const horse of remaining) {
        let entry;
        while (nameIdx < LAST_NAMES.length) {
            entry = LAST_NAMES[nameIdx++];
            if (!usedNames.has(entry.n.toLowerCase())) break;
            entry = null;
        }
        if (!entry) break;

        usedNames.add(entry.n.toLowerCase());

        const first = entry.n.split(' ')[0];
        const last = entry.n.split(' ').slice(-1)[0];
        let alias = `${first.toLowerCase()}.${last.toLowerCase()}`;
        let tries = 0;
        while (usedAliases.has(alias.toLowerCase()) && tries < 10) {
            alias = `${first.toLowerCase()}${last.slice(0,3).toLowerCase()}${Math.floor(Math.random()*99)+1}`;
            tries++;
        }
        usedAliases.add(alias.toLowerCase());

        await supabase.from('content_authors')
            .update({ name: entry.n, alias, gender: entry.g })
            .eq('id', horse.id);

        if (horse.profile_id) {
            await supabase.from('profiles')
                .update({ full_name: entry.n, display_name: entry.n, username: alias })
                .eq('id', horse.profile_id);
        }

        console.log(`  ✅ "${horse.name}" → "${entry.n}" (${entry.g}) @${alias}`);
        fixed++;
    }

    console.log(`\nFixed last ${fixed} horses\n`);

    // 3. SYNC: Ensure ALL 208 today's horses have profiles.full_name matching content_authors.name
    console.log('Syncing profiles.full_name for ALL today\'s horses...');
    
    // Re-fetch to get updated names
    const { data: updated } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id')
        .gte('created_at', '2026-03-11T00:00:00')
        .not('profile_id', 'is', null);

    let synced = 0;
    for (const horse of (updated || [])) {
        const { error } = await supabase.from('profiles')
            .update({ full_name: horse.name, display_name: horse.name })
            .eq('id', horse.profile_id);
        if (!error) synced++;
    }

    console.log(`Synced profiles.full_name: ${synced}/${updated?.length || 0}`);

    // 4. Final verification
    const { data: verify } = await supabase
        .from('content_authors')
        .select('name')
        .gte('created_at', '2026-03-11T00:00:00');

    const stillJargon = verify?.filter(h => JARGON.test(h.name || '') || !h.name?.includes(' ')) || [];
    console.log(`\n✅ FINAL CHECK: ${stillJargon.length} horses still with jargon names`);
    if (stillJargon.length > 0) {
        stillJargon.forEach(h => console.log(`  ❌ "${h.name}"`));
    } else {
        console.log('🎉 ALL 208 HORSES HAVE REAL NAMES!');
    }

    // Gender stats
    const { data: genderCheck } = await supabase
        .from('content_authors')
        .select('gender')
        .gte('created_at', '2026-03-11T00:00:00');
    const m = genderCheck?.filter(h => h.gender === 'male').length || 0;
    const f = genderCheck?.filter(h => h.gender === 'female').length || 0;
    console.log(`Gender breakdown: ${m} male / ${f} female`);
}

finalFix().catch(console.error);
