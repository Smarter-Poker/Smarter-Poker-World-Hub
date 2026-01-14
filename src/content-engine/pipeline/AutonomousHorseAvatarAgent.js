/**
 * 🐴 AUTONOMOUS HORSE AVATAR AGENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Each Horse autonomously generates their own profile picture.
 * Horses use their persona traits to create a unique, Law-compliant avatar.
 * 
 * HARD LAWS ENFORCED:
 * ✅ PROFILE PICTURE LAW - Poker table, chips, casual attire
 * ✅ TABLE QUALITY LAW - Clean felt, no text on rails
 * ✅ CHIP LAW - Authentic casino clay chips only
 * 
 * This agent is triggered when:
 * 1. A Horse is first registered (no avatar exists)
 * 2. A Horse wants to update their profile picture
 * 3. Batch avatar generation is requested
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
config({ path: path.resolve(__dirname, '../../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE PICTURE LAW v1.0 - EMBEDDED HARD RULES
// ═══════════════════════════════════════════════════════════════════════════

const PROFILE_PICTURE_LAW = {
    // REQUIRED ELEMENTS
    setting: {
        location: 'poker table',
        feltColors: ['green', 'blue'],
        background: 'casino/tournament environment'
    },

    // TABLE QUALITY LAW - CRITICAL
    tableQuality: {
        felt: 'solid color, NO text, logos, or markings',
        rails: 'plain wooden or leather padded, NO lettering'
    },

    // CHIP LAW - CRITICAL  
    chipLaw: {
        style: 'authentic casino clay chips (Paulson-style)',
        forbidden: ['suited edge chips', 'dice chips', 'plastic chips', 'metallic chips']
    },

    // SUBJECT REQUIREMENTS
    subject: {
        pose: 'seated at table, upper body visible',
        arms: 'on table, touching chips, or crossed'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// ETHNICITY MATCHING FOR AUTHENTIC REPRESENTATION
// ═══════════════════════════════════════════════════════════════════════════

const ETHNICITY_HINTS = {
    hispanic: ['Rodriguez', 'Garcia', 'Martinez', 'Lopez', 'Gonzalez', 'Hernandez', 'Torres', 'Sanchez', 'Flores', 'Rivera'],
    asian: ['Chen', 'Wong', 'Kim', 'Tran', 'Nguyen', 'Lee', 'Park', 'Tanaka', 'Yamamoto', 'Patel'],
    african: ['Washington', 'Jackson', 'Robinson', 'Williams', 'Brown', 'Johnson', 'Davis', 'Jones', 'Smith'],
    european: ['Petrov', 'Romano', 'Mueller', 'Schmidt', 'Dubois', 'Kowalski', 'Andersson']
};

function inferEthnicity(name) {
    const lastName = name.split(' ').pop();

    for (const [ethnicity, lastNames] of Object.entries(ETHNICITY_HINTS)) {
        if (lastNames.some(ln => lastName.toLowerCase().includes(ln.toLowerCase()))) {
            return ethnicity;
        }
    }
    return null; // Default - no specific ethnicity
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA-BASED PROMPT ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════

const ATTIRE_BY_GENDER = {
    male: [
        'wearing a dark gray hoodie',
        'wearing a black t-shirt',
        'wearing a navy blue polo shirt',
        'wearing a charcoal gray hoodie',
        'wearing a black polo shirt'
    ],
    female: [
        'wearing a gray hoodie',
        'wearing a burgundy hoodie',
        'wearing a black t-shirt',
        'wearing a dark hoodie',
        'wearing a black hoodie'
    ]
};

const EXPRESSIONS_BY_PERSONALITY = {
    aggressive: ['serious poker face', 'confident, focused expression', 'intense, concentrated look'],
    analytical: ['thoughtful expression', 'calculating look', 'focused, observant gaze'],
    balanced: ['relaxed, friendly smile', 'warm, approachable smile', 'slight smirk'],
    tricky: ['mysterious smirk', 'playful expression', 'knowing smile'],
    passive: ['calm, composed look', 'relaxed demeanor', 'patient expression']
};

const TABLE_STYLES = [
    'solid green felt (clean, no text or logos). Plain wooden rail without any lettering or markings',
    'solid blue felt (clean, no text or logos). Plain leather padded rail without any lettering or markings'
];

const CHIP_DESCRIPTIONS = [
    'A few modest stacks of casino clay chips',
    'Authentic casino clay chips',
    'Professional casino clay chips'
];

const VENUES = [
    'Casino floor with slot machines and chandeliers in background',
    'Tournament room with other tables and players visible',
    'High-end poker room with warm ambient lighting',
    'Vegas-style casino with blurred neon lights behind',
    'Professional card room with TV screens in background'
];

// ═══════════════════════════════════════════════════════════════════════════
// FEMALE NAME DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const FEMALE_NAMES = [
    'Sarah', 'Jennifer', 'Amanda', 'Rachel', 'Emily', 'Ashley', 'Jessica', 'Olivia',
    'Sophia', 'Megan', 'Lauren', 'Christina', 'Angela', 'Diana', 'Monica', 'Stephanie',
    'Rebecca', 'Courtney', 'Danielle', 'Nicole', 'Vanessa', 'Holly', 'Crystal', 'Jasmine',
    'Maria', 'Julia', 'Natalie', 'Melissa', 'Michelle', 'Victoria', 'Zoe', 'Amber',
    'Brianna', 'Elena', 'Francesca', 'Hannah', 'Katie', 'Laura', 'Nina', 'Fiona',
    'Gabriella', 'Kayla', 'Kimberly', 'Samantha', 'Sabrina', 'Valerie'
];

function detectGender(name) {
    const firstName = name.split(' ')[0];
    return FEMALE_NAMES.some(fn => firstName.toLowerCase() === fn.toLowerCase()) ? 'female' : 'male';
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS HORSE AVATAR AGENT
// ═══════════════════════════════════════════════════════════════════════════

class AutonomousHorseAvatarAgent {
    constructor() {
        this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        this.outputDir = path.resolve(__dirname, './output/horse_avatars');
        this.ensureDirectory();
    }

    ensureDirectory() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * 🧠 HORSE SELF-AWARENESS: Generate prompt based on Horse's own identity
     * Each horse knows their name, personality, and creates an avatar matching their persona.
     */
    generateSelfAwarePrompt(horse) {
        const name = horse.name || 'Unknown Player';
        const gender = detectGender(name);
        const ethnicity = inferEthnicity(name);
        const personality = horse.personality?.type || horse.poker_style || 'balanced';

        // Select elements based on Horse's identity
        const attire = this._getRandomItem(ATTIRE_BY_GENDER[gender]);
        const expressions = EXPRESSIONS_BY_PERSONALITY[personality] || EXPRESSIONS_BY_PERSONALITY['balanced'];
        const expression = this._getRandomItem(expressions);
        const tableStyle = this._getRandomItem(TABLE_STYLES);
        const chips = this._getRandomItem(CHIP_DESCRIPTIONS);
        const venue = this._getRandomItem(VENUES);

        // Build ethnicity-aware subject description
        let subjectDescription = `A ${gender} poker player`;
        if (ethnicity === 'hispanic') {
            subjectDescription = `A Hispanic ${gender} poker player`;
        } else if (ethnicity === 'asian') {
            const lastName = name.split(' ').pop();
            if (['Kim', 'Park'].some(n => lastName.includes(n))) {
                subjectDescription = `A Korean-American ${gender} poker player`;
            } else if (['Chen', 'Wong'].some(n => lastName.includes(n))) {
                subjectDescription = `A Chinese-American ${gender} poker player`;
            } else if (['Tran', 'Nguyen'].some(n => lastName.includes(n))) {
                subjectDescription = `A Vietnamese-American ${gender} poker player`;
            } else if (['Patel'].some(n => lastName.includes(n))) {
                subjectDescription = `An Indian-American ${gender} poker player`;
            } else {
                subjectDescription = `An Asian-American ${gender} poker player`;
            }
        } else if (ethnicity === 'african') {
            subjectDescription = `An African-American ${gender} poker player`;
        } else if (ethnicity === 'european') {
            const lastName = name.split(' ').pop();
            if (['Petrov'].some(n => lastName.includes(n))) {
                subjectDescription = `An Eastern European ${gender} poker player`;
            } else if (['Romano'].some(n => lastName.includes(n))) {
                subjectDescription = `An Italian-American ${gender} poker player`;
            }
        }

        // Build Law-compliant prompt
        const prompt = `${subjectDescription} seated at a poker table with ${tableStyle}. ${expression.charAt(0).toUpperCase() + expression.slice(1)}. ${attire}. ${chips}. Arms resting on the table. ${venue}. Professional tournament photography style, warm ambient lighting, shallow depth of field. Upper body portrait, highly realistic, authentic poker player aesthetic. Shot with Canon 5D, 85mm lens, f/2.8.`;

        return {
            horseName: name,
            horseId: horse.id,
            profileId: horse.profile_id,
            prompt,
            gender,
            ethnicity,
            personality,
            attire,
            expression,
            venue
        };
    }

    _getRandomItem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * 🐴 GET HORSES THAT NEED TO GENERATE THEIR OWN AVATARS
     */
    async getHorsesNeedingAvatars() {
        const { data, error } = await this.supabase
            .from('content_authors')
            .select('id, profile_id, name, avatar_url')
            .eq('is_active', true)
            .is('avatar_url', null)
            .order('name');

        if (error) {
            console.error('❌ Failed to fetch horses:', error.message);
            return [];
        }

        return data || [];
    }

    /**
     * 📤 UPLOAD AVATAR AFTER HORSE GENERATES IT
     */
    async uploadGeneratedAvatar(horse, imageBuffer) {
        const fileName = `horse_${horse.profile_id}_${Date.now()}.png`;
        const storagePath = `avatars/${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await this.supabase.storage
            .from('social-media')
            .upload(storagePath, imageBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) {
            console.error(`❌ Upload failed for ${horse.name}:`, uploadError.message);
            return null;
        }

        // Get public URL
        const { data: urlData } = this.supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);

        const publicUrl = urlData.publicUrl;

        // Update content_authors table
        await this.supabase
            .from('content_authors')
            .update({ avatar_url: publicUrl })
            .eq('id', horse.id);

        // Update profiles table  
        await this.supabase
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', horse.profile_id);

        console.log(`✅ ${horse.name} uploaded their avatar: ${publicUrl}`);
        return publicUrl;
    }

    /**
     * 🎯 BATCH: Prepare all horses to generate their own avatars
     * Returns array of { horse, prompt } for batch generation
     */
    async prepareAutonomousGeneration() {
        console.log('\n🐴🐴🐴 AUTONOMOUS HORSE AVATAR GENERATION 🐴🐴🐴');
        console.log('═'.repeat(60));
        console.log('Each horse will generate their own Law-compliant avatar.\n');

        const horses = await this.getHorsesNeedingAvatars();
        console.log(`Found ${horses.length} horses needing avatars.\n`);

        const preparations = [];
        for (const horse of horses) {
            const promptData = this.generateSelfAwarePrompt(horse);
            preparations.push(promptData);
            console.log(`🐴 ${horse.name} (${promptData.gender}, ${promptData.personality || 'balanced'})`);
            console.log(`   Ethnicity: ${promptData.ethnicity || 'default'}`);
            console.log(`   Prompt ready ✓\n`);
        }

        return preparations;
    }

    /**
     * 📄 EXPORT: Save all prompts to JSON for external batch processing
     */
    async exportPromptsForBatchGeneration(outputPath = null) {
        const preparations = await this.prepareAutonomousGeneration();

        const filePath = outputPath || path.join(this.outputDir, 'horse_avatar_prompts.json');
        fs.writeFileSync(filePath, JSON.stringify(preparations, null, 2));

        console.log(`\n📄 Exported ${preparations.length} avatar prompts to:`);
        console.log(`   ${filePath}`);

        return { filePath, count: preparations.length, preparations };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { AutonomousHorseAvatarAgent, PROFILE_PICTURE_LAW };
export default AutonomousHorseAvatarAgent;

// ═══════════════════════════════════════════════════════════════════════════
// CLI EXECUTION - For testing
// ═══════════════════════════════════════════════════════════════════════════

if (process.argv[1]?.includes('AutonomousHorseAvatarAgent')) {
    const agent = new AutonomousHorseAvatarAgent();

    agent.exportPromptsForBatchGeneration().then(result => {
        console.log('\n═'.repeat(60));
        console.log(`✅ ${result.count} horses ready for autonomous avatar generation!`);
        console.log('Each horse will generate their own profile picture.');
    }).catch(err => {
        console.error('Error:', err.message);
    });
}
