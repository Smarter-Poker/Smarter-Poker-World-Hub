/**
 * 🐴 HORSE AVATAR GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generates Law-compliant profile pictures for all Horses.
 * 
 * PROFILE PICTURE LAW REQUIREMENTS:
 * ✅ Poker table with green/blue felt
 * ✅ Visible chip stacks (organized, multi-color)
 * ✅ Casual attire (hoodies, t-shirts, sweaters)
 * ✅ Casino/tournament background
 * ✅ Upper body, seated pose
 * ✅ Warm lighting
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
config({ path: '../../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE PICTURE LAW - PROMPT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const ATTIRE_OPTIONS = {
    male: [
        'wearing a dark gray hoodie',
        'wearing a black t-shirt',
        'wearing a navy blue sweater',
        'wearing a white polo shirt with sponsor patches',
        'wearing a dark hoodie with hood down',
        'wearing a black long-sleeve shirt',
        'wearing an olive green hoodie',
        'wearing a charcoal gray t-shirt'
    ],
    female: [
        'wearing a gray hoodie',
        'wearing a burgundy hoodie',
        'wearing a black t-shirt',
        'wearing a lavender sweater',
        'wearing a dark hoodie with hood up',
        'wearing a casual white top',
        'wearing an olive hoodie',
        'wearing a muted pink sweater'
    ]
};

const ACCESSORY_OPTIONS = [
    '',
    'wearing dark sunglasses',
    'wearing a black baseball cap',
    'wearing sunglasses and a cap',
    'wearing clear-frame glasses',
    'wearing over-ear headphones around neck',
    'wearing a gold chain necklace',
    'wearing a watch on wrist'
];

const EXPRESSION_OPTIONS = [
    'with a confident, focused expression',
    'with a relaxed, friendly smile',
    'with a serious poker face',
    'with a slight smirk',
    'with a warm, approachable smile',
    'with an intense, concentrated look'
];

const FELT_COLORS = ['green', 'blue'];

const TABLE_STYLES = [
    'classic casino poker table',
    'modern tournament poker table with padded rail',
    'high-stakes poker room table',
    'wooden rail poker table',
    'leather padded rail tournament table',
    'professional card room table'
];

const VENUE_BACKGROUNDS = [
    'casino floor with slot machines and chandeliers in background',
    'tournament room with other tables and players visible',
    'high-end poker room with warm ambient lighting',
    'Vegas-style casino with blurred neon lights behind',
    'professional card room with TV screens in background',
    'upscale poker lounge with modern decor'
];

const CHIP_DESCRIPTIONS = [
    'a few modest stacks of authentic Paulson-style casino clay chips with edge spots',
    'professional casino clay poker chips in solid red and black, naturally placed on felt',
    'high-quality clay casino chips with clean edge spot design, modest stack',
    'authentic tournament-grade clay chips in solid colors visible on the table',
    'premium casino clay chips (not plastic, not suited edge) casually arranged',
    'real casino-grade clay chips like those at WSOP, modest natural placement'
];

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a Law-compliant prompt for a specific horse
 */
