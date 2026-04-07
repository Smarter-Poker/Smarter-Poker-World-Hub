const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Extract config from project
const configContent = fs.readFileSync('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/src/config/supabase.js', 'utf8');
const urlMatch = configContent.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
const keyMatch = configContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

if (!urlMatch || !keyMatch) {
    console.log("Could not find supabase credentials in config file");
    process.exit(1);
}

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function test() {
    const { data, error } = await supabase.from('db_venues').select('id, name, venue_type, latitude, longitude').ilike('name', '%Grand Victoria%');
    console.log("Query result:");
    console.log(JSON.stringify(data, null, 2));
    if (error) console.error(error);
}

test();
