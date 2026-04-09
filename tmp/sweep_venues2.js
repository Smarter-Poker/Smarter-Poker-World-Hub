const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function cleanVenues() {
  const allRes = await supabase.from('poker_venues').select('id, name, city, state, venue_type, logo_url');
  if(!allRes.data) return;

  const groups = {};
  for (const v of allRes.data) {
     if (!v.city || !v.state) continue;
     const key = `${v.city.toLowerCase()}|${v.state.toLowerCase()}`;
     if (!groups[key]) groups[key] = [];
     groups[key].push(v);
  }
  
  let toDelete = [];
  
  for (const [key, venues] of Object.entries(groups)) {
     if (venues.length > 1) {
         for(let i=0; i<venues.length; i++) {
             for(let j=i+1; j<venues.length; j++) {
                 const v1 = venues[i];
                 const v2 = venues[j];
                 
                 const n1 = v1.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                 const n2 = v2.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                 
                 if (n1.includes(n2) || n2.includes(n1)) {
                     let badId = null;
                     if (v1.logo_url && !v2.logo_url) badId = v2.id;
                     else if (v2.logo_url && !v1.logo_url) badId = v1.id;
                     else {
                        if (v1.name.length > v2.name.length) badId = v2.id;
                        else badId = v1.id;
                     }
                     
                     if (badId && !toDelete.includes(badId)) {
                        toDelete.push(badId);
                     }
                 }
             }
         }
     }
  }

  const jaqkRes = await supabase.from('poker_venues').select('*').ilike('name', '%JAQK%');
  if(jaqkRes.data) {
    for (const j of jaqkRes.data) {
       if(!j.logo_url && !toDelete.includes(j.id)) toDelete.push(j.id);
    }
  }

  const gvRes = await supabase.from('poker_venues').select('*').ilike('name', 'Grand Victoria');
  if(gvRes.data) {
    for (const g of gvRes.data) {
       if(g.name === 'Grand Victoria' && !toDelete.includes(g.id)) toDelete.push(g.id);
    }
  }

  console.log(`Found ${toDelete.length} duplicates to delete. Proceeding one by one...`);
  
  for (const id of toDelete) {
      const res = await supabase.from('poker_venues').delete().eq('id', id);
      if (res.error) {
          console.error(`Could not delete [${id}]: ${res.error.message}`);
      } else {
          console.log(`Deleted [${id}]`);
      }
  }
}

cleanVenues();
