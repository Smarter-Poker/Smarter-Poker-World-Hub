import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../../.env.local') }); // Load root .env.local

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const dir = '/Users/smarter.poker/.gemini/antigravity/brain/069a2729-d550-442d-8faa-88bead0471f4';
const bucketName = 'images';
const folderName = 'throwables';

async function uploadFiles() {
    const files = fs.readdirSync(dir).filter(f => f.includes('_animated_') && f.endsWith('.jpg'));
    console.log(`Found ${files.length} throwable images to upload.`);
    
    let uploadedCount = 0;
    for (const file of files) {
        const filePath = path.join(dir, file);
        const fileData = fs.readFileSync(filePath);
        const simplifiedName = file.replace(/_animated_\d+/, '') + (file.endsWith('.jpg') ? '' : '.jpg');
        const finalName = simplifiedName.endsWith('.jpg') ? simplifiedName : simplifiedName + '.jpg';
        const storagePath = `${folderName}/${finalName}`;

        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(storagePath, fileData, {
                contentType: 'image/jpeg',
                upsert: true
            });
            
        if (error) {
            console.error(`Failed to upload ${file}:`, error.message);
        } else {
            console.log(`Uploaded: ${storagePath}`);
            uploadedCount++;
        }
    }
    console.log(`\nFinished uploading ${uploadedCount} / ${files.length} items to the '${bucketName}' bucket under '${folderName}/'.`);
}

uploadFiles();
