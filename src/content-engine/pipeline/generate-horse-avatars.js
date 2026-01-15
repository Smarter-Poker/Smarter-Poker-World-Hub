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

async function generateAvatar(horseName, index) {
    // Select style based on name (infer gender from first name)
    const femaleNames = ['Sarah', 'Jennifer', 'Amanda', 'Rachel', 'Emily', 'Ashley', 'Nicole',
        'Lauren', 'Stephanie', 'Megan', 'Heather', 'Amber', 'Brittany', 'Vanessa', 'Courtney',
        'Kayla', 'Rebecca', 'Alexis', 'Melissa', 'Caroline', 'Angela', 'Maria', 'Natalie',
        'Julia', 'Monica', 'Diana', 'Hannah', 'Karen', 'Sabrina', 'Valerie', 'Danielle',
        'Fiona', 'Holly', 'Jasmine', 'Gabriella', 'Sophia', 'Christina', 'Jessica',
        'Samantha', 'Kimberly', 'Michelle', 'Olivia'];

    const firstName = horseName.split(' ')[0];
    const isFemale = femaleNames.includes(firstName);

    const styleIndex = index % 3;
    const style = isFemale ? AVATAR_STYLES[3 + styleIndex] : AVATAR_STYLES[styleIndex];
    const ethnicity = ETHNICITIES[index % ETHNICITIES.length];

    const prompt = `Professional headshot portrait of a ${ethnicity} ${style.gender} poker player, age ${style.age}, ${style.style}, neutral studio background with soft lighting, high quality portrait photography, realistic, sharp focus, looking at camera with confident expression`;

    console.log(`🎨 Generating avatar for ${horseName}...`);

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
        console.error(`   Failed to generate for ${horseName}: ${error.message}`);
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

async function updateProfileAvatar(profileId, avatarUrl) {
    const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profileId);

    return !error;
}

async function main() {
    console.log('\n🖼️ HORSE AVATAR GENERATOR');
    console.log('═'.repeat(50));

    // Get all horses without avatars
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true);

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
                const imageUrl = await generateAvatar(horse.name, i + batch.indexOf(horse));
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
                const updated = await updateProfileAvatar(horse.profile_id, publicUrl);
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
