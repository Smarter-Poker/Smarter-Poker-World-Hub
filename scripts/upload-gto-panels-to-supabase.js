#!/usr/bin/env node
/**
 * Upload GTO Panels to Supabase Storage
 * 
 * This script uploads all GTO panel images from /public/images/gto-panels/
 * to Supabase storage (gto-panels bucket) and creates a mapping table.
 * 
 * Usage: node scripts/upload-gto-panels-to-supabase.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PANELS_DIR = path.join(__dirname, '../public/images/gto-panels');
const BUCKET_NAME = 'gto-panels';

async function ensureBucketExists() {
    console.log('📦 Checking for gto-panels bucket...');

    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

    if (!bucketExists) {
        console.log('📦 Creating gto-panels bucket...');
        const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: 5242880 // 5MB
        });
        if (error) {
            console.error('❌ Failed to create bucket:', error.message);
            // Try using social-media bucket as fallback
            return 'social-media';
        }
        console.log('✅ Created gto-panels bucket');
    }

    return BUCKET_NAME;
}

async function uploadPanels() {
    console.log('🎨 Starting GTO Panel Upload to Supabase...\n');

    // Ensure bucket exists
    const bucket = await ensureBucketExists();
    console.log(`📦 Using bucket: ${bucket}\n`);

    // Get all PNG files
    const files = fs.readdirSync(PANELS_DIR).filter(f => f.endsWith('.png'));
    console.log(`📁 Found ${files.length} panel images\n`);

    const results = [];

    for (const filename of files) {
        const filePath = path.join(PANELS_DIR, filename);
        const fileBuffer = fs.readFileSync(filePath);

        // Upload path in bucket
        const storagePath = `panels/${filename}`;

        console.log(`📤 Uploading ${filename}...`);

        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(storagePath, fileBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) {
            console.log(`   ❌ Failed: ${error.message}`);
            continue;
        }

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
        console.log(`   ✅ Uploaded`);

        results.push({
            filename,
            url: publicUrl,
            path: storagePath
        });

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 100));
    }

    // Save mapping file
    const mappingPath = path.join(__dirname, '../public/images/gto-panels/panel-urls.json');
    fs.writeFileSync(mappingPath, JSON.stringify(results, null, 2));

    console.log(`\n✅ Uploaded ${results.length} panels`);
    console.log(`📄 Mapping saved to: ${mappingPath}`);

    return results;
}

uploadPanels().catch(console.error);
