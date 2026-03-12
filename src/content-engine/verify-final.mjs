/**
 * Final verification — show all 208 horse names
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
    const { data } = await supabase.from('content_authors')
        .select('id, name, alias, gender')
        .gte('id', 201).order('id');

    console.log(`Total: ${data?.length}\n`);

    // Check for REAL jargon (poker terms, not substrings of names)
    const STRICT_JARGON = ['ThreeBet','NutFlush','SnapCall','SetMiner','PocketPair','RiverRat',
        'StraightDraw','OverBet','BottomPair','FlushDraw','OverPair','CheckBack','SplitPot',
        'DonkBet','SqueezePlay','ColdCall','PostFlop','AnteUp','XRaise','CBet','Straddle',
        'BombPot','DoubleBoard','EffStack','StackDepth','JamShove','StealBlind','RestealRob',
        'RiverBluff','TurnBet','PreFlop','MPGrinder','BBSpecial','SBWarrior','HeadsUpHero',
        'ShortDeck','PLO Player','DeepStack','ChipDown','ChipUp','ShortStack','BigStack',
        'MedStack','ShallowStack','TurboTime','BreakEven','HyperTurbo','PromoPlay','RakeBack',
        'MainEvent','BonusHunter','SatPlayer','CashKing','TourneyPro','FreezeOut','ProgKO',
        'BountyBuilder','KnockOut','JackpotSit','SpinGo','SNGMaster','RebuyKing','LateReg',
        'AddonAce','BubbleBoy','BigBlind','SmallBl','RakeHunter','TableCap','Dealer DLR',
        'AvgStack','ChipLeadCL','FinalTableFT','ShortChip','NitCorner','TagTeam','TrickyTom',
        'ManiacMax','VolTable','GrinderKing','LooseGoose','SolidRock','SessionPro','LagLife',
        'FoldingFiona','BettingBeast','AggroAndy','PassivePete','TightFist','BluffKing',
        'CallingMachine','ValueTown','RaisingRita','PotOdds','ProbePlay','DelayedCB',
        'PureBluff','ReverseIO','FloatMaster','ImpliedGuy','SemiBluff','ValueCut','BarrelDown',
        'FoldEquityFE','BalancedBF','UnderBluff','GTOPlayer','NashEqui','OverBluff','ExploitBF',
        'ThinBluff','ChipEV','ICMPressure','RealMoney','PlayMoney','RecPlayer','RollerHigh',
        'NanoStakes','MicroStakes','HighStakes','MidStakes','LowStakes','NitReg','EarlyBird',
        'TableSelect','SeatSelect','OffPeak','PeakHours','WeekendW','TopUp','WaitList',
        'AutoRebuy','NightOwl','SitOut','SitIn','CashOut','MuckHand','AutoFold','QuickFold',
        'PostBB','WaitBB','RunItTwice','ShowCards','CoachMode','TimeBank','SnapFold',
        'Disconnect','RailBird','ReviewHand','Reconnect','ObserverOB','SweatHorse',
        'HandHistory','StatTracker','UpSwing','DownSwing','SwingTrader','VarianceKing',
        'HUDMaster','DataDriven','NumbersCrunch','BreakThrough'];

    const realJargon = data?.filter(h => {
        const n = h.name||'';
        if (!n.includes(' ')) return true; // Single word = bad
        return STRICT_JARGON.some(j => n.includes(j));
    })||[];

    console.log(`Real jargon names: ${realJargon.length}`);
    realJargon.forEach(h => console.log(`  ❌ id=${h.id} "${h.name}"`));

    // Gender
    const m = data?.filter(h => h.gender === 'male').length || 0;
    const f = data?.filter(h => h.gender === 'female').length || 0;
    console.log(`\nGender: ${m} male / ${f} female (${((f/(m+f))*100).toFixed(1)}% female)`);

    // Show unique alias check
    const aliases = data?.map(h => h.alias?.toLowerCase()) || [];
    const uniqueAliases = new Set(aliases);
    console.log(`\nAliases: ${aliases.length} total, ${uniqueAliases.size} unique`);
    if (aliases.length !== uniqueAliases.size) {
        console.log('⚠️ DUPLICATE ALIASES DETECTED!');
        const counts = {};
        aliases.forEach(a => counts[a] = (counts[a]||0)+1);
        Object.entries(counts).filter(([,c]) => c>1).forEach(([a,c]) => console.log(`  "${a}" x${c}`));
    }

    // Sample names
    console.log('\n📋 Sample (first 20):');
    data?.slice(0,20).forEach(h => console.log(`  id=${h.id} "${h.name}" (${h.gender}) @${h.alias}`));

    // Check for names containing common words that might look like jargon but aren't
    console.log('\n📋 Sample (last 20):');
    data?.slice(-20).forEach(h => console.log(`  id=${h.id} "${h.name}" (${h.gender}) @${h.alias}`));
}

verify().catch(console.error);
