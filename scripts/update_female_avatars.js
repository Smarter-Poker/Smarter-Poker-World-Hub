const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const AVATARS_PATH = '/Users/smarter.poker/.gemini/antigravity/brain/b4eda623-af60-4f76-9bb0-bafe8b6be311';

// Map avatar files to horse names
const avatarMap = {
    'poker_avatar_amanda_1769219659142.png': 'Amanda Foster',
    'poker_avatar_lauren_1769219672638.png': 'Lauren Garcia',
    'poker_avatar_maria_1769219684782.png': 'Maria Rodriguez',
    'poker_avatar_natalie_1769219696719.png': 'Natalie Cole',
    'poker_avatar_olivia_1769219733451.png': 'Olivia Stone',
    'poker_avatar_diana_1769219746514.png': 'Diana Hunt',
    'poker_avatar_jennifer_1769219758660.png': 'Jennifer Park',
    'poker_avatar_emily_1769219771743.png': 'Emily Carter',
    'poker_avatar_caroline_1769219810424.png': 'Caroline Myers',
    'poker_avatar_vanessa_1769219823567.png': 'Vanessa Morgan',
    'poker_avatar_nicole_1769219838250.png': 'Nicole Davis',
    'poker_avatar_stephanie_1769219850782.png': 'Stephanie Harris',
};

async function uploadAndUpdate() {
    console.log('🎰 Starting female avatar update process...\n');

    for (const [filename, horseName] of Object.entries(avatarMap)) {
        const filePath = path.join(AVATARS_PATH, filename);

        // Check file exists
        if (!fs.existsSync(filePath)) {
            console.log(`❌ File not found: ${filename}`);
            continue;
        }

        console.log(`📤 Uploading ${horseName}...`);

        // Read file
        const fileBuffer = fs.readFileSync(filePath);
        const storagePath = `avatars/horse_avatar_${horseName.toLowerCase().replace(' ', '_')}_${Date.now()}.png`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });

        if (uploadError) {
            console.log(`❌ Upload failed for ${horseName}:`, uploadError.message);
            continue;
        }

        const avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/social-media/${storagePath}`;
        console.log(`✅ Uploaded: ${avatarUrl.substring(0, 80)}...`);

        // Update profiles table
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ avatar_url: avatarUrl })
            .ilike('full_name', horseName);

        if (profileError) {
            console.log(`⚠️ Profile update failed for ${horseName}:`, profileError.message);
        } else {
            console.log(`✅ Profile updated for ${horseName}`);
        }

        // Update content_authors table
        const { error: authorError } = await supabase
            .from('content_authors')
            .update({ avatar_url: avatarUrl })
            .eq('name', horseName);

        if (authorError) {
            console.log(`⚠️ content_authors update failed for ${horseName}:`, authorError.message);
        } else {
            console.log(`✅ content_authors updated for ${horseName}`);
        }

        console.log('');

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
    }

    console.log('🎉 DONE! All female avatars updated.');
}

uploadAndUpdate().catch(console.error);
