const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const AVATARS_PATH = '/Users/smarter.poker/.gemini/antigravity/brain/b4eda623-af60-4f76-9bb0-bafe8b6be311';

// Map avatar files to horse names - using v2 avatars
const avatarMap = {
    'poker_v2_alexis': 'Alexis Romero',
    'poker_v2_amber': 'Amber Nelson',
    'poker_v2_angela': 'Angela Peterson',
    'poker_v2_ashley': 'Ashley Thompson',
    'poker_v2_brittany': 'Brittany Collins',
    'poker_v2_caroline': 'Caroline Myers',
    'poker_v2_christina': 'Christina Moore',
    'poker_v2_courtney': 'Courtney Hughes',
    'poker_v2_danielle': 'Danielle Shaw',
    'poker_v2_diana': 'Diana Hunt',
    'poker_v2_emily': 'Emily Carter',
    'poker_v2_fiona': 'Fiona Grant',
    'poker_v2_gabriella': 'Gabriella Santos',
    'poker_v2_hannah': 'Hannah Fox',
    'poker_v2_heather': 'Heather Adams',
    'poker_v2_holly': 'Holly Webb',
    'poker_v2_jasmine': 'Jasmine Cole',
    'poker_v2_jessica': 'Jessica Young',
    'poker_v2_julia': 'Julia Mason',
    'poker_v2_karen': 'Karen Rose',
    'poker_v2_kayla': 'Kayla Griffin',
    'poker_v2_kimberly': 'Kimberly Price',
    'poker_v2_lauren': 'Lauren Garcia',
    'poker_v2_maria': 'Maria Rodriguez',
    'poker_v2_megan': 'Megan Stewart',
    'poker_v2_melissa': 'Melissa Graham',
    'poker_v2_michelle': 'Michelle Lewis',
    'poker_v2_monica': 'Monica West',
    'poker_v2_natalie': 'Natalie Cole',
    'poker_v2_nicole': 'Nicole Davis',
    'poker_v2_olivia': 'Olivia Stone',
    'poker_v2_rachelb': 'Rachel Black',
    'poker_v2_rachelk': 'Rachel Kim',
    'poker_v2_rebecca': 'Rebecca Fisher',
    'poker_v2_sabrina': 'Sabrina Day',
    'poker_v2_samantha': 'Samantha Hill',
    'poker_v2_sarah': 'Sarah Mitchell',
    'poker_v2_sophia': 'Sophia Tran',
    'poker_v2_stephanie': 'Stephanie Harris',
    'poker_v2_valerie': 'Valerie Boyd',
    'poker_v2_vanessa': 'Vanessa Morgan',
    'poker_v2_amanda': 'Amanda Foster',
    'poker_v2_jennifer': 'Jennifer Park',
};

async function findAvatarFile(prefix) {
    const files = fs.readdirSync(AVATARS_PATH);
    const match = files.find(f => f.startsWith(prefix) && f.endsWith('.png'));
    return match ? path.join(AVATARS_PATH, match) : null;
}

async function uploadAndUpdate() {
    console.log('🎰 Starting female avatar update process (V2 - Proper Poker Aesthetic)...\n');

    let successCount = 0;
    let failCount = 0;

    for (const [prefix, horseName] of Object.entries(avatarMap)) {
        const filePath = await findAvatarFile(prefix);

        if (!filePath) {
            console.log(`❌ File not found for ${horseName} (prefix: ${prefix})`);
            failCount++;
            continue;
        }

        console.log(`📤 Uploading ${horseName}...`);

        // Read file
        const fileBuffer = fs.readFileSync(filePath);
        const storagePath = `avatars/horse_avatar_${horseName.toLowerCase().replace(/ /g, '_')}_v2_${Date.now()}.png`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });

        if (uploadError) {
            console.log(`❌ Upload failed for ${horseName}:`, uploadError.message);
            failCount++;
            continue;
        }

        const avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/social-media/${storagePath}`;
        console.log(`✅ Uploaded: ${avatarUrl.substring(0, 70)}...`);

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

        successCount++;
        console.log('');

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n🎉 DONE! ${successCount} female avatars updated, ${failCount} failed.`);
}

uploadAndUpdate().catch(console.error);
