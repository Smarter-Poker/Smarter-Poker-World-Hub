/**
 * 🖼️ HORSE AVATAR GENERATOR
 * Generates unique AI profile pictures for all Horse accounts
 * and uploads them to Supabase storage
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import https from 'https';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Avatar prompt variations for diversity
const AVATAR_STYLES = [
    { gender: 'male', age: '25-35', style: 'professional headshot, wearing smart casual' },
    { gender: 'male', age: '35-45', style: 'confident poker player, casual blazer' },
    { gender: 'male', age: '28-38', style: 'modern professional, relaxed vibe' },
    { gender: 'female', age: '25-35', style: 'professional headshot, elegant' },
    { gender: 'female', age: '30-40', style: 'confident businesswoman, smart casual' },
    { gender: 'female', age: '28-38', style: 'modern professional, approachable' },
];

// Ethnic diversity for realistic variety
const ETHNICITIES = [
    'Caucasian', 'Asian', 'Hispanic', 'African American',
    'Middle Eastern', 'South Asian', 'Mixed ethnicity'
];

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(filepath);
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => { });
            reject(err);
        });
    });
}

async function generateAvatar(horse, index) {
    const ethnicity = ETHNICITIES[index % ETHNICITIES.length];

    const prompt = `Professional headshot portrait of a ${ethnicity} ${horse.gender} poker player named ${horse.name}, age 25-45. 
Location: ${horse.location}. Specialty: ${horse.specialty?.replace('_', ' ')}. Stakes: ${horse.stakes}. 
Bio: ${horse.bio}.
Style: Authentic poker player aesthetic, highly realistic, professional lighting, sharp focus, looking at camera. Neutral casino or studio background.`;

    console.log(`🎨 Generating avatar for ${horse.name} (${horse.gender})...`);

    try {
        const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt: prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard'
        });

        const imageUrl = response.data[0].url;
        return imageUrl;
    } catch (error) {
        console.error(`   Failed to generate for ${horse.name}: ${error.message}`);
        return null;
    }
}

async function uploadToSupabase(imageUrl, horseName, profileId) {
    const tempPath = `/tmp/avatar_${profileId}.png`;

    try {
        // Download image
        await downloadImage(imageUrl, tempPath);

        // Read file
        const fileBuffer = fs.readFileSync(tempPath);

        // Upload to Supabase
        const storagePath = `avatars/${profileId}.png`;
        const { error: uploadError } = await supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);

        // Clean up temp file
        fs.unlinkSync(tempPath);

        return urlData.publicUrl;
    } catch (error) {
        console.error(`   Upload failed for ${horseName}: ${error.message}`);
        return null;
    }
}

async function updateProfileAvatar(horseId, profileId, avatarUrl) {
    // Update content_authors
    const { error: authorError } = await supabase
        .from('content_authors')
        .update({ avatar_url: avatarUrl })
        .eq('id', horseId);

    if (authorError) {
        console.error('Failed to update content_authors:', authorError.message);
        return false;
    }

    // Update profiles if it exists
    if (profileId) {
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ avatar_url: avatarUrl })
            .eq('id', profileId);

        if (profileError) {
            console.error('Failed to update profiles:', profileError.message);
            // We still consider it a success if content_authors was updated
        }
    }

    return true;
}

async function main() {
    console.log('\n🖼️ HORSE AVATAR GENERATOR');
    console.log('═'.repeat(50));

    // Get specific horses with issues
    const targetNames = [
        'Maria Rodriguez', 'Vanessa Morgan',
        'Brittany Collins', 'Heather Adams',
        'Richard Wells', 'Isaac Stone',
        'Seth Gordon', 'Nathan Cooper',
        'Thomas Hart', 'Trevor Hayes', 'Andrew Wilson'
    ];

    // Get all horses but filter by target names
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, gender, location, specialty, stakes, bio')
        .eq('is_active', true)
        .in('name', targetNames);

    if (!horses?.length) {
        console.log('No horses found');
        return;
    }

    console.log(`Found ${horses.length} horses to process\n`);

    let success = 0;
    let failed = 0;

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds

    for (let i = 0; i < horses.length; i += BATCH_SIZE) {
        const batch = horses.slice(i, i + BATCH_SIZE);

        console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(horses.length / BATCH_SIZE)}...`);

        for (const horse of batch) {
            try {
                // Generate avatar
                const imageUrl = await generateAvatar(horse, i + batch.indexOf(horse));
                if (!imageUrl) {
                    failed++;
                    continue;
                }

                // Upload to storage
                const publicUrl = await uploadToSupabase(imageUrl, horse.name, horse.profile_id);
                if (!publicUrl) {
                    failed++;
                    continue;
                }

                // Update profile
                const updated = await updateProfileAvatar(horse.id, horse.profile_id, publicUrl);
                if (updated) {
                    console.log(`✅ ${horse.name}: Avatar set!`);
                    success++;
                } else {
                    console.log(`❌ ${horse.name}: Profile update failed`);
                    failed++;
                }

            } catch (error) {
                console.error(`❌ ${horse.name}: ${error.message}`);
                failed++;
            }

            // Small delay between each to avoid rate limits
            await new Promise(r => setTimeout(r, 1000));
        }

        // Delay between batches
        if (i + BATCH_SIZE < horses.length) {
            console.log(`   Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
        }
    }

    console.log('\n' + '═'.repeat(50));
    console.log(`COMPLETE: ${success} success, ${failed} failed`);
}

main().catch(console.error);
