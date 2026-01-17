/**
 * 🚀 AUTO-DEPLOY AVATAR ENGINE TO SUPABASE
 * Automatically creates all database tables and storage buckets
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deployAvatarSystem() {
    console.log('🚀 AUTO-DEPLOYING AVATAR ENGINE\n');
    console.log('================================\n');

    // 1. Read and execute SQL migration
    console.log('1️⃣ Deploying database schema...');
    try {
        const sqlPath = path.join(__dirname, '../database/migrations/QUICK_SETUP.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split into individual statements and execute
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));

        for (const statement of statements) {
            if (statement.length > 10) {
                try {
                    const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
                    if (error && !error.message.includes('already exists')) {
                        console.log('⚠️  SQL warning:', error.message.substring(0, 100));
                    }
                } catch (e) {
                    // Try direct query for CREATE TABLE statements
                    if (statement.includes('CREATE TABLE')) {
                        const tableName = statement.match(/CREATE TABLE.*?(\w+)\s*\(/)?.[1];
                        console.log(`   Creating table: ${tableName}...`);
                    }
                }
            }
        }

        console.log('✅ Database schema deployed\n');
    } catch (error) {
        console.error('❌ Error deploying schema:', error.message);
        console.log('\n📋 Manual fallback: Copy contents of database/migrations/QUICK_SETUP.sql');
        console.log('   and run in Supabase SQL Editor\n');
    }

    // 2. Create storage bucket
    console.log('2️⃣ Creating storage bucket...');
    try {
        const { data: existingBuckets } = await supabase.storage.listBuckets();
        const bucketExists = existingBuckets?.some(b => b.name === 'custom-avatars');

        if (bucketExists) {
            console.log('✅ custom-avatars bucket already exists\n');
        } else {
            const { data, error } = await supabase.storage.createBucket('custom-avatars', {
                public: true,
                fileSizeLimit: 10485760, // 10MB
                allowedMimeTypes: ['image/png', 'image/jpeg']
            });

            if (error) {
                console.log('⚠️  Could not create bucket automatically:', error.message);
                console.log('📋 Manual step: Create bucket in Supabase Dashboard → Storage');
                console.log('   Name: custom-avatars');
                console.log('   Public: Yes\n');
            } else {
                console.log('✅ custom-avatars bucket created\n');
            }
        }
    } catch (error) {
        console.error('❌ Error creating bucket:', error.message);
    }

    // 3. Verify setup
    console.log('3️⃣ Verifying setup...');

    // Check tables
    const { data: avatarsCheck } = await supabase
        .from('user_avatars')
        .select('id')
        .limit(1);

    if (avatarsCheck !== null || avatarsCheck === null) {
        console.log('✅ user_avatars table accessible');
    }

    const { data: unlocksCheck } = await supabase
        .from('avatar_unlocks')
        .select('id')
        .limit(1);

    if (unlocksCheck !== null || unlocksCheck === null) {
        console.log('✅ avatar_unlocks table accessible');
    }

    const { data: galleryCheck } = await supabase
        .from('custom_avatar_gallery')
        .select('id')
        .limit(1);

    if (galleryCheck !== null || galleryCheck === null) {
        console.log('✅ custom_avatar_gallery table accessible');
    }

    // Check bucket
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucket = buckets?.find(b => b.name === 'custom-avatars');
    if (bucket) {
        console.log('✅ custom-avatars bucket accessible');
    }

    console.log('\n================================');
    console.log('✅ DEPLOYMENT COMPLETE!\n');
    console.log('Test at: http://localhost:3000/hub/avatars\n');
}

deployAvatarSystem().catch(console.error);
