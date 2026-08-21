const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const getEnv = (key) => {
    const match = envContent.match(new RegExp(`^${key}=['"]?(.*?)['"]?$`, 'm'));
    return match ? match[1] : null;
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL');
const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const dir = '/Users/smarter.poker/.gemini/antigravity/brain/069a2729-d550-442d-8faa-88bead0471f4';
const bucketName = 'images';
const folderName = 'throwables';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function uploadFiles() {
    const files = fs.readdirSync(dir).filter(f => f.includes('_animated_') && f.endsWith('.jpg'));
    console.log(`Found ${files.length} throwable images to upload.`);
    
    let uploadedCount = 0;
    const uniqueUploads = new Set();
    
    for (const file of files) {
        const filePath = `${dir}/${file}`;
        const fileData = fs.readFileSync(filePath);
        const simplifiedName = file.replace(/_animated_\d+/, '') + (file.endsWith('.jpg') ? '' : '.jpg');
        const finalName = simplifiedName.endsWith('.jpg') ? simplifiedName : simplifiedName + '.jpg';
        const storagePath = `${folderName}/${finalName}`;
        
        if (uniqueUploads.has(storagePath)) continue;
        uniqueUploads.add(storagePath);

        let success = false;
        let attempts = 0;
        while (!success && attempts < 5) {
            attempts++;
            const { error } = await supabase.storage
                .from(bucketName)
                .upload(storagePath, fileData, {
                    contentType: 'image/jpeg',
                    upsert: true
                });
                
            if (error) {
                console.error(`Attempt ${attempts} failed to upload ${file}:`, error.message);
                await delay(1000 * attempts);
            } else {
                console.log(`Uploaded: ${storagePath}`);
                success = true;
                uploadedCount++;
            }
        }
    }
    console.log(`\nFinished uploading ${uploadedCount} distinct items to the '${bucketName}' bucket under '${folderName}/'.`);
}

uploadFiles();
