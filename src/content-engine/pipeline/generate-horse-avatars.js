/**
 * 🖼️ HORSE AVATAR GENERATOR
 * Generates unique AI profile pictures for all Horse accounts
 * and uploads them to Supabase storage
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../lib/grokClient.js';
import fs from 'fs';
import https from 'https';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const grok = getGrokClient();

// Extensive variety for highly realistic and distinct poker players
const BODY_TYPES = [
    'thin and slim build', 
    'athletic and fit build', 
    'average build', 
    'fuller-figured / stocky build', 
    'heavy-set / broad-shouldered build'
];

const FACE_SHAPES = [
    'round face with soft features', 
    'square jaw with strong facial features', 
    'thin face with sharp features', 
    'full face with warm, approachable features', 
    'weathered, leathery face with character',
    'oval face with high cheekbones'
];

const AGES = [
    'early 20s', 'late 20s', 'early 30s', 'late 30s', 
    '40s', '50s', 'older (60s+)'
];

const MALE_HAIR = [
    'short dark hair', 'shaved head/bald with a full beard', 'wavy brown hair', 
    'graying hair', 'messy casual hair', 'clean-cut fade', 'goatee and a sports cap'
];

const FEMALE_HAIR = [
    'long dark hair', 'short athletic haircut', 'curly dark hair', 
    'blonde shoulder-length hair', 'elegant styled hair', 'casual ponytail', 'messy bun with glasses'
];

const ATTIRE = [
    'casual dark hoodie', 'denim jacket', 'athletic tank top/sportswear', 
    'polo shirt', 'casual t-shirt and a baseball cap', 'smart casual blazer or sweater', 
    'luxury designer t-shirt with a nice watch'
];

const EXPRESSIONS = [
    'big warm, genuine smile', 'intense, focused stare', 'serious poker face', 
    'casual and approachable grin', 'triumphant/celebratory look', 'slight, confident smirk'
];

const CASINOS = ['Bellagio', 'Aria', 'Wynn', 'Venetian', 'WSOP', 'MGM Grand', 'Hard Rock'];
const TABLE_COLORS = ['classic green', 'deep blue', 'burgundy/red'];
const CHIP_STYLES = [
    'neatly stacked casino chips with visible denominations ($5 red, $25 green, $100 black)',
    'massive colorful chip stack showing a tournament win, with real casino branding',
    'modest, realistic 2/5 cash game chip stack sorted by color and denomination',
    'large chip stacks in front of them with authentic casino markings'
];

// Ethnic diversity for realistic variety
const ETHNICITIES = [
    'Caucasian', 'Asian', 'Hispanic/Latino', 'African American',
    'Middle Eastern', 'South Asian', 'Mixed ethnicity'
];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

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
    const age = getRandom(AGES);
    const bodyType = getRandom(BODY_TYPES);
    const faceShape = getRandom(FACE_SHAPES);
    const hair = horse.gender === 'female' ? getRandom(FEMALE_HAIR) : getRandom(MALE_HAIR);
    const attire = getRandom(ATTIRE);
    const expression = getRandom(EXPRESSIONS);
    const casino = getRandom(CASINOS);
    const tableColor = getRandom(TABLE_COLORS);
    const chips = getRandom(CHIP_STYLES);

    // Provide extremely descriptive and distinct prompts to prevent the AI from defaulting to "generic skinny model"
    const prompt = `Candid, highly realistic POV photo of a poker player seated at a ${casino} casino poker table with ${tableColor} felt. 
Player Details: ${ethnicity} ${horse.gender}, age: ${age}. They have a ${bodyType} and a ${faceShape}. 
Hair and Styling: ${hair}. Wearing a ${attire}. 
Expression: ${expression}. 
Setting & Details: ${chips}. The chips MUST look authentic with values printed on them, not generic colored discs. Dealer button visible. Background is a blurred, bustling casino poker room with overhead fluorescent lighting and rows of tables. 
Photography style: Shot on iPhone 14, unedited candid photo, flat realistic casino lighting (NO cinematic/dramatic lighting, NO golden hour, NO studio lighting). Looks exactly like a real amateur photo posted to social media by a real person. 
DO NOT MAKE EVERYONE LOOK LIKE A SUPERMODEL. We want real, everyday diverse people of different shapes and sizes.`;

    console.debug(`🎨 Generating avatar for ${horse.name} (${horse.gender})...`);

    try {
        const response = await grok.images.generate({
            model: 'dall-e-3',  // maps to grok-imagine-image via grokClient
            prompt: prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard'
        });

        const imageUrl = response.data[0].url;
        return imageUrl;
    } catch (error) {
        console.warn(`   Failed to generate for ${horse.name}: ${error.message}`);
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
        console.warn(`   Upload failed for ${horseName}: ${error.message}`);
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
        console.warn('Failed to update content_authors:', authorError.message);
        return false;
    }

    // Update profiles if it exists
    if (profileId) {
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ avatar_url: avatarUrl })
            .eq('id', profileId);

        if (profileError) {
            console.warn('Failed to update profiles:', profileError.message);
            // We still consider it a success if content_authors was updated
        }
    }

    return true;
}

async function main() {
    console.debug('\n🖼️ HORSE AVATAR GENERATOR');
    console.debug('═'.repeat(50));

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
        console.debug('No horses found');
        return;
    }

    console.debug(`Found ${horses.length} horses to process\n`);

    let success = 0;
    let failed = 0;

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds

    for (let i = 0; i < horses.length; i += BATCH_SIZE) {
        const batch = horses.slice(i, i + BATCH_SIZE);

        console.debug(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(horses.length / BATCH_SIZE)}...`);

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
                    console.debug(`✅ ${horse.name}: Avatar set!`);
                    success++;
                } else {
                    console.debug(`❌ ${horse.name}: Profile update failed`);
                    failed++;
                }

            } catch (error) {
                console.warn(`❌ ${horse.name}: ${error.message}`);
                failed++;
            }

            // Small delay between each to avoid rate limits
            await new Promise(r => setTimeout(r, 1000));
        }

        // Delay between batches
        if (i + BATCH_SIZE < horses.length) {
            console.debug(`   Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
        }
    }

    console.debug('\n' + '═'.repeat(50));
    console.debug(`COMPLETE: ${success} success, ${failed} failed`);
}

main().catch(console.warn);
