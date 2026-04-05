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

const uploads = [
  { id: 2696, file: 'media__1775379603379.png', ext: 'png' }, // Jack Casino Cincinnati Poker Series
  { id: 2695, file: 'media__1775379606033.jpg', ext: 'jpg' }, // Jack Casino Cleveland Poker Series
  { id: 1880, file: 'media__1775379614159.png', ext: 'png' }, // Hollywood Columbus
  { id: 2697, file: 'media__1775379620049.jpg', ext: 'jpg' }, // Hollywood Columbus Poker Series
  { id: 2806, file: 'media__1775379629088.png', ext: 'png' }  // Shark Tank Poker Club
];

const BUCKET_NAME = 'venue-logos';
const DATA_DIR = '/Users/smarter.poker/.gemini/antigravity/brain/bb2f704f-bfe9-42aa-ae98-28af6da61a4a/';

const allVenuesPath1 = path.join(__dirname, '../data/all-venues.json');
const allVenuesPath2 = path.join(__dirname, '../public/data/all-venues.json');
const venues1 = JSON.parse(fs.readFileSync(allVenuesPath1, 'utf8'));
const venues2 = JSON.parse(fs.readFileSync(allVenuesPath2, 'utf8'));

// Change city for ID 2696 to Cleveland
const updateCity = (v) => {
  if (v.id === 2696) {
    v.city = "Cleveland";
    if (v.address) {
       v.address = v.address.replace(/Cincinnati/g, "Cleveland");
    }
  }
};
venues1.venues.forEach(updateCity);
venues2.venues.forEach(updateCity);
console.log("Updated ID 2696 city to Cleveland");

async function main() {
  for (const upload of uploads) {
    const filePath = path.join(DATA_DIR, upload.file);
    const fileName = `${upload.id}.${upload.ext}`;
    
    console.log(`Processing ID ${upload.id}...`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      continue;
    }
    
    let mimeType = 'image/jpeg';
    if (upload.ext === 'png') mimeType = 'image/png';
    else if (upload.ext === 'webp') mimeType = 'image/webp';
    else if (upload.ext === 'svg') mimeType = 'image/svg+xml';
    
    // Upload to Supabase
    const fileBuffer = fs.readFileSync(filePath);
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });
      
    if (error) {
      console.error(`Failed to upload ${fileName}:`, error);
      continue;
    }
    
    console.log(`Successfully uploaded ${fileName}`);
    
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);
      
    const publicUrl = publicUrlData.publicUrl;
    
    // Update JSON
    const updateVenue = (v) => {
      if (v.id == upload.id) {
        v.logo_url = publicUrl;
      }
    };
    
    venues1.venues.forEach(updateVenue);
    venues2.venues.forEach(updateVenue);
  }
  
  venues1.updated_at = new Date().toISOString();
  venues2.updated_at = venues1.updated_at;
  
  fs.writeFileSync(allVenuesPath1, JSON.stringify(venues1, null, 2));
  fs.writeFileSync(allVenuesPath2, JSON.stringify(venues2, null, 2));
  
  console.log("JSON registries updated!");
}

main().catch(console.error);
