import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import https from 'https';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
});

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const AVATAR_STYLES = [
    { gender: 'male', age: '25-35', style: 'professional headshot, wearing smart casual' },
    { gender: 'male', age: '35-45', style: 'confident poker player, casual blazer' },
    { gender: 'male', age: '28-38', style: 'modern professional, relaxed vibe' },
    { gender: 'female', age: '25-35', style: 'professional headshot, elegant' },
    { gender: 'female', age: '30-40', style: 'confident businesswoman, smart casual' },
    { gender: 'female', age: '28-38', style: 'modern professional, approachable' },
];

const ETHNICITIES = [
    'Caucasian', 'Asian', 'Hispanic', 'African American',
    'Middle Eastern', 'South Asian', 'Mixed ethnicity'
];

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(filepath); });
        }).on('error', (err) => {
            fs.unlink(filepath, () => { });
            reject(err);
        });
    });
}

async function processHorse(horse, index) {
    console.log(`[${horse.name}] Generating prompt...`);
    const ethnicity = ETHNICITIES[index % ETHNICITIES.length];

    const prompt = `Professional headshot portrait of a ${ethnicity} ${horse.gender} poker player named ${horse.name}, age 25-45. 
Location: ${horse.location}. Specialty: ${horse.specialty?.replace('_', ' ')}. Stakes: ${horse.stakes}. 
Bio: ${horse.bio}.
Style: Authentic poker player aesthetic, highly realistic, professional lighting, sharp focus, looking at camera. Neutral casino or studio background.`;

    try {
        console.log(`[${horse.name}] Calling OpenAI API...`);
        const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt: prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard'
        });
        const imageUrl = response.data[0].url;
        console.log(`[${horse.name}] Generated URL: ${imageUrl.substring(0, 50)}... downloading...`);

        const tempPath = `/tmp/avatar_${horse.profile_id}_custom.png`;
        await downloadImage(imageUrl, tempPath);
        const fileBuffer = fs.readFileSync(tempPath);

        const storagePath = `avatars/${horse.profile_id}.png`;
        console.log(`[${horse.name}] Uploading to Supabase ${storagePath}...`);
        const { error: uploadError } = await supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('social-media').getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;
        fs.unlinkSync(tempPath);

        console.log(`[${horse.name}] Updating content_authors...`);
        const { error: authorError } = await supabase.from('content_authors').update({ avatar_url: publicUrl }).eq('id', horse.id);
        if (authorError) throw authorError;

        if (horse.profile_id) {
            console.log(`[${horse.name}] Updating profiles table...`);
            await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', horse.profile_id);
        }

        console.log(`✅ [${horse.name}] Successfully completed!`);
        return true;
    } catch (error) {
        console.error(`❌ [${horse.name}] Failed: ${error.message}`);
        return false;
    }
}

async function run() {
    const targetNames = ['Maria Rodriguez', 'Vanessa Morgan', 'Brittany Collins', 'Heather Adams'];

    console.log("Fetching targets...");
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, gender, location, specialty, stakes, bio')
        .eq('is_active', true)
        .in('name', targetNames);

    if (!horses?.length) {
        console.log('No horses found');
        return;
    }

    console.log(`Found ${horses.length} horses... processing concurrently!`);
    const promises = horses.map((h, i) => processHorse(h, i));
    await Promise.all(promises);
    console.log("All done!");
}

run();
