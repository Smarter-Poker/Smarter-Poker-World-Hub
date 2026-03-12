/**
 * 🐴 NUCLEAR FIX — Directly query ALL jargon names and replace them
 * This script targets by EXACT jargon name pattern matching, not by date.
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

// Exact names to fix (from the output list)
const JARGON_NAMES = [
    'DonkBet Diana', 'SqueezePlay', 'Exploiter Eve', 'BalancedBet Bob',
    'PostFlop Pete', 'AnteUp Andy', 'XRaise Xander', 'CBet Chris',
    'SPR Spencer', 'Straddle Steve', 'BombPot Bella', 'DoubleBoard DB',
    'EffStack Ella', 'StackDepth Stan', 'JamShove Jake', 'StealBlind SB',
    'ShowDown Shane', 'RestealRob', 'RiverBluff Rob', 'TurnBet Tara',
    'PreFlop Pam', 'SBSqueeze Sam', 'MPGrinder Mel', 'UTG1Nit Nancy',
    'BBSpecial', 'SBWarrior', 'HeadsUpHero', 'FullRing Flo',
    'SixMax Sid', 'ShortDeck SD', 'PLO Player', 'DeepStack DS',
    'ChipDown Chloe', 'ChipUp Chuck', 'ShortStack SS', 'BigStack Barry',
    'MedStack Mark', 'ShallowStack', 'TurboTime TT', 'BreakEven BJ',
    'HyperTurbo HT', 'SideEvent SE', 'PromoPlay PP', 'RakeBack Ricky',
    'MainEvent ME', 'BonusHunter BH', 'SatPlayer SP', 'CashKing CK',
    'TourneyPro TP', 'FreezeOut FO', 'ProgKO PKO', 'BountyBuilder',
    'KnockOut KO', 'JackpotSit JS', 'SpinGo SG', 'SNGMaster SM',
    'RebuyKing RK', 'LateReg LR', 'AddonAce AA', 'BubbleBoy BB2',
    'BigBlind BB3', 'SmallBl SB2', 'RakeHunter RH', 'TableCap TC',
    'Dealer DLR', 'AvgStack AS', 'ChipLeadCL', 'FinalTableFT',
    'ShortChip SC', 'NitCorner NC', 'TagTeam TT2', 'TrickyTom',
    'ManiacMax', 'VolTable VT', 'GrinderKing GK', 'LooseGoose LG',
    'SolidRock SR', 'SessionPro SP2', 'LagLife LL', 'FoldingFiona',
    'BettingBeast', 'AggroAndy', 'PassivePete', 'TightFist TF',
    'BluffKing BK', 'CallingMachine', 'ValueTown VT2', 'RaisingRita',
    'PotOdds PO', 'ProbePlay PP2', 'DelayedCB DC', 'PureBluff PBF',
    'ReverseIO RIO', 'FloatMaster FM', 'ImpliedGuy IG', 'SemiBluff SBF',
    'ValueCut VC', 'BarrelDown BD', 'FoldEquityFE', 'BalancedBF BBF',
    'UnderBluff UB', 'GTOPlayer GP', 'NashEqui NE', 'OverBluff OB',
    'ExploitBF EBF', 'ThinBluff TB', 'ChipEV CE', 'ICMPressure IP',
    'RealMoney RM', 'PlayMoney PM', 'RecPlayer RP', 'RollerHigh RH2',
    'NanoStakes NS', 'MicroStakes', 'HighStakes HS', 'MidStakes MS',
    'LowStakes LS', 'NitReg NR', 'EarlyBird EB', 'TableSelect TS',
    'SeatSelect SS2', 'OffPeak OP', 'PeakHours PH', 'WeekendW WW',
    'TopUp TU', 'WaitList WL', 'AutoRebuy AR', 'NightOwl NO',
    'SitOut SO', 'SitIn SI', 'CashOut CO', 'MuckHand MH',
    'AutoFold AF', 'QuickFold QF', 'PostBB PBB', 'WaitBB WBB',
    'RunItTwice R2', 'ShowCards SC2', 'CoachMode CM', 'TimeBank TB2',
    'SnapFold SF', 'Disconnect DC2', 'RailBird RB', 'ReviewHand RH3',
    'Reconnect RC', 'ObserverOB', 'SweatHorse SH', 'HandHistory HH',
    'StatTracker ST', 'UpSwing US', 'DownSwing DS2', 'SwingTrader',
    'VarianceKing', 'HUDMaster HM', 'DataDriven DD', 'NumbersCrunch',
    'BreakThrough BT', 'ThinValue Vic', 'BTNBandit Bill', 'COKiller Kate',
    'HiJack Hank',
];

// ═══════════════════════════════════════════════════════════════════════════
// 200 REAL NAMES — all unique, none used so far
// ═══════════════════════════════════════════════════════════════════════════
const NAMES = [
    // Male - Caucasian (30)
    { n:'Craig Bellingham', g:'male' }, { n:'Dwight Harford', g:'male' },
    { n:'Elliott Granville', g:'male' }, { n:'Floyd Remington', g:'male' },
    { n:'Gerald Stanworth', g:'male' }, { n:'Hugh Davenport', g:'male' },
    { n:'Irving Caulfield', g:'male' }, { n:'Jerome Whitfield', g:'male' },
    { n:'Keith Pemberton', g:'male' }, { n:'Lester Holcombe', g:'male' },
    { n:'Murray Blackstone', g:'male' }, { n:'Neville Ashcroft', g:'male' },
    { n:'Percy Rutherford', g:'male' }, { n:'Quentin Marlowe', g:'male' },
    { n:'Rupert Kingswood', g:'male' }, { n:'Stuart Westcott', g:'male' },
    { n:'Tobias Greyson', g:'male' }, { n:'Ulysses Crawford', g:'male' },
    { n:'Vincent Aldridge', g:'male' }, { n:'Wendell Thornbury', g:'male' },
    { n:'Malcolm Worthing', g:'male' }, { n:'Clifford Banfield', g:'male' },
    { n:'Bernard Colquitt', g:'male' }, { n:'Arthur Fenwick', g:'male' },
    { n:'Reece Abernathy', g:'male' }, { n:'Norris Pendleton', g:'male' },
    { n:'Giancarlo Benelli', g:'male' }, { n:'Darnell Beauregard', g:'male' },
    { n:'Jasper Kingsley', g:'male' }, { n:'Maxwell Fairfax', g:'male' },

    // Male - African American (20)
    { n:'Antoine Beauchamp', g:'male' }, { n:'Byron Clarkson', g:'male' },
    { n:'Clarence Humphrey', g:'male' }, { n:'Damon Prescott', g:'male' },
    { n:'Edison Meriwether', g:'male' }, { n:'Floyd Garrison', g:'male' },
    { n:'Gerald Thornhill', g:'male' }, { n:'Herman Caldwell', g:'male' },
    { n:'Isaac Pemberton', g:'male' }, { n:'Jerome Willoughby', g:'male' },
    { n:'Kelvin Stratford', g:'male' }, { n:'Luther Ainsworth', g:'male' },
    { n:'Melvin Blackford', g:'male' }, { n:'Norman Ashworth', g:'male' },
    { n:'Ossie Devereaux', g:'male' }, { n:'Percival Langston', g:'male' },
    { n:'Quinton Radcliffe', g:'male' }, { n:'Roderick Fairview', g:'male' },
    { n:'Sidney Beaufort', g:'male' }, { n:'Thurston Kingfield', g:'male' },

    // Male - Hispanic (15)
    { n:'Alvaro Bustamante', g:'male' }, { n:'Benito Castellanos', g:'male' },
    { n:'Cristian Delgadillo', g:'male' }, { n:'Domingo Echevarria', g:'male' },
    { n:'Esteban Figueroa', g:'male' }, { n:'Facundo Gonzalez', g:'male' },
    { n:'Gonzalo Hernandez', g:'male' }, { n:'Horacio Ibarburen', g:'male' },
    { n:'Ignacio Jaramillo', g:'male' }, { n:'Joaquin Villasenor', g:'male' },
    { n:'Leandro Madrigal', g:'male' }, { n:'Maximiliano Cortez', g:'male' },
    { n:'Nicolai Alvarado', g:'male' }, { n:'Patricio Valenzuela', g:'male' },
    { n:'Rodrigo Bustamante', g:'male' },

    // Male - Asian (10)
    { n:'Alvin Hashimoto', g:'male' }, { n:'Bruce Matsubara', g:'male' },
    { n:'Cecil Nakagawa', g:'male' }, { n:'Donald Takemura', g:'male' },
    { n:'Edwin Yoshikawa', g:'male' }, { n:'Gordon Fujimori', g:'male' },
    { n:'Harold Kitamura', g:'male' }, { n:'Ivan Matsuzaka', g:'male' },
    { n:'Karl Watanabe', g:'male' }, { n:'Leonard Tsukamoto', g:'male' },

    // Male - South Asian + Middle Eastern (10)
    { n:'Ashwin Chakravarti', g:'male' }, { n:'Chandra Krishnamurthy', g:'male' },
    { n:'Harish Balakrishnan', g:'male' }, { n:'Manish Sundaresan', g:'male' },
    { n:'Naveen Ramachandran', g:'male' }, { n:'Adnan Barghouti', g:'male' },
    { n:'Bassam Khayyat', g:'male' }, { n:'Imran Siddiqui', g:'male' },
    { n:'Jamal Abubakar', g:'male' }, { n:'Mustafa Celikoglu', g:'male' },

    // Female - Caucasian (25)
    { n:'Agatha Winterbourne', g:'female' }, { n:'Beatrice Lockwood', g:'female' },
    { n:'Constance Fairfield', g:'female' }, { n:'Dorothy Ashbridge', g:'female' },
    { n:'Eleanor Thornbury', g:'female' }, { n:'Frances Kingsmill', g:'female' },
    { n:'Gertrude Pemberton', g:'female' }, { n:'Harriet Blackwell', g:'female' },
    { n:'Irene Castleford', g:'female' }, { n:'Josephine Whitmore', g:'female' },
    { n:'Loretta Stanfield', g:'female' }, { n:'Martha Collingwood', g:'female' },
    { n:'Nadine Ashworth', g:'female' }, { n:'Philippa Drummond', g:'female' },
    { n:'Rosemary Garfield', g:'female' }, { n:'Sylvia Beckford', g:'female' },
    { n:'Tabitha Kensington', g:'female' }, { n:'Ursula Chatsworth', g:'female' },
    { n:'Winifred Longworth', g:'female' }, { n:'Ximena Whitfield', g:'female' },
    { n:'Yolanda Crestwood', g:'female' }, { n:'Adelaide Thornton', g:'female' },
    { n:'Bernadette Kingsbury', g:'female' }, { n:'Cordelia Ashford', g:'female' },
    { n:'Daphne Winterfield', g:'female' },

    // Female - African American (15)
    { n:'Alondra Beaumont', g:'female' }, { n:'Candice Stratford', g:'female' },
    { n:'Denise Willoughby', g:'female' }, { n:'Estelle Ainsworth', g:'female' },
    { n:'Felicia Devereaux', g:'female' }, { n:'Gwendolyn Beaufort', g:'female' },
    { n:'Helena Ashbridge', g:'female' }, { n:'Ingrid Langsworth', g:'female' },
    { n:'Jasmine Radcliffe', g:'female' }, { n:'Kimberly Fairfield', g:'female' },
    { n:'Laverne Blackford', g:'female' }, { n:'Maxine Thornhill', g:'female' },
    { n:'Norma Clarkson', g:'female' }, { n:'Ophelia Garrison', g:'female' },
    { n:'Priscilla Humphrey', g:'female' },

    // Female - Hispanic (10)
    { n:'Adrianna Castellanos', g:'female' }, { n:'Blanca Echevarria', g:'female' },
    { n:'Constanza Jaramillo', g:'female' }, { n:'Dolores Madrigal', g:'female' },
    { n:'Esmeralda Villasenor', g:'female' }, { n:'Florencia Alvarado', g:'female' },
    { n:'Graciela Valenzuela', g:'female' }, { n:'Hortensia Delgadillo', g:'female' },
    { n:'Isadora Bustamante', g:'female' }, { n:'Jimena Cortez', g:'female' },

    // Female - Asian (8)
    { n:'Akemi Hashimoto', g:'female' }, { n:'Chiyo Matsubara', g:'female' },
    { n:'Etsuko Nakagawa', g:'female' }, { n:'Fumiko Takemura', g:'female' },
    { n:'Haruka Yoshikawa', g:'female' }, { n:'Izumi Fujimori', g:'female' },
    { n:'Junko Kitamura', g:'female' }, { n:'Kazuko Matsuzaka', g:'female' },

    // Female - South Asian + Middle Eastern (7)
    { n:'Amrita Chakravarti', g:'female' }, { n:'Bindya Krishnamurthy', g:'female' },
    { n:'Chandni Balakrishnan', g:'female' }, { n:'Durga Sundaresan', g:'female' },
    { n:'Fatimah Siddiqui', g:'female' }, { n:'Gulnaz Khayyat', g:'female' },
    { n:'Hayat Barghouti', g:'female' },
];

function genAlias(name, location, idx) {
    const first = name.split(' ')[0];
    const last = name.split(' ').slice(-1)[0].replace(/'/g, '');
    const yr = 1985 + (idx % 15);
    const num = (idx * 7 + 13) % 100;
    const cityMap = {
        'Las Vegas':'lv','Los Angeles':'la','Miami':'mia','Houston':'htx',
        'Chicago':'chi','Austin':'atx','Denver':'den','Phoenix':'phx',
        'Seattle':'sea','Portland':'pdx','Boston':'bos','Detroit':'det',
        'Tampa':'tpa','Nashville':'nsh','Atlanta':'atl','San Francisco':'sf',
        'San Diego':'sd','Philadelphia':'phl','Charlotte':'clt',
        'New York':'nyc','Sacramento':'sac',
    };
    let city = '';
    for (const [c, code] of Object.entries(cityMap)) {
        if (location?.includes(c)) { city = code; break; }
    }
    if (!city) city = (location?.split(',')[0]?.slice(0,3) || 'us').toLowerCase();
    const p = [
        `${first.toLowerCase()}_${last.toLowerCase()}${num}`,
        `${first}${last.slice(0,1)}_${city}`,
        `${city}${first.toLowerCase()}${yr%100}`,
        `${first.toLowerCase()}.${last.toLowerCase()}`,
        `${last}${first.slice(0,1)}${num}`,
        `${first}${yr}`,
        `the_${last.toLowerCase()}`,
        `${first.slice(0,1).toLowerCase()}${last.toLowerCase()}_${num}`,
        `${first.toLowerCase()}x${num}`,
        `${last.toLowerCase()}.${first.toLowerCase()}`,
        `${city}_${first.toLowerCase()}${num}`,
        `${first.toLowerCase()}${last.slice(0,3).toLowerCase()}${yr}`,
        `real_${first.toLowerCase()}${last.slice(0,1).toLowerCase()}`,
        `${first}${last}`,
        `${first.toLowerCase()}${num}${city}`,
    ];
    return p[idx % p.length];
}

async function nuclearFix() {
    console.log('🐴 NUCLEAR FIX — Target by exact jargon name\n');

    // 1. Find ALL horses with these exact jargon names
    const { data: horses, error } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id, location')
        .in('name', JARGON_NAMES);

    if (error) { console.error('Query error:', error.message); return; }
    console.log(`Found ${horses?.length || 0} horses with jargon names\n`);
    if (!horses?.length) { console.log('✅ NO jargon names found!'); return; }

    // Get existing names/aliases
    const { data: all } = await supabase.from('content_authors').select('name, alias');
    const usedN = new Set((all || []).map(h => h.name?.toLowerCase()));
    const usedA = new Set((all || []).map(h => h.alias?.toLowerCase()));
    for (const h of horses) { usedN.delete(h.name?.toLowerCase()); usedA.delete(h.alias?.toLowerCase()); }

    const pool = [...NAMES].sort(() => Math.random() - 0.5);
    let idx = 0;
    let success = 0;
    let females = 0;

    for (const horse of horses) {
        let entry;
        while (idx < pool.length) {
            entry = pool[idx++];
            if (!usedN.has(entry.n.toLowerCase())) break;
            entry = null;
        }
        if (!entry) { console.warn('Ran out of names!'); break; }
        usedN.add(entry.n.toLowerCase());
        if (entry.g === 'female') females++;

        let alias = genAlias(entry.n, horse.location, success);
        let tries = 0;
        while (usedA.has(alias.toLowerCase()) && tries < 30) {
            alias = genAlias(entry.n, horse.location, success + (tries + 1) * 15);
            tries++;
        }
        if (usedA.has(alias.toLowerCase())) alias = `${entry.n.split(' ')[0].toLowerCase()}${Math.floor(Math.random()*9000)+1000}`;
        usedA.add(alias.toLowerCase());

        // Update content_authors
        const { error: e1 } = await supabase.from('content_authors')
            .update({ name: entry.n, alias, gender: entry.g })
            .eq('id', horse.id);
        if (e1) { console.error(`❌ ${horse.name}: ${e1.message}`); continue; }

        // Update profiles
        if (horse.profile_id) {
            await supabase.from('profiles')
                .update({ full_name: entry.n, display_name: entry.n, username: alias })
                .eq('id', horse.profile_id);
        }

        success++;
        if (success % 25 === 0 || success === 1) {
            console.log(`  [${success}] "${horse.name}" → "${entry.n}" (${entry.g}) @${alias}`);
        }
    }

    console.log(`\n✅ NUCLEAR FIX COMPLETE: ${success} horses updated`);
    console.log(`   Gender: ${success - females} male / ${females} female`);

    // Verify
    const { data: check } = await supabase.from('content_authors').select('name').in('name', JARGON_NAMES);
    console.log(`   Remaining jargon: ${check?.length || 0}`);
    if (check?.length === 0) console.log('🎉 ALL JARGON NAMES ELIMINATED!');
    else check?.forEach(h => console.log(`   STILL: "${h.name}"`));

    // Final overall stats
    const { data: gStats } = await supabase.from('content_authors')
        .select('gender').gte('created_at', '2026-03-11T00:00:00');
    const m = gStats?.filter(h => h.gender === 'male').length || 0;
    const f = gStats?.filter(h => h.gender === 'female').length || 0;
    console.log(`\n📊 FINAL GENDER: ${m} male / ${f} female (${((f/(m+f))*100).toFixed(1)}% female)`);
}

nuclearFix().catch(console.error);
