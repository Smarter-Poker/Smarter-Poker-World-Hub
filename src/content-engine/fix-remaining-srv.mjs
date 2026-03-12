/**
 * Fix remaining ~65 horses with service_role key
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

// 80 more names for the remaining batch
const NAMES = [
    {n:'Alistair Drummond',g:'male'},{n:'Bradford Kensington',g:'male'},
    {n:'Chadwick Ellsworth',g:'male'},{n:'Donovan Sherwood',g:'male'},
    {n:'Emerson Blackwell',g:'male'},{n:'Franklin Langford',g:'male'},
    {n:'Gideon Whitaker',g:'male'},{n:'Harrison Ainsworth',g:'male'},
    {n:'Ibrahim Suleiman',g:'male'},{n:'Jefferson Claremont',g:'male'},
    {n:'Kingston Beaufort',g:'male'},{n:'Lawrence Devereaux',g:'male'},
    {n:'Montgomery Fairchild',g:'male'},{n:'Nigel Pemberton',g:'male'},
    {n:'Orville Castleford',g:'male'},{n:'Princeton Ashworth',g:'male'},
    {n:'Randolph Blackstone',g:'male'},{n:'Sheldon Kingsbury',g:'male'},
    {n:'Terrence Fairfield',g:'male'},{n:'Ulrich Winterbourne',g:'male'},
    {n:'Virgil Stanstead',g:'male'},{n:'Wolfgang Eisenberg',g:'male'},
    {n:'Alejandro Cisneros',g:'male'},{n:'Bernardo Montemayor',g:'male'},
    {n:'Celestino Rivera',g:'male'},{n:'Damian Velasquez',g:'male'},
    {n:'Eduardo Saenz',g:'male'},{n:'Filiberto Aragon',g:'male'},
    {n:'Takeshi Mizoguchi',g:'male'},{n:'Kenji Nishikawa',g:'male'},
    {n:'Rajan Subramaniam',g:'male'},{n:'Vikram Chattopadhyay',g:'male'},
    {n:'Omar Abdulrahman',g:'male'},{n:'Tariq Habibi',g:'male'},
    // Female
    {n:'Adelaide Warrington',g:'female'},{n:'Birgitte Andersen',g:'female'},
    {n:'Catherine Blackwood',g:'female'},{n:'Diana Covington',g:'female'},
    {n:'Evangeline Darcy',g:'female'},{n:'Francesca Ellingham',g:'female'},
    {n:'Georgina Foxworth',g:'female'},{n:'Henrietta Gladstone',g:'female'},
    {n:'Isadora Harrington',g:'female'},{n:'Jacqueline Ivanov',g:'female'},
    {n:'Katharina Jorgensen',g:'female'},{n:'Lucinda Kensington',g:'female'},
    {n:'Marguerite Lazenby',g:'female'},{n:'Natasha Montague',g:'female'},
    {n:'Octavia Nightingale',g:'female'},{n:'Penelope Oxbridge',g:'female'},
    {n:'Rosalind Pembroke',g:'female'},{n:'Seraphina Quincey',g:'female'},
    {n:'Thomasina Radford',g:'female'},{n:'Valentina Salvatore',g:'female'},
    {n:'Xiomara Delgado',g:'female'},{n:'Yasmine Boutros',g:'female'},
    {n:'Zelda Pemberton',g:'female'},{n:'Anabel Forsythe',g:'female'},
    {n:'Cassandra Worthington',g:'female'},{n:'Delilah Strathmere',g:'female'},
    {n:'Eleanora Blackwood',g:'female'},{n:'Guinevere Ashford',g:'female'},
    {n:'Helena Ravenscroft',g:'female'},{n:'Isolde Beauchamp',g:'female'},
    {n:'Josephina Dalrymple',g:'female'},{n:'Linnea Sveinsdottir',g:'female'},
    {n:'Milagros Villanueva',g:'female'},{n:'Renata Cavalcanti',g:'female'},
    {n:'Sachiko Kurosawa',g:'female'},{n:'Priyanka Vishwanath',g:'female'},
];

function genAlias(name, loc, idx) {
    const f = name.split(' ')[0], l = name.split(' ').slice(-1)[0].replace(/'/g,'');
    const yr = 1985+(idx%15), num = (idx*7+13)%100;
    const cm = {'Las Vegas':'lv','Los Angeles':'la','Miami':'mia','Houston':'htx','Chicago':'chi','Austin':'atx','Denver':'den','Phoenix':'phx','Seattle':'sea','Portland':'pdx','Boston':'bos','Detroit':'det','Tampa':'tpa','Nashville':'nsh','Atlanta':'atl','San Francisco':'sf','New York':'nyc'};
    let c=''; for(const[k,v]of Object.entries(cm)){if(loc?.includes(k)){c=v;break;}} if(!c)c=(loc?.split(',')[0]?.slice(0,3)||'us').toLowerCase();
    const p=[`${f.toLowerCase()}_${l.toLowerCase()}${num}`,`${f}${l.slice(0,1)}_${c}`,`${c}${f.toLowerCase()}${yr%100}`,`${f.toLowerCase()}.${l.toLowerCase()}`,`${l}${f.slice(0,1)}${num}`,`${f}${yr}`,`the_${l.toLowerCase()}`,`${f.slice(0,1).toLowerCase()}${l.toLowerCase()}_${num}`,`${f.toLowerCase()}x${num}`,`${l.toLowerCase()}.${f.toLowerCase()}`,`${c}_${f.toLowerCase()}${num}`,`${f.toLowerCase()}${l.slice(0,3).toLowerCase()}${yr}`,`real_${f.toLowerCase()}${l.slice(0,1).toLowerCase()}`,`${f}${l}`,`${f.toLowerCase()}${num}${c}`];
    return p[idx%p.length];
}

async function fixRemaining() {
    console.log('🐴 FIX REMAINING (service_role)\n');

    // Get remaining jargon horses
    const { data: horses } = await supabase.from('content_authors')
        .select('id, name, alias, gender, profile_id, location')
        .gte('id', 201).order('id');

    const JARGON = /Bet|Fold|Bluff|Call|Raise|Pot|Chip|Stack|Grind|Table|Seat|Muck|Ante|Blind|Rake|Draw|Flush|Straight|Pair|GTO|ICM|EV|PLO|MTT|SNG|HUD|Straddle|Turbo|Rebuy|Addon|Bubble|Tourney|Freeze|Bounty|KnockOut|Jackpot|Spin|Session|Lag|Nit|Aggro|Passive|Tight|Loose|Value|Exploit|Float|Implied|Semi|Barrel|Probe|Delayed|Pure|Reverse|Nash|Equity|Variance|Swing|Coach|Observer|Sweat|Tracker|History|Data|Numbers|Break|Promo|MainEvent|CashKing|SatPlayer|BonusHunter|RakeBack|SideEvent|Hyper|Shallow|HeadsUp|Warrior|Special|Squeeze|Resteal|Hunter|Dealer|AvgStack|Lead|Final|Corner|Tricky|Maniac|Goose|Rock|Fiona|Beast|Andy|Pete|Fist|King|Machine|Town|Rita|Odds|Delay|Master|Guy|Cut|Down|BalancedBF|Under|Over|Thin|Pressure|Money|Player|Roller|Nano|Micro|High|Mid|Low|Reg|Early|Select|Off|Peak|Weekend|TopUp|Wait|Auto|Night|SitOut|SitIn|CashOut|Quick|PostBB|WaitBB|RunIt|ShowCards|Coach|Time|Snap|Disconnect|Rail|Review|Reconnect|Observer|Horse|Stat|Up|Down|Swing|Variance|HUD|Data|Numbers|BreakThrough/i;

    const jargon = horses?.filter(h => {
        const n = h.name||'';
        if(!n.includes(' '))return true;
        if(JARGON.test(n))return true;
        return false;
    })||[];

    console.log(`Still jargon: ${jargon.length}`);
    if (!jargon.length) { console.log('✅ ALL DONE!'); return; }

    // Get used names/aliases
    const { data: all } = await supabase.from('content_authors').select('id, name, alias');
    const usedN = new Set(), usedA = new Set();
    for (const h of all||[]) {
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

        await supabase.from('content_authors')
            .update({ name: entry.n, alias, gender: entry.g })
            .eq('id', horse.id);

        if (horse.profile_id) {
            await supabase.from('profiles')
                .update({ full_name: entry.n, display_name: entry.n, username: alias })
                .eq('id', horse.profile_id);
        }

        success++;
        if (success % 20 === 0 || success <= 3) {
            console.log(`[${success}] id=${horse.id} "${horse.name}" → "${entry.n}" (${entry.g}) @${alias}`);
        }
    }

    console.log(`\n✅ Fixed ${success} more (${success-females}M / ${females}F)\n`);

    // Full verification
    const { data: final } = await supabase.from('content_authors')
        .select('id, name, gender')
        .gte('id', 201).order('id');

    const stillBad = final?.filter(h => {
        const n = h.name||'';
        return !n.includes(' ') || JARGON.test(n);
    })||[];

    const m = final?.filter(h => h.gender === 'male').length || 0;
    const f = final?.filter(h => h.gender === 'female').length || 0;

    console.log(`📊 FINAL: ${m} male / ${f} female (${((f/(m+f))*100).toFixed(1)}% female)`);
    console.log(`Remaining jargon: ${stillBad.length}`);
    if (stillBad.length === 0) console.log('🎉 ALL 208 HORSES HAVE REAL NAMES!');
    else stillBad.slice(0,5).forEach(h => console.log(`  STILL: id=${h.id} "${h.name}"`));
}

fixRemaining().catch(console.error);
