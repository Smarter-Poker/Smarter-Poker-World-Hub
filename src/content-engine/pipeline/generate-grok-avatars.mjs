/**
 * GROK API AVATAR GENERATOR
 * Generates unique, diverse profile pictures for all 208 horses
 * Each horse gets a completely different pose, setting, style, and ethnicity
 * Uses xAI Grok Imagine API (grok-imagine-image model)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1',
});

// ═══════════════════════════════════════════════════════════════════════
// DIVERSITY POOLS — No two horses should look remotely similar
// ═══════════════════════════════════════════════════════════════════════

const ETHNICITIES = [
    'Caucasian American', 'African American', 'Hispanic/Latino', 'East Asian',
    'South Asian', 'Middle Eastern', 'Pacific Islander', 'Mixed ethnicity',
    'Mediterranean', 'Scandinavian', 'Eastern European', 'Caribbean',
    'Southeast Asian', 'West African', 'North African', 'Indigenous American',
    'Korean', 'Japanese', 'Filipino', 'Brazilian'
];

const POSES = [
    'looking directly at camera with a confident slight smile',
    'looking slightly to the left with a serious focused expression',
    'three-quarter view from the right, relaxed half-smile',
    'chin slightly tilted up, powerful confident gaze',
    'leaning forward with arms crossed, determined look',
    'sitting back in a chair, cool detached expression',
    'resting chin on one hand, thoughtful contemplative stare',
    'looking over their shoulder, mysterious profile view',
    'standing against a wall, casual relaxed posture',
    'slight head tilt with knowing smirk',
    'looking down at phone then glancing up at camera',
    'candid mid-laugh, natural genuine expression',
    'serious poker face, completely unreadable expression',
    'holding a coffee cup, casually looking at camera',
    'adjusting sunglasses on top of head, confident look',
    'leaning on a railing, city behind them',
    'sitting at a table, one arm stretched across the back of a chair',
    'walking shot captured mid-stride, urban setting',
    'fixing their collar or cuff, looking away',
    'hands in pockets, standing casually, warm expression'
];

const SETTINGS = [
    'inside a modern poker room with green felt tables in background',
    'at a rooftop bar at sunset with city skyline behind',
    'in a sleek casino lobby with marble flooring',
    'sitting in a leather booth at an upscale cigar lounge',
    'in a minimalist loft apartment, large window with city view',
    'at a sports bar with multiple TVs, warm ambient lighting',
    'in a modern office with floor-to-ceiling windows',
    'at an outdoor cafe on a busy European-style street',
    'in a private study with bookshelves and warm lamp light',
    'standing in front of a luxury car, urban parking garage',
    'at a beachside restaurant, ocean visible behind',
    'in a professional photography studio, clean white backdrop',
    'at a golf course clubhouse, manicured greens behind',
    'in a cozy speakeasy, exposed brick walls and dim lighting',
    'at a high-end gym or fitness center, modern equipment',
    'in a co-working space with plants and natural light',
    'at a jazz club, stage lights and instruments behind',
    'in a penthouse suite, floor-to-ceiling city views at night',
    'at a farmers market, colorful produce stalls behind',
    'in a vintage barbershop with classic mirrors and chrome'
];

const OUTFITS_MALE = [
    'wearing a fitted navy blazer over a white t-shirt',
    'in a black leather jacket with a gray henley',
    'wearing a charcoal turtleneck sweater',
    'in a crisp white button-down with rolled-up sleeves',
    'wearing a denim jacket over a dark crew-neck',
    'in a burgundy bomber jacket with gold hardware',
    'wearing a tailored vest over a light blue shirt',
    'in a casual olive green linen shirt unbuttoned at collar',
    'wearing a black mock-neck with a silver chain',
    'in a patterned camp-collar Hawaiian shirt',
    'wearing a simple gray crewneck sweatshirt',
    'in a corduroy shirt jacket over a plain tee',
    'wearing a cashmere v-neck sweater in camel',
    'in a striped rugby polo with contrasting collar',
    'wearing a field jacket in dark forest green'
];

const OUTFITS_FEMALE = [
    'wearing a fitted black blazer over a silk camisole',
    'in a elegant burgundy wrap dress',
    'wearing a cream cashmere sweater with gold jewelry',
    'in a structured white button-down with statement earrings',
    'wearing a leather moto jacket with a soft blouse',
    'in a midnight blue cocktail dress',
    'wearing a tailored pantsuit in charcoal',
    'in a flowy emerald green top with delicate necklace',
    'wearing an off-shoulder knit top in dusty rose',
    'in a classic trench coat over a striped shirt',
    'wearing a velvet blazer in deep purple',
    'in a sleek black turtleneck with minimalist jewelry',
    'wearing a denim jacket over a floral dress',
    'in a silk scarf and sophisticated blouse combination',
    'wearing a modern power suit in slate blue'
];

const HAIR_MALE = [
    'with short cropped hair', 'with a neat fade hairstyle', 'with wavy medium-length hair',
    'with slicked-back hair', 'with a buzz cut', 'with neatly trimmed beard and short hair',
    'with curly hair and clean-shaven face', 'with salt-and-pepper temples',
    'with a modern undercut', 'with a close-cropped natural afro',
    'with long hair tied back', 'clean-shaven head', 'with thick dark hair and stubble',
    'with textured messy hair', 'with a classic side part'
];

const HAIR_FEMALE = [
    'with long flowing dark hair', 'with a sleek bob cut', 'with natural curly hair',
    'with braids pulled back elegantly', 'with a high ponytail', 'with shoulder-length waves',
    'with short pixie cut', 'with box braids', 'with straight platinum highlights',
    'with a messy bun', 'with bangs and medium-length hair', 'with an elegant updo',
    'with long auburn waves', 'with a lob with subtle layers', 'with natural coils and volume'
];

const AGES = ['mid-20s', 'late-20s', 'early-30s', 'mid-30s', 'late-30s', 'early-40s', 'mid-40s'];

const LIGHTING = [
    'warm golden hour lighting', 'soft natural daylight', 'cool blue ambient lighting',
    'dramatic side-lighting', 'neon-lit atmospheric glow', 'warm tungsten interior lighting',
    'high-key bright studio lighting', 'moody low-key lighting', 'outdoor overcast soft light',
    'candle-lit warm atmosphere'
];

function buildPrompt(horse, index) {
    const ethnicity = ETHNICITIES[index % ETHNICITIES.length];
    const pose = POSES[index % POSES.length];
    const setting = SETTINGS[index % SETTINGS.length];
    const outfit = horse.gender === 'female'
        ? OUTFITS_FEMALE[index % OUTFITS_FEMALE.length]
        : OUTFITS_MALE[index % OUTFITS_MALE.length];
    const hair = horse.gender === 'female'
        ? HAIR_FEMALE[index % HAIR_FEMALE.length]
        : HAIR_MALE[index % HAIR_MALE.length];
    const age = AGES[index % AGES.length];
    const light = LIGHTING[index % LIGHTING.length];

    return `Ultra-realistic photograph of a ${ethnicity} ${horse.gender} in their ${age}, ${pose}. ${setting}. ${outfit}, ${hair}. ${light}. Shot on Canon EOS R5, 85mm portrait lens, shallow depth of field f/1.8. Magazine quality editorial portrait. Completely unique individual, not a stock photo.`;
}

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                https.get(response.headers.location, (res2) => {
                    res2.pipe(file);
                    file.on('finish', () => { file.close(); resolve(filepath); });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(filepath); });
            }
        }).on('error', (err) => { fs.unlink(filepath, () => {}); reject(err); });
    });
}

async function generateAndUpload(horse, index) {
    const prompt = buildPrompt(horse, index);

    try {
        const response = await grok.images.generate({
            model: 'grok-imagine-image',
            prompt: prompt,
            n: 1,
        });

        const imageUrl = response.data[0].url;
        if (!imageUrl) throw new Error('No image URL returned');

        // Download to temp
        const tempPath = `/tmp/avatar_${horse.id}.png`;
        await downloadImage(imageUrl, tempPath);

        // Upload to Supabase storage
        const fileBuffer = fs.readFileSync(tempPath);
        const storagePath = `avatars/${horse.profile_id || horse.id}.png`;
        
        await supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);

        const publicUrl = urlData?.publicUrl;

        // Update both tables
        await supabase.from('content_authors')
            .update({ avatar_url: publicUrl })
            .eq('id', horse.id);

        if (horse.profile_id) {
            await supabase.from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', horse.profile_id);
        }

        // Cleanup temp file
        try { fs.unlinkSync(tempPath); } catch {}

        return { success: true, url: publicUrl };
    } catch (error) {
        console.error(`  FAILED id=${horse.id} "${horse.name}": ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('GROK API AVATAR GENERATOR');
    console.log('='.repeat(60) + '\n');

    // Get all horses that need avatars (id >= 201)
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, gender, profile_id, location, specialty, bio')
        .gte('id', 201)
        .order('id');

    console.log(`Horses to process: ${horses?.length}\n`);

    let success = 0, failed = 0;
    const BATCH_SIZE = 3; // Process 3 at a time with delay
    const DELAY_MS = 2000; // 2s between batches

    for (let i = 0; i < (horses?.length || 0); i += BATCH_SIZE) {
        const batch = horses.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.all(
            batch.map((horse, batchIdx) => generateAndUpload(horse, i + batchIdx))
        );

        results.forEach((result, batchIdx) => {
            const horse = batch[batchIdx];
            if (result.success) {
                success++;
                console.log(`  [${success}/${horses.length}] ${horse.name} (${horse.gender}) - OK`);
            } else {
                failed++;
                console.log(`  [X] ${horse.name} - FAILED: ${result.error}`);
            }
        });

        // Rate limiting delay
        if (i + BATCH_SIZE < horses.length) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`DONE: ${success} generated, ${failed} failed`);
}

main().catch(console.error);
