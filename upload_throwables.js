const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const imagesDir = '/Users/smarter.poker/.gemini/antigravity/brain/069a2729-d550-442d-8faa-88bead0471f4/';

async function run() {
    const files = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png') && f.includes('animated'));
    console.log(`Found ${files.length} png files to upload`);
    
    for (const file of files) {
        const filePath = path.join(imagesDir, file);
        const fileBuffer = fs.readFileSync(filePath);
        // Extract the base name without the timestamp if possible, or just keep it
        // e.g. alien_animated_12345.png -> alien_animated.png
        const baseName = file.replace(/_\d+\.png$/, '.png');
        const bucketPath = `throwables/${baseName}`;
        
        const { data, error } = await supabase.storage.from('images').upload(bucketPath, fileBuffer, {
            contentType: 'image/png',
            upsert: true
        });
        
        if (error) {
            console.error(`Error uploading ${file}:`, error);
        } else {
            console.log(`Successfully uploaded ${bucketPath}`);
        }
    }
}
run();
