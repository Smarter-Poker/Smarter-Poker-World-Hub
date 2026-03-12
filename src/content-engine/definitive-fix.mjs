/**
 * 🐴 DEFINITIVE HORSE FIX — Fix ALL remaining poker-jargon names + aliases
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This script:
 * 1. Finds ALL content_authors added today with jargon names
 * 2. Assigns real, diverse names with proper gender distribution
 * 3. Generates 100% unique aliases
 * 4. Updates content_authors (name, alias, gender)
 * 5. Updates profiles (full_name, display_name, username)
 * 
 * Run: node src/content-engine/definitive-fix.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

// Poker jargon patterns to detect fake names
const JARGON = /ThreeBet|NutFlush|SnapCall|SetMiner|PocketPair|RiverRat|StraightDraw|OverBet|BottomPair|FlushDraw|OverPair|CheckBack|SplitPot|UnderPair|TopPair|SecondPair|BlockBet|PotControl|DonkBet|Squeeze|ColdCall|Exploit|Balanced|PostFlop|AnteUp|XRaise|CBet|SPR|Straddle|BombPot|DoubleBoard|EffStack|StackDepth|JamShove|StealBlind|Resteal|RiverBluff|TurnBet|PreFlop|MPGrinder|BBSpecial|SBWarrior|HeadsUp|ShortDeck|PLO|DeepStack|ChipDown|ChipUp|ShortStack|BigStack|MedStack|ShallowStack|TurboTime|BreakEven|HyperTurbo|SideEvent|PromoPlay|RakeBack|MainEvent|BonusHunter|SatPlayer|CashKing|TourneyPro|FreezeOut|ProgKO|BountyBuilder|KnockOut|JackpotSit|SpinGo|SNGMaster|RebuyKing|LateReg|AddonAce|BubbleBoy|BigBlind|SmallBl|RakeHunter|TableCap|Dealer|AvgStack|ChipLead|FinalTable|ShortChip|NitCorner|TagTeam|Tricky|Maniac|VolTable|GrinderKing|LooseGoose|SolidRock|SessionPro|LagLife|Folding|Betting|Aggro|Passive|TightFist|BluffKing|Calling|ValueTown|Raising|PotOdds|ProbePlay|DelayedCB|PureBluff|ReverseIO|FloatMaster|Implied|SemiBluff|ValueCut|BarrelDown|FoldEquity|UnderBluff|GTOPlayer|NashEqui|OverBluff|ExploitBF|ThinBluff|ChipEV|ICMPressure|RealMoney|PlayMoney|RecPlayer|RollerHigh|NanoStakes|MicroStakes|HighStakes|MidStakes|LowStakes|NitReg|EarlyBird|TableSelect|SeatSelect|OffPeak|PeakHours|Weekend|TopUp|WaitList|AutoRebuy|NightOwl|SitOut|SitIn|CashOut|MuckHand|AutoFold|QuickFold|PostBB|WaitBB|RunItTwice|ShowCards|CoachMode|TimeBank|SnapFold|Disconnect|RailBird|ReviewHand|Reconnect|Observer|SweatHorse|HandHistory|StatTracker|UpSwing|DownSwing|SwingTrader|VarianceKing|HUDMaster|DataDriven|NumbersCrunch|BreakThrough|FullRing|SixMax|PolarRange|LinearRange|BetSize|BalancedBF|BalancedBet|ImpliedGuy|RestealRob|CallingMachine|PassivePete|AggroAndy|BettingBeast|FoldingFiona|RaisingRita|TrickyTom/i;

// ═══════════════════════════════════════════════════════════════════════════
// 250+ ADDITIONAL REAL NAMES (to cover remaining 170 horses) 
// ═══════════════════════════════════════════════════════════════════════════
const EXTRA_NAMES = [
    // Male - Caucasian
    { n: 'Austin Meriwether', g: 'male' }, { n: 'Caleb Strickland', g: 'male' },
    { n: 'Dylan Hargrove', g: 'male' }, { n: 'Evan Whitfield', g: 'male' },
    { n: 'Felix Dempsey', g: 'male' }, { n: 'Gavin Lockhart', g: 'male' },
    { n: 'Holden Prescott', g: 'male' }, { n: 'Ian Rutherford', g: 'male' },
    { n: 'Jack Fairbanks', g: 'male' }, { n: 'Kyle Westbrook', g: 'male' },
    { n: 'Leo Hastings', g: 'male' }, { n: 'Miles Ellsworth', g: 'male' },
    { n: 'Nash Pembroke', g: 'male' }, { n: 'Oscar Langley', g: 'male' },
    { n: 'Preston Drake', g: 'male' }, { n: 'Quinn Forsythe', g: 'male' },
    { n: 'Rhett Calloway', g: 'male' }, { n: 'Spencer Ashwood', g: 'male' },
    { n: 'Tucker Caldwell', g: 'male' }, { n: 'Vince Redford', g: 'male' },
    { n: 'Wade Hennessey', g: 'male' }, { n: 'Xander Trowbridge', g: 'male' },
    { n: 'Zach Abernathy', g: 'male' }, { n: 'Dalton Kingsley', g: 'male' },
    { n: 'Heath Donovan', g: 'male' }, { n: 'Jace Mcintyre', g: 'male' },
    { n: 'Luke Ashmore', g: 'male' }, { n: 'Oliver Cabot', g: 'male' },
    { n: 'Parker Steele', g: 'male' }, { n: 'Reed Thatcher', g: 'male' },
    { n: 'Sterling Crosby', g: 'male' }, { n: 'Ty Callister', g: 'male' },

    // Male - African American
    { n: 'Aaron Jeffries', g: 'male' }, { n: 'Brandon Sims', g: 'male' },
    { n: 'Calvin Odom', g: 'male' }, { n: 'Desmond Avery', g: 'male' },
    { n: 'Elijah Pruitt', g: 'male' }, { n: 'Franklin Booker', g: 'male' },
    { n: 'Gregory Ware', g: 'male' }, { n: 'Hakeem Okafor', g: 'male' },
    { n: 'Jabari Townsend', g: 'male' }, { n: 'Keith Mosley', g: 'male' },
    { n: 'Lamont Braxton', g: 'male' }, { n: 'Miles Livingston', g: 'male' },
    { n: 'Nolan Beasley', g: 'male' }, { n: 'Otis Pendleton', g: 'male' },
    { n: 'Quincy Barksdale', g: 'male' }, { n: 'Reginald Fenton', g: 'male' },
    { n: 'Sterling Meadows', g: 'male' }, { n: 'Terrence Gaines', g: 'male' },
    { n: 'Vernon Hightower', g: 'male' }, { n: 'Winston Appleby', g: 'male' },

    // Male - Hispanic
    { n: 'Andres Villarreal', g: 'male' }, { n: 'Bruno Oliveira', g: 'male' },
    { n: 'Cesar Montoya', g: 'male' }, { n: 'Dario Escobar', g: 'male' },
    { n: 'Ernesto Salazar', g: 'male' }, { n: 'Fabian Torres', g: 'male' },
    { n: 'Gerardo Quintero', g: 'male' }, { n: 'Hector Ibarra', g: 'male' },
    { n: 'Ivan Camacho', g: 'male' }, { n: 'Julio Estrada', g: 'male' },
    { n: 'Lorenzo Figueroa', g: 'male' }, { n: 'Manuel Ochoa', g: 'male' },
    { n: 'Nestor Villalobos', g: 'male' }, { n: 'Orlando Trevino', g: 'male' },
    { n: 'Pablo Carvajal', g: 'male' }, { n: 'Roberto Zavala', g: 'male' },

    // Male - Asian
    { n: 'Aaron Chiang', g: 'male' }, { n: 'Benjamin Ahn', g: 'male' },
    { n: 'Charles Yeung', g: 'male' }, { n: 'David Shimizu', g: 'male' },
    { n: 'Edward Leung', g: 'male' }, { n: 'George Hasegawa', g: 'male' },
    { n: 'Howard Takeda', g: 'male' }, { n: 'James Okada', g: 'male' },
    { n: 'Kenneth Bui', g: 'male' }, { n: 'Larry Saito', g: 'male' },
    { n: 'Michael Cheng', g: 'male' }, { n: 'Nathan Ho', g: 'male' },
    { n: 'Paul Yoo', g: 'male' }, { n: 'Robert Iwata', g: 'male' },

    // Male - South Asian + Middle Eastern
    { n: 'Aarav Chatterjee', g: 'male' }, { n: 'Bharat Sundaram', g: 'male' },
    { n: 'Chetan Raghavan', g: 'male' }, { n: 'Deepak Venkatesh', g: 'male' },
    { n: 'Eshan Mukherjee', g: 'male' }, { n: 'Farhan Mirza', g: 'male' },
    { n: 'Abbas Tehrani', g: 'male' }, { n: 'Bilal Hamdan', g: 'male' },
    { n: 'Darius Tehrani', g: 'male' }, { n: 'Khalil Rahman', g: 'male' },

    // Female - Caucasian
    { n: 'Abigail Thornbury', g: 'female' }, { n: 'Bethany Lockwood', g: 'female' },
    { n: 'Charlotte Ainsworth', g: 'female' }, { n: 'Danielle Pemberton', g: 'female' },
    { n: 'Emily Fairchild', g: 'female' }, { n: 'Felicity Whitmore', g: 'female' },
    { n: 'Gemma Blackwood', g: 'female' }, { n: 'Hannah Rutledge', g: 'female' },
    { n: 'Iris Pemberton', g: 'female' }, { n: 'Julia Montclair', g: 'female' },
    { n: 'Katherine Ashford', g: 'female' }, { n: 'Lauren Westfield', g: 'female' },
    { n: 'Megan Stanhope', g: 'female' }, { n: 'Nicole Ellsworth', g: 'female' },
    { n: 'Penelope Hargreaves', g: 'female' }, { n: 'Rachel Kensington', g: 'female' },
    { n: 'Sarah Langston', g: 'female' }, { n: 'Tara McBride', g: 'female' },
    { n: 'Vera Worthington', g: 'female' }, { n: 'Wendy Cartwright', g: 'female' },
    { n: 'Zoe Radcliffe', g: 'female' }, { n: 'Amy Livingstone', g: 'female' },
    { n: 'Brenna Kincaid', g: 'female' }, { n: 'Celeste Ashwood', g: 'female' },

    // Female - African American
    { n: 'Adrienne Harmon', g: 'female' }, { n: 'Bianca Caldwell', g: 'female' },
    { n: 'Chantel Woodard', g: 'female' }, { n: 'Deja Whitfield', g: 'female' },
    { n: 'Erica Pennington', g: 'female' }, { n: 'Fatima Rutledge', g: 'female' },
    { n: 'Giselle Baptiste', g: 'female' }, { n: 'Harmony Lennox', g: 'female' },
    { n: 'Ivory Townsend', g: 'female' }, { n: 'Jacinda Okafor', g: 'female' },
    { n: 'Kendra Booker', g: 'female' }, { n: 'Latasha Gaines', g: 'female' },
    { n: 'Melanie Braxton', g: 'female' }, { n: 'Naomi Thornton', g: 'female' },
    { n: 'Opal Livingston', g: 'female' }, { n: 'Portia Meadows', g: 'female' },

    // Female - Hispanic
    { n: 'Alejandra Bustamante', g: 'female' }, { n: 'Bianca Montoya', g: 'female' },
    { n: 'Carolina Villarreal', g: 'female' }, { n: 'Daniela Escobar', g: 'female' },
    { n: 'Esperanza Ibarra', g: 'female' }, { n: 'Fernanda Trevino', g: 'female' },
    { n: 'Guadalupe Oliveira', g: 'female' }, { n: 'Ines Figueroa', g: 'female' },
    { n: 'Josefina Salazar', g: 'female' }, { n: 'Karla Quintero', g: 'female' },
    { n: 'Lourdes Ochoa', g: 'female' }, { n: 'Mariana Estrada', g: 'female' },

    // Female - Asian
    { n: 'Akiko Murakami', g: 'female' }, { n: 'Betty Leung', g: 'female' },
    { n: 'Connie Shimizu', g: 'female' }, { n: 'Denise Ahn', g: 'female' },
    { n: 'Emily Hasegawa', g: 'female' }, { n: 'Florence Chiang', g: 'female' },
    { n: 'Gloria Takahashi', g: 'female' }, { n: 'Hana Iwamoto', g: 'female' },
    { n: 'Irene Bui', g: 'female' }, { n: 'Janet Saito', g: 'female' },

    // Female - South Asian + Middle Eastern
    { n: 'Anjali Raghavan', g: 'female' }, { n: 'Bhavna Sundaram', g: 'female' },
    { n: 'Deepika Chatterjee', g: 'female' }, { n: 'Esha Venkatesh', g: 'female' },
    { n: 'Farah Mirza', g: 'female' }, { n: 'Geeta Mukherjee', g: 'female' },
    { n: 'Halima Hamdan', g: 'female' }, { n: 'Iman Tehrani', g: 'female' },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALIAS GENERATOR — Each pattern is truly unique
// ═══════════════════════════════════════════════════════════════════════════
function generateAlias(name, location, index) {
    const first = name.split(' ')[0];
    const last = name.split(' ').slice(-1)[0].replace(/'/g, '');
    const yr = 1985 + (index % 15);
    const num = (index * 7 + 13) % 100;

    const cityMap = {
        'Las Vegas': 'LV', 'Los Angeles': 'LA', 'Miami': 'MIA', 'Houston': 'HTX',
        'Chicago': 'CHI', 'Austin': 'ATX', 'Denver': 'DEN', 'Phoenix': 'PHX',
        'Seattle': 'SEA', 'Portland': 'PDX', 'Boston': 'BOS', 'Detroit': 'DET',
        'Tampa': 'TPA', 'Nashville': 'NSH', 'Atlanta': 'ATL', 'San Francisco': 'SF',
        'San Diego': 'SD', 'Philadelphia': 'PHL', 'Charlotte': 'CLT',
        'San Antonio': 'SAT', 'New York': 'NYC', 'Sacramento': 'SAC',
        'Jacksonville': 'JAX', 'Minneapolis': 'MSP', 'Pittsburgh': 'PGH',
    };
    let city = '';
    for (const [c, code] of Object.entries(cityMap)) {
        if (location?.includes(c)) { city = code; break; }
    }
    if (!city) city = location?.split(',')[0]?.slice(0, 3)?.toUpperCase() || 'US';

    // 15 patterns — cycle via index to guarantee variety
    const patterns = [
        `${first.toLowerCase()}_${last.toLowerCase()}${num}`,    // jake_sullivan42
        `${first}${last.slice(0,1)}_${city}`,                    // JakeS_LV
        `${city.toLowerCase()}${first.toLowerCase()}${yr%100}`,   // lvjake93
        `${first}.${last.toLowerCase()}`,                          // Jake.sullivan
        `${last}${first.slice(0,1)}${num}`,                       // SullivanJ42
        `${first}${yr}`,                                           // Jake1993
        `the_${last.toLowerCase()}`,                               // the_sullivan
        `${first.slice(0,1).toLowerCase()}${last.toLowerCase()}_${city.toLowerCase()}`, // jsullivan_lv
        `${first.toLowerCase()}x${num}`,                           // jakex42
        `${last.toLowerCase()}.${first.toLowerCase()}`,            // sullivan.jake
        `${city}_${first.toLowerCase()}${num}`,                    // LV_jake42
        `${first.toLowerCase()}${last.slice(0,3).toLowerCase()}${yr}`, // jakesul1993
        `real_${first.toLowerCase()}${last.slice(0,1).toLowerCase()}`, // real_jakes
        `${first}${last}`,                                        // JakeSullivan
        `${first.toLowerCase()}${num}${city.toLowerCase()}`,       // jake42lv
    ];

    return patterns[index % patterns.length];
}

// ═══════════════════════════════════════════════════════════════════════════

async function definiteFix() {
    console.log('🐴 DEFINITIVE HORSE FIX\n');
    console.log('═'.repeat(60));

    // 1. Get ALL today's horses
    const { data: todayHorses } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id, location')
        .gte('created_at', '2026-03-11T00:00:00')
        .order('id');

    console.log(`Total today's horses: ${todayHorses?.length}\n`);

    // 2. Filter to ones with jargon names
    const jargon = todayHorses?.filter(h => {
        const name = h.name || '';
        if (JARGON.test(name)) return true;
        if (!name.includes(' ')) return true;
        const parts = name.split(' ');
        if (parts.length === 2 && parts[1].length <= 3 && parts[1] === parts[1].toUpperCase()) return true;
        return false;
    }) || [];

    console.log(`Horses with jargon names: ${jargon.length}\n`);
    if (jargon.length === 0) {
        console.log('✅ ALL horses have real names!');
        return;
    }

    // 3. Collect all existing names/aliases to avoid duplication
    const { data: allHorses } = await supabase
        .from('content_authors')
        .select('name, alias');
    
    const usedNames = new Set((allHorses || []).map(h => h.name?.toLowerCase()));
    const usedAliases = new Set((allHorses || []).map(h => h.alias?.toLowerCase()));

    // Remove the jargon names from usedNames since we'll replace them
    for (const h of jargon) {
        usedNames.delete(h.name?.toLowerCase());
        usedAliases.delete(h.alias?.toLowerCase());
    }

    // 4. Assign names with ~35% female
    const pool = [...EXTRA_NAMES].sort(() => Math.random() - 0.5);
    let nameIdx = 0;
    const updates = [];

    for (const horse of jargon) {
        let entry;
        while (nameIdx < pool.length) {
            entry = pool[nameIdx++];
            if (!usedNames.has(entry.n.toLowerCase())) break;
            entry = null;
        }

        if (!entry) {
            console.warn(`Ran out of names at ${updates.length}`);
            break;
        }

        usedNames.add(entry.n.toLowerCase());

        // Generate unique alias
        let alias = generateAlias(entry.n, horse.location, updates.length);
        let tries = 0;
        while (usedAliases.has(alias.toLowerCase()) && tries < 30) {
            alias = generateAlias(entry.n, horse.location, updates.length + (tries + 1) * 15);
            tries++;
        }
        if (usedAliases.has(alias.toLowerCase())) {
            alias = `${entry.n.split(' ')[0].toLowerCase()}${Math.floor(Math.random() * 9000) + 1000}`;
        }
        usedAliases.add(alias.toLowerCase());

        updates.push({
            id: horse.id,
            profileId: horse.profile_id,
            oldName: horse.name,
            newName: entry.n,
            newGender: entry.g,
            newAlias: alias,
        });
    }

    const females = updates.filter(u => u.newGender === 'female').length;
    console.log(`Prepared ${updates.length} updates: ${updates.length - females} male / ${females} female\n`);

    // Verify uniqueness
    const aliasCheck = new Set(updates.map(u => u.newAlias.toLowerCase()));
    const nameCheck = new Set(updates.map(u => u.newName.toLowerCase()));
    console.log(`Unique aliases: ${aliasCheck.size} (need ${updates.length})`);
    console.log(`Unique names: ${nameCheck.size} (need ${updates.length})`);
    if (aliasCheck.size !== updates.length) { console.error('DUPLICATE ALIASES!'); return; }

    // 5. Apply
    let success = 0;
    for (let i = 0; i < updates.length; i++) {
        const u = updates[i];

        // Update content_authors
        const { error: authErr } = await supabase
            .from('content_authors')
            .update({ name: u.newName, alias: u.newAlias, gender: u.newGender })
            .eq('id', u.id);

        if (authErr) { console.error(`❌ ${u.oldName}: ${authErr.message}`); continue; }

        // Update profiles: full_name (used by social feed), display_name, username
        if (u.profileId) {
            await supabase
                .from('profiles')
                .update({ 
                    full_name: u.newName, 
                    display_name: u.newName,
                    username: u.newAlias 
                })
                .eq('id', u.profileId);
        }

        success++;

        if ((i + 1) % 25 === 0 || i === updates.length - 1) {
            console.log(`Progress: ${i + 1}/${updates.length}`);
            const j = Math.max(0, i - 2);
            for (let k = j; k <= i; k++) {
                const x = updates[k];
                console.log(`  "${x.oldName}" → "${x.newName}" (${x.newGender}) @${x.newAlias}`);
            }
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`✅ DEFINITIVE FIX COMPLETE!`);
    console.log(`   Updated: ${success} horses`);
    console.log(`   Gender: ${updates.length - females} male / ${females} female`);
    console.log('═'.repeat(60));
}

definiteFix().catch(console.error);