function generatePrompt(horse) {
    // Determine gender from name (basic heuristic)
    const femaleNames = ['Sarah', 'Jennifer', 'Amanda', 'Rachel', 'Emily', 'Ashley', 'Jessica', 'Olivia',
        'Sophia', 'Megan', 'Lauren', 'Christina', 'Angela', 'Diana', 'Monica', 'Stephanie',
        'Rebecca', 'Courtney', 'Danielle', 'Nicole', 'Vanessa', 'Holly', 'Crystal', 'Jasmine'];
    const firstName = horse.name?.split(' ')[0] || 'Alex';
    const isFemale = femaleNames.some(n => firstName.toLowerCase().includes(n.toLowerCase()));
    const gender = isFemale ? 'female' : 'male';

    // Get personality-based variations
    const personality = horse.personality?.type || 'balanced';

    // Select random elements
    const attire = getRandomItem(ATTIRE_OPTIONS[gender]);
    const accessory = getRandomItem(ACCESSORY_OPTIONS);
    const expression = getRandomItem(EXPRESSION_OPTIONS);
    const feltColor = getRandomItem(FELT_COLORS);
    const chips = getRandomItem(CHIP_DESCRIPTIONS);
    const tableStyle = getRandomItem(TABLE_STYLES);
    const venue = getRandomItem(VENUE_BACKGROUNDS);

    // Personality-specific adjustments
    let personalityNote = '';
    if (personality === 'aggressive') {
        personalityNote = 'confident and intense demeanor, ';
    } else if (personality === 'analytical') {
        personalityNote = 'thoughtful and calculating look, ';
    } else if (personality === 'funny') {
        personalityNote = 'playful smirk, ';
    }

    // Build the prompt following the Law with variety
    const prompt = `A ${gender} poker player seated at a ${tableStyle} with solid ${feltColor} felt (clean, no text or logos). Plain ${feltColor === 'green' ? 'wooden' : 'leather padded'} rail without any lettering or markings. ${personalityNote}${expression}. ${attire}${accessory ? ', ' + accessory : ''}. ${chips} in front of them. Arms resting on the table. ${venue}. Professional tournament photography style, warm ambient lighting, shallow depth of field. Upper body portrait, highly realistic, authentic poker player aesthetic. Shot with Canon 5D, 85mm lens, f/2.8.`;

    return {
        prompt,
        gender,
        personality,
        attire,
        accessory,
        expression,
        tableStyle,
        venue
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// AVATAR GENERATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

class HorseAvatarGenerator {
    constructor() {
        this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        this.outputDir = './output/avatars';
        this.ensureDirectory();
    }

    ensureDirectory() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Get all horses that need avatars
     */
    async getHorsesNeedingAvatars(options = {}) {
        const query = this.supabase
            .from('content_authors')
            .select('id, profile_id, name, avatar_url')
            .eq('is_active', true);

        if (options.onlyMissing) {
            query.is('avatar_url', null);
        }

        if (options.limit) {
            query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Failed to fetch horses:', error.message);
            return [];
        }

        return data || [];
    }

    /**
     * Generate avatar for a single horse
     * Note: This creates the prompt - actual image generation needs generate_image tool
     */
    async prepareAvatarGeneration(horse) {
        const promptData = generatePrompt(horse);

        console.log(`\n🐴 ${horse.name}`);
        console.log(`   Gender: ${promptData.gender}`);
        console.log(`   Attire: ${promptData.attire}`);
        console.log(`   Expression: ${promptData.expression}`);
        console.log(`   Prompt ready for generation`);

        return {
            horse,
            ...promptData
        };
    }

    /**
     * Upload generated avatar to Supabase storage
     */
    async uploadAvatar(horse, imagePath) {
        const fileName = `horse_avatar_${horse.profile_id}_${Date.now()}.png`;
        const storagePath = `avatars/${fileName}`;

        const fileBuffer = fs.readFileSync(imagePath);

        const { error: uploadError } = await this.supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) {
            console.error(`Upload failed for ${horse.name}:`, uploadError.message);
            return null;
        }

        const { data: urlData } = this.supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);

        const publicUrl = urlData.publicUrl;

        // Update content_authors with new avatar
        const { error: updateError } = await this.supabase
            .from('content_authors')
            .update({ avatar_url: publicUrl })
            .eq('profile_id', horse.profile_id);

        if (updateError) {
            console.error(`DB update failed for ${horse.name}:`, updateError.message);
        }

        // Also update profiles table
        await this.supabase
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', horse.profile_id);

        console.log(`   ✅ Avatar uploaded: ${publicUrl}`);
        return publicUrl;
    }

    /**
     * Generate prompts for all horses (preparation phase)
     */
    async prepareAllAvatars(options = {}) {
        console.log('\n🐴🐴🐴 HORSE AVATAR GENERATOR 🐴🐴🐴');
        console.log('═'.repeat(60));
        console.log('Preparing Law-compliant avatar prompts...\n');

        const horses = await this.getHorsesNeedingAvatars(options);
        console.log(`Found ${horses.length} horses\n`);

        const preparations = [];
        for (const horse of horses) {
            const prep = await this.prepareAvatarGeneration(horse);
            preparations.push(prep);
        }

        return preparations;
    }

    /**
     * Export prompts to JSON for batch processing
     */
    async exportPromptsToFile(options = {}) {
        const preparations = await this.prepareAllAvatars(options);

        const outputFile = path.join(this.outputDir, 'avatar_prompts.json');
        fs.writeFileSync(outputFile, JSON.stringify(preparations, null, 2));

        console.log(`\n📄 Exported ${preparations.length} prompts to ${outputFile}`);
        return outputFile;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { HorseAvatarGenerator, generatePrompt };
export default HorseAvatarGenerator;

// ═══════════════════════════════════════════════════════════════════════════
// CLI EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

if (process.argv[1]?.includes('HorseAvatarGenerator')) {
    const generator = new HorseAvatarGenerator();

    // Get command line args
    const limit = parseInt(process.argv[2]) || 5;

    generator.prepareAllAvatars({ limit }).then(preps => {
        console.log('\n═'.repeat(60));
        console.log(`✅ Prepared ${preps.length} avatar prompts`);
        console.log('Ready for image generation!');
    });
}
