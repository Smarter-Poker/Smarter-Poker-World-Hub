const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkVenues() {
  console.log("---- CLUB JAQK ----");
  const jaqkRes = await supabase
    .from('poker_venues')
    .select('*')
    .ilike('name', '%JAQK%');
  if (jaqkRes.data) console.table(jaqkRes.data.map(r => ({ id: r.id, name: r.name, city: r.city, state: r.state, type: r.venue_type, logo: r.logo_url })));

  console.log("---- GRAND VICTORIA ----");
  const gvRes = await supabase
    .from('poker_venues')
    .select('*')
    .ilike('name', '%Grand Victoria%');
  if (gvRes.data) console.table(gvRes.data.map(r => ({ id: r.id, name: r.name, city: r.city, state: r.state, type: r.venue_type, logo: r.logo_url })));

  // Group all venues by city & state to find duplicates
  const allRes = await supabase
    .from('poker_venues')
    .select('id, name, city, state, venue_type, logo_url');
    
  if(allRes.data) {
     const groups = {};
     for (const v of allRes.data) {
         if (!v.city || !v.state) continue;
         const key = `${v.city.toLowerCase()}|${v.state.toLowerCase()}`;
         if (!groups[key]) groups[key] = [];
         groups[key].push(v);
     }
     
     console.log("---- GENERIC DUPLICATES ----");
     const toDelete = [];
     for (const [key, venues] of Object.entries(groups)) {
         if (venues.length > 1) {
             // Let's print out potential duplicates in the same city
             // A simple heuristic: if one venue's name is in the other, or they share a long prefix
             for(let i=0; i<venues.length; i++) {
                 for(let j=i+1; j<venues.length; j++) {
                     const v1 = venues[i];
                     const v2 = venues[j];
                     
                     // simple check
                     const n1 = v1.name.toLowerCase().replace(/[^a-z]/g, '');
                     const n2 = v2.name.toLowerCase().replace(/[^a-z]/g, '');
                     
                     if (n1.includes(n2) || n2.includes(n1)) {
                         console.log(`Potential Duplicate in ${key}: \n - [${v1.id}] ${v1.name} (Logo: ${!!v1.logo_url})\n - [${v2.id}] ${v2.name} (Logo: ${!!v2.logo_url})\n`);
                     }
                 }
             }
         }
     }
  }
}

checkVenues();
