require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const BUCKET_NAME = 'venue-logos';
const TARGET_ID = 1868;
const DUPE_ID = 2313;
const fileName = `${TARGET_ID}.png`;
const LOGO_URL = "https://upload.wikimedia.org/wikipedia/en/a/a0/Rivers_Casino_%28Des_Plaines%29_Logo.png";

// Paths to static JSON
const allVenuesPath1 = path.join(__dirname, '../data/all-venues.json');
const allVenuesPath2 = path.join(__dirname, '../public/data/all-venues.json');

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function main() {
    console.log(`Reading logo for Rivers Casino Des Plaines...`);
    const fileBuffer = fs.readFileSync('/tmp/1868.png');
    
    console.log(`Uploading to Supabase bucket...`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: 'image/png',
        upsert: true
      });
      
    if (uploadError) {
      console.error(`Failed to upload ${fileName}:`, uploadError);
      process.exit(1);
    }
    
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);
      
    const publicUrl = publicUrlData.publicUrl;
    console.log(`Public URL: ${publicUrl}`);
    
    console.log(`Updating venue ID ${TARGET_ID} in database...`);
    const { error: dbError } = await supabase
      .from('poker_venues')
      .update({ logo_url: publicUrl })
      .eq('id', TARGET_ID);
      
    if (dbError) {
      console.error('Failed to update DB for target venue:', dbError);
    } else {
      console.log('Successfully updated logo_url for ID 1868.');
    }
    
    console.log(`Attempting to remove duplicate ID ${DUPE_ID}...`);
    const { error: deleteError } = await supabase
      .from('poker_venues')
      .delete()
      .eq('id', DUPE_ID);
      
    if (deleteError) {
      console.error('Failed to delete duplicate (could be FK references). Attempting to nullify coordinates instead.', deleteError);
      
      const { error: hideError } = await supabase
        .from('poker_venues')
        .update({ latitude: null, longitude: null, name: 'Rivers Chicago (DUPLICATE)' })
        .eq('id', DUPE_ID);
        
      if (hideError) {
        console.error('Failed to hide duplicate:', hideError);
      } else {
        console.log('Successfully hid duplicate from map by nullifying coordinates.');
      }
    } else {
      console.log('Successfully deleted duplicate ID 2313.');
    }

    // Update JSON mapping if they exist
    try {
      if (fs.existsSync(allVenuesPath1)) {
        const venues1 = JSON.parse(fs.readFileSync(allVenuesPath1, 'utf8'));
        venues1.venues.forEach(v => {
          if (v.id == TARGET_ID) v.logo_url = publicUrl;
        });
        
        // Remove duplicate
        venues1.venues = venues1.venues.filter(v => v.id != DUPE_ID);
        venues1.updated_at = new Date().toISOString();
        
        fs.writeFileSync(allVenuesPath1, JSON.stringify(venues1, null, 2));
      }

      if (fs.existsSync(allVenuesPath2)) {
        const venues2 = JSON.parse(fs.readFileSync(allVenuesPath2, 'utf8'));
        venues2.venues.forEach(v => {
          if (v.id == TARGET_ID) v.logo_url = publicUrl;
        });
        
        // Remove duplicate
        venues2.venues = venues2.venues.filter(v => v.id != DUPE_ID);
        venues2.updated_at = new Date().toISOString();
        
        fs.writeFileSync(allVenuesPath2, JSON.stringify(venues2, null, 2));
      }
      console.log("JSON registries updated!");
    } catch(err) {
      console.log("Error updating json registries", err);
    }
}

main().catch(console.error);
