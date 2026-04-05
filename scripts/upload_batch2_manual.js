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
  { id: 2189, file: 'media__1775368829546.png', ext: 'png' }, // Crystal Casino
  { id: 2225, file: 'media__1775368835283.png', ext: 'png' }, // Elk Valley Casino
  { id: 1927, file: 'media__1775368839189.jpg', ext: 'jpg' }, // Oaks Card Club
  { id: 2215, file: 'media__1775368844534.png', ext: 'png' }, // Club One Casino
  { id: 1822, file: 'media__1775368848499.jpg', ext: 'jpg' }, // Hustler Casino
  { id: 2678, file: 'media__1775368996029.jpg', ext: 'jpg' }, // Hustler Casino Live
  { id: 2876, file: 'media__1775369001135.png', ext: 'png' }, // Lucky Lady Casino
  { id: 2188, file: 'media__1775369005007.png', ext: 'png' }, // Normandie Casino
  { id: 1938, file: 'media__1775369009968.jpg', ext: 'jpg' }, // Garlic City Casino
  { id: 2887, file: 'media__1775369014843.jpg', ext: 'jpg' }, // Towers Casino

  // Extra batch 1 files that were uploaded separately:
  { id: 1856, file: 'media__1775367550645.png', ext: 'png' }, // Saracen Casino Resort
  { id: 1853, file: 'media__1775367561468.png', ext: 'png' }, // Talking Stick Resort
  { id: 3028, file: 'media__1775367565159.jpg', ext: 'jpg' }, // Desert Diamond White Tanks
  { id: 3029, file: 'media__1775367568694.png', ext: 'png' }  // Gila River Casino
];

const BUCKET_NAME = 'venue-logos';
const DATA_DIR = '/Users/smarter.poker/.gemini/antigravity/brain/56c9d83b-5293-4b71-ae97-f90422039b71/';

const allVenuesPath1 = path.join(__dirname, '../data/all-venues.json');
const allVenuesPath2 = path.join(__dirname, '../public/data/all-venues.json');
const venues1 = JSON.parse(fs.readFileSync(allVenuesPath1, 'utf8'));
const venues2 = JSON.parse(fs.readFileSync(allVenuesPath2, 'utf8'));

async function main() {
  for (const upload of uploads) {
    const filePath = path.join(DATA_DIR, upload.file);
    const fileName = `${upload.id}.${upload.ext}`;
    
    console.log(`Processing ID ${upload.id}...`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      continue;
    }
    
    let mimeType = 'image/png';
    if (upload.ext === 'jpg') mimeType = 'image/jpeg';
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
      if (v.id === upload.id) {
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
