/**
 * 🐴 HORSE AVATAR GENERATOR API
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generates and uploads profile pictures for horses using DALL-E.
 * Updates both content_authors and profiles tables.
 * 
 * Usage: GET /api/cron/horses-avatars?limit=5
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

// Use service role key if available (bypasses RLS), otherwise fall back to anon key
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const IS_SERVICE_ROLE = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create client with appropriate auth settings
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, IS_SERVICE_ROLE ? {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
} : {});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT TEMPLATES - Law-compliant poker player avatars
// ═══════════════════════════════════════════════════════════════════════════

const ATTIRE = {
    male: [
        'dark gray hoodie', 'black t-shirt', 'navy blue sweater',
        'white polo shirt', 'charcoal hoodie', 'olive green hoodie'
    ],
    female: [
        'gray hoodie', 'burgundy hoodie', 'black t-shirt',
        'lavender sweater', 'casual white top', 'olive hoodie'
    ]
};

const ACCESSORIES = [
    '', 'dark sunglasses', 'black baseball cap', 'clear-frame glasses'
];

const EXPRESSIONS = [
    'confident expression', 'friendly smile', 'poker face',
    'slight smirk', 'focused look'
];

const FEMALE_NAMES = [
    'Sarah', 'Jennifer', 'Amanda', 'Rachel', 'Emily', 'Ashley', 'Jessica',
    'Olivia', 'Sophia', 'Megan', 'Lauren', 'Christina', 'Angela', 'Diana',
    'Monica', 'Stephanie', 'Rebecca', 'Nicole', 'Vanessa', 'Maria', 'Lisa'
];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generatePrompt(horse) {
    const firstName = horse.name?.split(' ')[0] || 'Alex';
    const isFemale = FEMALE_NAMES.some(n => firstName.toLowerCase().includes(n.toLowerCase()));
    const gender = isFemale ? 'female' : 'male';

    const attire = getRandomItem(ATTIRE[gender]);
    const accessory = getRandomItem(ACCESSORIES);
    const expression = getRandomItem(EXPRESSIONS);
    const feltColor = Math.random() > 0.5 ? 'green' : 'blue';

    return `Portrait photo of a ${gender} poker player seated at a casino poker table with ${feltColor} felt. ${expression}. Wearing ${attire}${accessory ? ', ' + accessory : ''}. Modest stack of casino chips visible. Upper body portrait, professional photography, warm ambient lighting, realistic. Shot at f/2.8, shallow depth of field.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// AVATAR GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateAndUploadAvatar(horse) {
    console.log(`🎨 Generating avatar for ${horse.name}...`);

    try {
        // Generate prompt
        const prompt = generatePrompt(horse);
        console.log(`   Prompt: ${prompt.substring(0, 80)}...`);

        // Generate image with DALL-E
        const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard'
        });

        const tempUrl = response.data[0].url;
        console.log(`   Generated image, uploading to storage...`);

        // Download and upload to Supabase
        const imageResponse = await fetch(tempUrl);
        const blob = await imageResponse.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());

        const fileName = `horse_avatar_${horse.profile_id}_${Date.now()}.png`;
        const storagePath = `avatars/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('social-media')
            .upload(storagePath, buffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) {
            console.error(`   Upload failed: ${uploadError.message}`);
            return { success: false, error: uploadError.message };
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);

        const publicUrl = urlData.publicUrl;

        // Update content_authors table
        const { error: authorError } = await supabase
            .from('content_authors')
            .update({ avatar_url: publicUrl })
            .eq('id', horse.id);

        if (authorError) {
            console.error(`   content_authors update failed: ${authorError.message}`);
        }

        // Update profiles table (for display in social feed)
        if (horse.profile_id) {
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', horse.profile_id);

            if (profileError) {
                console.error(`   profiles update failed: ${profileError.message}`);
            }
        }

        console.log(`   ✅ Avatar saved: ${publicUrl}`);

        return {
            success: true,
            horse_id: horse.id,
            horse_name: horse.name,
            avatar_url: publicUrl
        };

    } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        return { success: false, horse_name: horse.name, error: error.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    console.log('\n🐴 HORSE AVATAR GENERATOR');
    console.log('═'.repeat(50));

    if (!SUPABASE_URL || !SUPABASE_KEY || !process.env.OPENAI_API_KEY) {
        return res.status(500).json({
            error: 'Missing env vars',
            has_url: !!SUPABASE_URL,
            has_key: !!SUPABASE_KEY,
            is_service_role: IS_SERVICE_ROLE,
            has_openai: !!process.env.OPENAI_API_KEY
        });
    }

    const limit = parseInt(req.query.limit) || 5;
    const forceRegenerate = req.query.force === 'true';

    try {
        // Get horses needing avatars
        let query = supabase
            .from('content_authors')
            .select('id, profile_id, name, avatar_url')
            .eq('is_active', true)
            .not('profile_id', 'is', null);

        if (!forceRegenerate) {
            query = query.is('avatar_url', null);
        }

        const { data: horses, error: queryError } = await query.limit(limit);

        if (queryError) {
            return res.status(500).json({ error: queryError.message });
        }

        if (!horses?.length) {
            return res.status(200).json({
                success: true,
                message: 'All horses already have avatars!',
                generated: 0
            });
        }

        console.log(`Found ${horses.length} horses needing avatars\n`);

        const results = [];

        for (const horse of horses) {
            // Add delay between generations to avoid rate limits
            if (results.length > 0) {
                await new Promise(r => setTimeout(r, 2000));
            }

            const result = await generateAndUploadAvatar(horse);
            results.push(result);
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('\n📊 RESULTS:');
        console.log(`   Generated: ${successful}`);
        console.log(`   Failed: ${failed}`);

        return res.status(200).json({
            success: true,
            generated: successful,
            failed,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Handler error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
