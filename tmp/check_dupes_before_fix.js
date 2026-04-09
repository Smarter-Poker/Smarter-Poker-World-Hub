const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkDupes() {
  // Check if bestbet Jacksonville already exists
  const { data: bestbet } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, address, phone')
    .ilike('name', '%bestbet%');
  console.log('bestbet venues:', bestbet);

  // Check if Rivers Des Plaines already exists (Rivers Chicago might be dup)
  const { data: rivers } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, address, phone')
    .ilike('name', '%Rivers%');
  console.log('Rivers venues:', rivers);

  // Check if Wind Creek or Sands Bethlehem already exist
  const { data: sands } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, address, phone')
    .or('name.ilike.%Wind Creek%,name.ilike.%Sands Bethlehem%,name.ilike.%Bethlehem%');
  console.log('Sands/Wind Creek venues:', sands);

  // Check Jacksonville venues
  const { data: jax } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, address, phone')
    .ilike('city', '%Jacksonville%')
    .eq('state', 'FL');
  console.log('Jacksonville FL venues:', jax);

  // Check Bally's venues
  const { data: ballys } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, address, phone')
    .ilike('name', '%Bally%');
  console.log('Bally\'s venues:', ballys);

  // Check Horseshoe venues
  const { data: horseshoe } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, address, phone')
    .ilike('name', '%Horseshoe%');
  console.log('Horseshoe venues:', horseshoe);
}

checkDupes();
