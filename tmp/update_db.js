require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const BUCKET_NAME = 'venue-logos';

const TARGET_IDS = [2633, 3115, 3116, 2710, 2660];

const allVenuesPath1 = path.join(__dirname, '../data/all-venues.json');
const allVenuesPath2 = path.join(__dirname, '../public/data/all-venues.json');
const venues1 = JSON.parse(fs.readFileSync(allVenuesPath1, 'utf8'));
const venues2 = JSON.parse(fs.readFileSync(allVenuesPath2, 'utf8'));

async function main() {
    let successCount = 0;
    
    for (const id of TARGET_IDS) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${id}.png`;
        
        // Update DB
        const { error: dbError } = await supabase
            .from('poker_venues')
            .update({ logo_url: publicUrl })
            .eq('id', id);
            
        if (dbError) {
            console.error(`DB Update fail for ${id}:`, dbError);
            continue;
        }
        
        // Update JSON
        const updateVenue = (v) => {
            if (v.id == id) {
                v.logo_url = publicUrl;
                v.updated_at = new Date().toISOString();
            }
        };
        
        venues1.venues.forEach(updateVenue);
        venues2.venues.forEach(updateVenue);
        
        console.log(`✅ Updated ${id} -> ${publicUrl}`);
        successCount++;
    }
    
    venues1.updated_at = new Date().toISOString();
    venues2.updated_at = venues1.updated_at;
    
    fs.writeFileSync(allVenuesPath1, JSON.stringify(venues1, null, 2));
    fs.writeFileSync(allVenuesPath2, JSON.stringify(venues2, null, 2));
    
    console.log(`\nDone! Processed ${successCount}/${TARGET_IDS.length}`);
}

main().catch(console.error);
