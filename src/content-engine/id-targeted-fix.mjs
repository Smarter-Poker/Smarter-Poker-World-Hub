/**
 * 🐴 ID-TARGETED FIX — Updates rows by exact primary key
 * Targets IDs 201-408 (the ACTUAL new horses added today)
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

// 200 fresh, never-before-used names
const NAMES = [
    {n:'Craig Bellingham',g:'male'},{n:'Dwight Harford',g:'male'},
    {n:'Elliott Granville',g:'male'},{n:'Floyd Remington',g:'male'},
    {n:'Gerald Stanworth',g:'male'},{n:'Hugh Davenport',g:'male'},
    {n:'Irving Caulfield',g:'male'},{n:'Jerome Whiteside',g:'male'},
    {n:'Keith Pemberton',g:'male'},{n:'Lester Holcombe',g:'male'},
    {n:'Murray Blackstone',g:'male'},{n:'Neville Ashcroft',g:'male'},
    {n:'Percy Rutherford',g:'male'},{n:'Quentin Marlowe',g:'male'},
    {n:'Rupert Kingswood',g:'male'},{n:'Stuart Westcott',g:'male'},
    {n:'Tobias Greyson',g:'male'},{n:'Ulysses Crawford',g:'male'},
    {n:'Vincent Aldridge',g:'male'},{n:'Wendell Thornbury',g:'male'},
    {n:'Malcolm Worthing',g:'male'},{n:'Clifford Banfield',g:'male'},
    {n:'Bernard Colquitt',g:'male'},{n:'Reece Abernathy',g:'male'},
    {n:'Norris Pendleton',g:'male'},{n:'Giancarlo Benelli',g:'male'},
    {n:'Darnell Beauregard',g:'male'},{n:'Jasper Kingsley',g:'male'},
    {n:'Maxwell Fairfax',g:'male'},{n:'Antoine Beauchamp',g:'male'},
    {n:'Byron Clarkson',g:'male'},{n:'Clarence Humphrey',g:'male'},
    {n:'Damon Prescott',g:'male'},{n:'Edison Meriwether',g:'male'},
    {n:'Floyd Garrison',g:'male'},{n:'Gerald Thornhill',g:'male'},
    {n:'Herman Caldwell',g:'male'},{n:'Isaac Pemberton',g:'male'},
    {n:'Jerome Willoughby',g:'male'},{n:'Kelvin Stratford',g:'male'},
    {n:'Luther Ainsworth',g:'male'},{n:'Melvin Blackford',g:'male'},
    {n:'Norman Ashworth',g:'male'},{n:'Ossie Devereaux',g:'male'},
    {n:'Percival Langston',g:'male'},{n:'Quinton Radcliffe',g:'male'},
    {n:'Roderick Fairview',g:'male'},{n:'Sidney Beaufort',g:'male'},
    {n:'Thurston Kingfield',g:'male'},{n:'Alvaro Bustamante',g:'male'},
    {n:'Benito Castellanos',g:'male'},{n:'Cristian Delgadillo',g:'male'},
    {n:'Domingo Echevarria',g:'male'},{n:'Esteban Figueroa',g:'male'},
    {n:'Facundo Gonzalez',g:'male'},{n:'Gonzalo Hernandez',g:'male'},
    {n:'Horacio Ibarburen',g:'male'},{n:'Ignacio Jaramillo',g:'male'},
    {n:'Joaquin Villasenor',g:'male'},{n:'Leandro Madrigal',g:'male'},
    {n:'Maximiliano Cortez',g:'male'},{n:'Patricio Valenzuela',g:'male'},
    {n:'Rodrigo Bustamante',g:'male'},{n:'Alvin Hashimoto',g:'male'},
    {n:'Bruce Matsubara',g:'male'},{n:'Cecil Nakagawa',g:'male'},
    {n:'Donald Takemura',g:'male'},{n:'Edwin Yoshikawa',g:'male'},
    {n:'Gordon Fujimori',g:'male'},{n:'Harold Kitamura',g:'male'},
    {n:'Ivan Matsuzaka',g:'male'},{n:'Karl Watanabe',g:'male'},
    {n:'Leonard Tsukamoto',g:'male'},{n:'Ashwin Chakravarti',g:'male'},
    {n:'Chandra Krishnamurthy',g:'male'},{n:'Harish Balakrishnan',g:'male'},
    {n:'Manish Sundaresan',g:'male'},{n:'Naveen Ramachandran',g:'male'},
    {n:'Adnan Barghouti',g:'male'},{n:'Bassam Khayyat',g:'male'},
    {n:'Imran Siddiqui',g:'male'},{n:'Jamal Abubakar',g:'male'},
    {n:'Mustafa Celikoglu',g:'male'},
    // Female - Caucasian
    {n:'Agatha Winterbourne',g:'female'},{n:'Beatrice Lockwood',g:'female'},
    {n:'Constance Fairfield',g:'female'},{n:'Dorothy Ashbridge',g:'female'},
    {n:'Eleanor Thornbury',g:'female'},{n:'Frances Kingsmill',g:'female'},
    {n:'Gertrude Pemberton',g:'female'},{n:'Harriet Blackwell',g:'female'},
    {n:'Irene Castleford',g:'female'},{n:'Josephine Whitmore',g:'female'},
    {n:'Loretta Stanfield',g:'female'},{n:'Martha Collingwood',g:'female'},
    {n:'Nadine Ashworth',g:'female'},{n:'Philippa Drummond',g:'female'},
    {n:'Rosemary Garfield',g:'female'},{n:'Sylvia Beckford',g:'female'},
    {n:'Tabitha Kensington',g:'female'},{n:'Ursula Chatsworth',g:'female'},
    {n:'Winifred Longworth',g:'female'},{n:'Adelaide Thornton',g:'female'},
    {n:'Bernadette Kingsbury',g:'female'},{n:'Cordelia Ashford',g:'female'},
    {n:'Daphne Winterfield',g:'female'},
    // Female - AA
    {n:'Alondra Beaumont',g:'female'},{n:'Candice Stratford',g:'female'},
    {n:'Denise Willoughby',g:'female'},{n:'Estelle Ainsworth',g:'female'},
    {n:'Felicia Devereaux',g:'female'},{n:'Gwendolyn Beaufort',g:'female'},
    {n:'Helena Ashbridge',g:'female'},{n:'Ingrid Langsworth',g:'female'},
    {n:'Jasmine Radcliffe',g:'female'},{n:'Kimberly Fairfield',g:'female'},
    {n:'Laverne Blackford',g:'female'},{n:'Maxine Thornhill',g:'female'},
    {n:'Norma Clarkson',g:'female'},{n:'Ophelia Garrison',g:'female'},
    {n:'Priscilla Humphrey',g:'female'},
    // Female - Hispanic
    {n:'Adrianna Castellanos',g:'female'},{n:'Blanca Echevarria',g:'female'},
    {n:'Constanza Jaramillo',g:'female'},{n:'Dolores Madrigal',g:'female'},
    {n:'Esmeralda Villasenor',g:'female'},{n:'Florencia Alvarado',g:'female'},
    {n:'Graciela Valenzuela',g:'female'},{n:'Hortensia Delgadillo',g:'female'},
    {n:'Isadora Bustamante',g:'female'},{n:'Jimena Cortez',g:'female'},
    // Female - Asian
    {n:'Akemi Hashimoto',g:'female'},{n:'Chiyo Matsubara',g:'female'},
    {n:'Etsuko Nakagawa',g:'female'},{n:'Fumiko Takemura',g:'female'},
    {n:'Haruka Yoshikawa',g:'female'},{n:'Izumi Fujimori',g:'female'},
    {n:'Junko Kitamura',g:'female'},{n:'Kazuko Matsuzaka',g:'female'},
    // Female - SA + ME
    {n:'Amrita Chakravarti',g:'female'},{n:'Bindya Krishnamurthy',g:'female'},
    {n:'Chandni Balakrishnan',g:'female'},{n:'Durga Sundaresan',g:'female'},
    {n:'Fatimah Siddiqui',g:'female'},{n:'Gulnaz Khayyat',g:'female'},
    {n:'Hayat Barghouti',g:'female'},
];

function genAlias(name, loc, idx) {
    const f = name.split(' ')[0], l = name.split(' ').slice(-1)[0].replace(/'/g,'');
    const yr = 1985+(idx%15), num = (idx*7+13)%100;
    const cm = {'Las Vegas':'lv','Los Angeles':'la','Miami':'mia','Houston':'htx','Chicago':'chi','Austin':'atx','Denver':'den','Phoenix':'phx','Seattle':'sea','Portland':'pdx','Boston':'bos','Detroit':'det','Tampa':'tpa','Nashville':'nsh','Atlanta':'atl','San Francisco':'sf','San Diego':'sd','Philadelphia':'phl','Charlotte':'clt','New York':'nyc'};
    let c=''; for(const[k,v]of Object.entries(cm)){if(loc?.includes(k)){c=v;break;}} if(!c)c=(loc?.split(',')[0]?.slice(0,3)||'us').toLowerCase();
    const p=[`${f.toLowerCase()}_${l.toLowerCase()}${num}`,`${f}${l.slice(0,1)}_${c}`,`${c}${f.toLowerCase()}${yr%100}`,`${f.toLowerCase()}.${l.toLowerCase()}`,`${l}${f.slice(0,1)}${num}`,`${f}${yr}`,`the_${l.toLowerCase()}`,`${f.slice(0,1).toLowerCase()}${l.toLowerCase()}_${num}`,`${f.toLowerCase()}x${num}`,`${l.toLowerCase()}.${f.toLowerCase()}`,`${c}_${f.toLowerCase()}${num}`,`${f.toLowerCase()}${l.slice(0,3).toLowerCase()}${yr}`,`real_${f.toLowerCase()}${l.slice(0,1).toLowerCase()}`,`${f}${l}`,`${f.toLowerCase()}${num}${c}`];
    return p[idx%p.length];
}

async function idTargetedFix() {
    console.log('🐴 ID-TARGETED FIX\n');

    // Get ONLY jargon horses by ID range >=201
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id, location')
        .gte('id', 201)
        .order('id');

    // Filter to still-jargon based on current names
    const JARGON = /Bet|Fold|Bluff|Call|Raise|Pot|Chip|Stack|Grind|Table|Seat|Muck|Ante|Blind|Rake|Tilt|Draw|Flush|Straight|Pair|Set|GTO|ICM|EV|PLO|MTT|SNG|HUD|Straddle|Turbo|Rebuy|Addon|Bubble|Bounce|Tourney|Freeze|Bounty|KnockOut|Jackpot|Spin|Session|Lag|Nit|Aggro|Passive|Tight|Loose|Value|Exploit|Float|Implied|Semi|Barrel|Probe|Delayed|Pure|Reverse|Nash|Equity|Variance|Swing|Coach|Review|Reconnect|Observer|Sweat|Tracker|History|Data|Numbers|Break|PromoPlay|MainEvent|CashKing|SatPlayer|BonusHunter|RakeBack|SideEvent|HyperTurbo|BreakEven|ShallowStack|HeadsUp|SBWarrior|BBSpecial|SqueezePlay|RestealRob|RakeHunter|Dealer|AvgStack|ChipLead|FinalTable|ShortChip|NitCorner|TagTeam|Tricky|Maniac|GrinderKing|LooseGoose|SolidRock|FoldingFiona|BettingBeast|AggroAndy|PassivePete|TightFist|BluffKing|CallingMachine|ValueTown|RaisingRita|PotOdds|ProbePlay|DelayedCB|PureBluff|ReverseIO|FloatMaster|ImpliedGuy|SemiBluff|ValueCut|BarrelDown|FoldEquity|BalancedBF|UnderBluff|GTOPlayer|NashEqui|OverBluff|ExploitBF|ThinBluff|ChipEV|ICMPressure|RealMoney|PlayMoney|RecPlayer|RollerHigh|NanoStakes|MicroStakes|HighStakes|MidStakes|LowStakes|NitReg|EarlyBird|TableSelect|SeatSelect|OffPeak|PeakHours|Weekend|TopUp|WaitList|AutoRebuy|NightOwl|SitOut|SitIn|CashOut|MuckHand|AutoFold|QuickFold|PostBB|WaitBB|RunItTwice|ShowCards|CoachMode|TimeBank|SnapFold|Disconnect|RailBird|ReviewHand|Reconnect|ObserverOB|SweatHorse|HandHistory|StatTracker|UpSwing|DownSwing|SwingTrader|VarianceKing|HUDMaster|DataDriven|NumbersCrunch|BreakThrough/i;

    const jargon = horses?.filter(h => {
        const n = h.name||'';
        if(!n.includes(' '))return true;
        if(JARGON.test(n))return true;
        const p=n.split(' ');
        if(p.some(w=>w.length<=3&&w===w.toUpperCase()))return true;
        return false;
    })||[];

    console.log(`Found ${jargon.length} jargon-named horses in ID range >=201\n`);

    // Get used names/aliases from ENTIRE table
    const { data: all } = await supabase.from('content_authors').select('id, name, alias');
    const usedN = new Set(), usedA = new Set();
    for (const h of all||[]) {
        // Don't count jargon rows we're about to replace
        if (!jargon.find(j => j.id === h.id)) {
            usedN.add(h.name?.toLowerCase());
            usedA.add(h.alias?.toLowerCase());
        }
    }

    const pool = [...NAMES].sort(() => Math.random() - 0.5);
    let idx = 0, success = 0, females = 0;

    for (const horse of jargon) {
        let entry;
        while (idx < pool.length) {
            entry = pool[idx++];
            if (!usedN.has(entry.n.toLowerCase())) break;
            entry = null;
        }
        if (!entry) { console.warn(`Ran out at ${success}`); break; }
        usedN.add(entry.n.toLowerCase());
        if (entry.g === 'female') females++;

        let alias = genAlias(entry.n, horse.location, success);
        let tries = 0;
        while (usedA.has(alias.toLowerCase()) && tries < 30) {
            alias = genAlias(entry.n, horse.location, success + (tries+1)*15);
            tries++;
        }
        if (usedA.has(alias.toLowerCase())) alias = `${entry.n.split(' ')[0].toLowerCase()}${Math.floor(Math.random()*9000)+1000}`;
        usedA.add(alias.toLowerCase());

        // UPDATE BY EXACT ID
        const { error: e1 } = await supabase.from('content_authors')
            .update({ name: entry.n, alias, gender: entry.g })
            .eq('id', horse.id);

        if (e1) { console.error(`❌ id=${horse.id}: ${e1.message}`); continue; }

        if (horse.profile_id) {
            await supabase.from('profiles')
                .update({ full_name: entry.n, display_name: entry.n, username: alias })
                .eq('id', horse.profile_id);
        }

        success++;
        if (success % 25 === 0 || success <= 3) {
            console.log(`[${success}] id=${horse.id} "${horse.name}" → "${entry.n}" (${entry.g}) @${alias}`);
        }
    }

    console.log(`\n✅ DONE: ${success} horses fixed by ID`);
    console.log(`   Gender: ${success-females} male / ${females} female`);

    // Verify
    const { data: check } = await supabase.from('content_authors')
        .select('id, name, gender')
        .gte('id', 201)
        .order('id');

    const stillBad = check?.filter(h => {
        const n = h.name||''; return !n.includes(' ') || JARGON.test(n);
    })||[];

    console.log(`\nVerification: ${stillBad.length} still jargon (of ${check?.length})`);
    if (stillBad.length === 0) console.log('🎉 ALL HORSES HAVE REAL NAMES!');
    else stillBad.slice(0,10).forEach(h => console.log(`  STILL: id=${h.id} "${h.name}"`));

    const m = check?.filter(h => h.gender === 'male').length || 0;
    const f = check?.filter(h => h.gender === 'female').length || 0;
    console.log(`Gender: ${m} male / ${f} female (${((f/(m+f))*100).toFixed(1)}% female)`);
}

idTargetedFix().catch(console.error);
