require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET_NAME = 'venue-logos';
const TARGET_ID = 2611;

// Use the local image we found
const localImagePath = path.join(__dirname, '../public/images/tours/cppt.jpg');
const fileName = `${TARGET_ID}.jpg`;

const allVenuesPath1 = path.join(__dirname, '../data/all-venues.json');
const allVenuesPath2 = path.join(__dirname, '../public/data/all-venues.json');
const venues1 = JSON.parse(fs.readFileSync(allVenuesPath1, 'utf8'));
const venues2 = JSON.parse(fs.readFileSync(allVenuesPath2, 'utf8'));

async function main() {
    console.log(`Processing ID ${TARGET_ID}...`);
    
    if (!fs.existsSync(localImagePath)) {
      console.error(`File not found: ${localImagePath}`);
      process.exit(1);
    }
    
    // Upload to Supabase
    const fileBuffer = fs.readFileSync(localImagePath);
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });
      
    if (error) {
      console.error(`Failed to upload ${fileName}:`, error);
      process.exit(1);
    }
    
    console.log(`Successfully uploaded ${fileName}`);
    
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);
      
    const publicUrl = publicUrlData.publicUrl;
    console.log(`Public URL: ${publicUrl}`);
    
    // Update active database 
    const { data: dbData, error: dbError } = await supabase
      .from('poker_venues')
      .update({ logo_url: publicUrl })
      .eq('id', TARGET_ID);
      
    if (dbError) {
      console.error('Failed to update DB:', dbError);
    } else {
      console.log('Successfully updated logo_url in Supabase database.');
    }
    
    // Update JSON mapping
    const updateVenue = (v) => {
      if (v.id == TARGET_ID) {
        v.logo_url = publicUrl;
      }
    };
    
    venues1.venues.forEach(updateVenue);
    venues2.venues.forEach(updateVenue);
    
    venues1.updated_at = new Date().toISOString();
    venues2.updated_at = venues1.updated_at;
    
    fs.writeFileSync(allVenuesPath1, JSON.stringify(venues1, null, 2));
    fs.writeFileSync(allVenuesPath2, JSON.stringify(venues2, null, 2));
    
    console.log("JSON registries updated!");
}

main().catch(console.error);
