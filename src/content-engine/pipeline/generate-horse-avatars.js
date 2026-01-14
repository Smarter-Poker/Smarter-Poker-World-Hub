/**
 * 🐴 GENERATE HORSE AVATARS
 * Uses DALL-E to generate profile pictures for horses missing avatars
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env.local') });

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Profile Picture Law requirements
const AVATAR_STYLE = `Professional poker player portrait at a poker table. 
Solid green felt (no text, no logos). Plain rail without markings.
Authentic clay poker chips with edge spots (no text on chips).
Upper body visible, arms on table. Warm ambient lighting.
Photorealistic, Canon 5D, 85mm lens, f/2.8 shallow depth of field.`;

async function generateHorseAvatars() {
    console.log('\n🐴 GENERATING HORSE AVATARS');
    console.log('═'.repeat(60));

    // Get horses without avatars
    const { data: horses, error } = await supabase
        .from('content_authors')
        .select('id, name, alias, profile_id, avatar_url')
        .eq('is_active', true)
        .is('avatar_url', null)
        .limit(5); // Do 5 at a time

    if (error || !horses?.length) {
        console.log('No horses need avatars or error:', error?.message);
        return;
    }

    console.log(`Found ${horses.length} horses needing avatars\n`);

    for (const horse of horses) {
        console.log(`\n🎨 Generating avatar for ${horse.alias}...`);

        // Infer gender from name
        const firstName = horse.name?.split(' ')[0] || 'Alex';
        const femaleNames = ['Sarah', 'Jennifer', 'Amanda', 'Rachel', 'Emily', 'Ashley', 'Jessica', 'Olivia', 'Maria', 'Julia'];
        const isFemale = femaleNames.some(n => firstName.toLowerCase().includes(n.toLowerCase()));
        const gender = isFemale ? 'female' : 'male';

        // Build prompt
        const prompt = `${gender} poker player, ${AVATAR_STYLE}`;

        try {
            // Generate with DALL-E
            const response = await openai.images.generate({
                model: 'dall-e-3',
                prompt: prompt,
                n: 1,
                size: '1024x1024',
                quality: 'standard'
            });

            const tempUrl = response.data[0].url;
            console.log(`   ✅ Generated image`);

            // Download image
            const imageResponse = await fetch(tempUrl);
            const blob = await imageResponse.blob();
            const buffer = Buffer.from(await blob.arrayBuffer());

            // Upload to Supabase storage
            const fileName = `horse-avatar-${horse.alias.toLowerCase()}-${Date.now()}.png`;
            const filePath = `avatars/horses/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('social-media')
                .upload(filePath, buffer, { contentType: 'image/png' });

            if (uploadError) {
                console.log(`   ❌ Upload error: ${uploadError.message}`);
                continue;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('social-media')
                .getPublicUrl(filePath);

            const avatarUrl = urlData.publicUrl;
            console.log(`   ✅ Uploaded to: ${avatarUrl}`);

            // Update content_authors
            await supabase
                .from('content_authors')
                .update({ avatar_url: avatarUrl })
                .eq('id', horse.id);

            // Update profiles table too
            if (horse.profile_id) {
                await supabase
                    .from('profiles')
                    .update({ avatar_url: avatarUrl })
                    .eq('id', horse.profile_id);
            }

            console.log(`   ✅ ${horse.alias} now has an avatar!`);

            // Small delay between generations
            await new Promise(r => setTimeout(r, 2000));

        } catch (e) {
            console.log(`   ❌ Error: ${e.message}`);
        }
    }

    console.log('\n═'.repeat(60));
    console.log('🎉 Avatar generation complete!');
}

generateHorseAvatars();
