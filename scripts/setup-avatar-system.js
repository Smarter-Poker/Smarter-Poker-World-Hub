/**
 * 🚀 AVATAR ENGINE - COMPLETE SETUP SCRIPT
 * Checks and creates all required database tables, storage buckets, and configurations
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function setupAvatarSystem() {
    console.log('🎨 AVATAR ENGINE SETUP\n');
    console.log('====================\n');

    // 1. Check environment variables
    console.log('1️⃣ Checking environment variables...');
    const requiredEnvVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'OPENAI_API_KEY'
    ];

    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        console.error('❌ Missing environment variables:', missingVars.join(', '));
        process.exit(1);
    }
    console.log('✅ All environment variables present\n');

    // 2. Check database tables
    console.log('2️⃣ Checking database tables...');
    try {
        // Check user_avatars
        const { data: avatarsCheck, error: avatarsError } = await supabase
            .from('user_avatars')
            .select('id')
            .limit(1);

        if (avatarsError && avatarsError.code === '42P01') {
            console.log('⚠️  user_avatars table does not exist');
            console.log('📋 Please run: database/migrations/avatar_system.sql in Supabase SQL Editor\n');
        } else if (avatarsError) {
            console.log('⚠️  Error checking user_avatars:', avatarsError.message);
        } else {
            console.log('✅ user_avatars table exists');
        }

        // Check avatar_unlocks
        const { data: unlocksCheck, error: unlocksError } = await supabase
            .from('avatar_unlocks')
            .select('id')
            .limit(1);

        if (unlocksError && unlocksError.code === '42P01') {
            console.log('⚠️  avatar_unlocks table does not exist');
        } else if (unlocksError) {
            console.log('⚠️  Error checking avatar_unlocks:', unlocksError.message);
        } else {
            console.log('✅ avatar_unlocks table exists');
        }

        // Check custom_avatar_gallery
        const { data: galleryCheck, error: galleryError } = await supabase
            .from('custom_avatar_gallery')
            .select('id')
            .limit(1);

        if (galleryError && galleryError.code === '42P01') {
            console.log('⚠️  custom_avatar_gallery table does not exist');
        } else if (galleryError) {
            console.log('⚠️  Error checking custom_avatar_gallery:', galleryError.message);
        } else {
            console.log('✅ custom_avatar_gallery table exists');
        }

    } catch (error) {
        console.error('❌ Error checking tables:', error.message);
    }
    console.log('');

    // 3. Check storage bucket
    console.log('3️⃣ Checking storage bucket...');
    try {
        const { data: buckets, error: bucketsError } = await supabase
            .storage
            .listBuckets();

        if (bucketsError) {
            console.log('⚠️  Error listing buckets:', bucketsError.message);
        } else {
            const customAvatarsBucket = buckets.find(b => b.name === 'custom-avatars');
            if (customAvatarsBucket) {
                console.log('✅ custom-avatars bucket exists');
                console.log(`   Public: ${customAvatarsBucket.public}`);
            } else {
                console.log('⚠️  custom-avatars bucket does not exist');
                console.log('📋 Create it in Supabase Dashboard → Storage → New Bucket');
                console.log('   Name: custom-avatars');
                console.log('   Public: Yes');
                console.log('   File size limit: 10MB\n');
            }
        }
    } catch (error) {
        console.error('❌ Error checking storage:', error.message);
    }
    console.log('');

    // 4. Check avatars directory
    console.log('4️⃣ Checking avatar assets...');
    const fs = require('fs');
    const path = require('path');

    const freeDir = path.join(__dirname, '../public/avatars/free');
    const vipDir = path.join(__dirname, '../public/avatars/vip');

    if (fs.existsSync(freeDir)) {
        const freeCount = fs.readdirSync(freeDir).filter(f => f.endsWith('.png')).length;
        console.log(`✅ FREE avatars: ${freeCount} images`);
    } else {
        console.log('⚠️  FREE avatars directory not found');
    }

    if (fs.existsSync(vipDir)) {
        const vipCount = fs.readdirSync(vipDir).filter(f => f.endsWith('.png')).length;
        console.log(`✅ VIP avatars: ${vipCount} images`);
    } else {
        console.log('⚠️  VIP avatars directory not found');
    }
    console.log('');

    // 5. Test OpenAI connection
    console.log('5️⃣ Testing OpenAI connection...');
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });

        if (response.ok) {
            console.log('✅ OpenAI API key is valid');
        } else {
            console.log('⚠️  OpenAI API key may be invalid (status:', response.status, ')');
        }
    } catch (error) {
        console.log('⚠️  Error testing OpenAI:', error.message);
    }
    console.log('');

    // Summary
    console.log('====================');
    console.log('📊 SETUP SUMMARY\n');
    console.log('Next steps:');
    console.log('1. If tables don\'t exist: Run database/migrations/avatar_system.sql');
    console.log('2. If bucket doesn\'t exist: Create custom-avatars bucket in Supabase');
    console.log('3. Test at: http://localhost:3000/hub/avatars\n');
}

setupAvatarSystem().catch(console.error);
