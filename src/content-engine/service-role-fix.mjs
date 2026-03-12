/**
 * 🐴 SERVICE ROLE FIX — Uses service_role key to bypass RLS
 * Targets IDs >= 201 with jargon names
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// USE SERVICE ROLE KEY — bypasses RLS
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Service role key loaded:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'YES' : 'NO');

const NAMES = [
    {n:'Craig Bellingham',g:'male'},{n:'Dwight Harford',g:'male'},
    {n:'Elliott Granville',g:'male'},{n:'Floyd Remington',g:'male'},
    {n:'Gerald Stanworth',g:'male'},{n:'Hugh Davenport',g:'male'},
    {n:'Irving Caulfield',g:'male'},{n:'Jerome Whiteside',g:'male'},
    {n:'Keith Holcombe',g:'male'},{n:'Lester Blackstone',g:'male'},
    {n:'Murray Ashcroft',g:'male'},{n:'Neville Rutherford',g:'male'},
    {n:'Percy Marlowe',g:'male'},{n:'Quentin Kingswood',g:'male'},
    {n:'Rupert Westcott',g:'male'},{n:'Stuart Greyson',g:'male'},
    {n:'Tobias Aldridge',g:'male'},{n:'Ulysses Thornbury',g:'male'},
    {n:'Vincent Worthing',g:'male'},{n:'Wendell Banfield',g:'male'},
    {n:'Malcolm Colquitt',g:'male'},{n:'Clifford Fenwick',g:'male'},
    {n:'Giancarlo Benelli',g:'male'},{n:'Darnell Beauregard',g:'male'},
    {n:'Jasper Kingsley',g:'male'},{n:'Maxwell Fairfax',g:'male'},
    {n:'Antoine Beauchamp',g:'male'},{n:'Byron Clarkson',g:'male'},
    {n:'Clarence Humphrey',g:'male'},{n:'Damon Prescott',g:'male'},
    {n:'Edison Meriwether',g:'male'},{n:'Floyd Garrison',g:'male'},
    {n:'Gerald Thornhill',g:'male'},{n:'Herman Caldwell',g:'male'},
    {n:'Isaac Pemberton',g:'male'},{n:'Jerome Willoughby',g:'male'},
    {n:'Kelvin Stratford',g:'male'},{n:'Luther Ainsworth',g:'male'},
    {n:'Melvin Blackford',g:'male'},{n:'Norman Ashworth',g:'male'},
    {n:'Ossie Devereaux',g:'male'},{n:'Percival Langston',g:'male'},
    {n:'Quinton Radcliffe',g:'male'},{n:'Roderick Fairview',g:'male'},
    {n:'Sidney Beaufort',g:'male'},{n:'Thurston Kingfield',g:'male'},
    {n:'Alvaro Bustamante',g:'male'},{n:'Benito Castellanos',g:'male'},
    {n:'Cristian Delgadillo',g:'male'},{n:'Domingo Echevarria',g:'male'},
    {n:'Esteban Figueroa',g:'male'},{n:'Facundo Gonzalez',g:'male'},
    {n:'Gonzalo Hernandez',g:'male'},{n:'Horacio Ibarburen',g:'male'},
    {n:'Ignacio Jaramillo',g:'male'},{n:'Joaquin Villasenor',g:'male'},
    {n:'Leandro Madrigal',g:'male'},{n:'Maximiliano Cortez',g:'male'},
    {n:'Patricio Valenzuela',g:'male'},{n:'Rodrigo Bustamante',g:'male'},
    {n:'Alvin Hashimoto',g:'male'},{n:'Bruce Matsubara',g:'male'},
    {n:'Cecil Nakagawa',g:'male'},{n:'Donald Takemura',g:'male'},
    {n:'Edwin Yoshikawa',g:'male'},{n:'Gordon Fujimori',g:'male'},
    {n:'Harold Kitamura',g:'male'},{n:'Ivan Matsuzaka',g:'male'},
    {n:'Karl Watanabe',g:'male'},{n:'Leonard Tsukamoto',g:'male'},
    {n:'Ashwin Chakravarti',g:'male'},{n:'Chandra Krishnamurthy',g:'male'},
    {n:'Harish Balakrishnan',g:'male'},{n:'Manish Sundaresan',g:'male'},
    {n:'Naveen Ramachandran',g:'male'},{n:'Adnan Barghouti',g:'male'},
    {n:'Bassam Khayyat',g:'male'},{n:'Imran Siddiqui',g:'male'},
    {n:'Jamal Abubakar',g:'male'},{n:'Mustafa Celikoglu',g:'male'},
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

async function serviceRoleFix() {
    console.log('🐴 SERVICE ROLE FIX — Bypasses RLS\n');

    // Test write capability first
    const { data: testData, error: testErr } = await supabase
        .from('content_authors')
        .select('id, name')
        .eq('id', 201)
        .single();
    
    console.log(`Test read: id=201 name="${testData?.name}" err=${testErr?.message || 'none'}`);

    // Try a test update
    const { error: testUpdateErr } = await supabase
        .from('content_authors')
        .update({ name: 'TEST_UPDATE_CHECK' })
        .eq('id', 201);
    
    console.log(`Test update: err=${testUpdateErr?.message || 'none'}`);

    // Verify test update persisted
    const { data: verifyTest } = await supabase.from('content_authors').select('name').eq('id', 201).single();
    console.log(`After test: name="${verifyTest?.name}"`);
    
    if (verifyTest?.name !== 'TEST_UPDATE_CHECK') {
        console.error('❌ UPDATE DID NOT PERSIST! RLS still blocking. Cannot proceed.');
        return;
    }

    console.log('✅ Writes confirmed working with service role key\n');

    // Get all horses with ID >= 201
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id, location')
        .gte('id', 201)
        .order('id');

    console.log(`Total horses id>=201: ${horses?.length}\n`);

    // Get used names/aliases from OTHER horses (id < 201)
    const { data: others } = await supabase.from('content_authors').select('name, alias').lt('id', 201);
    const usedN = new Set((others || []).map(h => h.name?.toLowerCase()));
    const usedA = new Set((others || []).map(h => h.alias?.toLowerCase()));

    const pool = [...NAMES].sort(() => Math.random() - 0.5);
    let nameIdx = 0, success = 0, females = 0;

    for (const horse of (horses || [])) {
        let entry;
        while (nameIdx < pool.length) {
            entry = pool[nameIdx++];
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

        // Update content_authors by EXACT ID
        await supabase.from('content_authors')
            .update({ name: entry.n, alias, gender: entry.g })
            .eq('id', horse.id);

        // Update profiles
        if (horse.profile_id) {
            await supabase.from('profiles')
                .update({ full_name: entry.n, display_name: entry.n, username: alias })
                .eq('id', horse.profile_id);
        }

        success++;
        if (success % 50 === 0 || success <= 3 || success === (horses?.length || 0)) {
            console.log(`[${success}] id=${horse.id} "${horse.name}" → "${entry.n}" (${entry.g}) @${alias}`);
        }
    }

    console.log(`\n✅ DONE: ${success} horses updated`);
    console.log(`   Gender: ${success-females} male / ${females} female (${((females/success)*100).toFixed(1)}% female)`);

    // FULL VERIFY
    const { data: fullCheck } = await supabase.from('content_authors')
        .select('id, name, gender')
        .gte('id', 201)
        .order('id');

    const mNames = fullCheck?.filter(h => h.gender === 'male').length || 0;
    const fNames = fullCheck?.filter(h => h.gender === 'female').length || 0;
    console.log(`\n📊 FINAL: ${mNames} male / ${fNames} female`);

    // Show sample names
    console.log('\nSample names:');
    fullCheck?.slice(0, 10).forEach(h => console.log(`  id=${h.id} "${h.name}" (${h.gender})`));
}

serviceRoleFix().catch(console.error);
