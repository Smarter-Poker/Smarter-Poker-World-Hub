/**
 * 🐴 HORSE PERSONALITY SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Gives each horse a unique, persistent personality that influences:
 * - Comment style and vocabulary
 * - Content preferences (source, category)
 * - Activity patterns
 * - Social behavior
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// PERSONALITY TYPES
// ═══════════════════════════════════════════════════════════════════════════
export const PERSONALITY_TYPES = {
    AGGRESSIVE: 'aggressive',   // Bold comments, likes bluffs, active poster
    CHILL: 'chill',             // Laid back, supportive, moderate activity
    ANALYTICAL: 'analytical',   // GTO focused, educational content, detailed
    FUNNY: 'funny',             // Memes, jokes, casual tone
    SUPPORTIVE: 'supportive',   // Encouraging, community focused
    GRINDER: 'grinder'          // Volume player, tournament content
};

export const ACTIVITY_LEVELS = {
    HYPER: 'hyper',     // Posts frequently, comments a lot
    NORMAL: 'normal',   // Standard activity
    CHILL: 'chill',     // Less frequent but consistent
    LURKER: 'lurker'    // Mostly likes, rare comments
};

// ═══════════════════════════════════════════════════════════════════════════
// PERSONALITY TRAITS
// ═══════════════════════════════════════════════════════════════════════════
const TRAIT_MODIFIERS = {
    [PERSONALITY_TYPES.AGGRESSIVE]: {
        commentPhrases: ['fr fr', 'no cap', 'straight up', 'period', 'thats facts', 'all in mentality'],
        preferredCategories: ['bluff', 'massive_pot', 'table_drama'],
        emoji: ['🔥', '💪', '🎯', '⚔️'],
        tone: 'bold'
    },
    [PERSONALITY_TYPES.CHILL]: {
        commentPhrases: ['honestly', 'ngl', 'lowkey', 'vibes', 'solid play', 'respect the line'],
        preferredCategories: ['educational', 'celebrity', 'soul_read'],
        emoji: ['✌️', '😎', '🤙', '💯'],
        tone: 'relaxed'
    },
    [PERSONALITY_TYPES.ANALYTICAL]: {
        commentPhrases: ['mathematically', 'GTO approved', 'solver says', '+EV', 'range advantage', 'optimal line'],
        preferredCategories: ['educational', 'soul_read', 'bluff'],
        emoji: ['🧠', '📊', '🎓', '💡'],
        tone: 'technical'
    },
    [PERSONALITY_TYPES.FUNNY]: {
        commentPhrases: ['lmaooo', 'dead 💀', 'bro', 'crying', 'i cant', 'this is peak content'],
        preferredCategories: ['funny', 'bad_beat', 'table_drama'],
        emoji: ['😂', '💀', '🤣', '😭'],
        tone: 'comedic'
    },
    [PERSONALITY_TYPES.SUPPORTIVE]: {
        commentPhrases: ['king 👑', 'legend', 'goated', 'built different', 'respect', 'you got this'],
        preferredCategories: ['celebrity', 'massive_pot', 'educational'],
        emoji: ['👑', '🙌', '💪', '❤️'],
        tone: 'encouraging'
    },
    [PERSONALITY_TYPES.GRINDER]: {
        commentPhrases: ['grind never stops', 'volume is key', 'next session', 'back at it', 'staying focused'],
        preferredCategories: ['massive_pot', 'bad_beat', 'celebrity'],
        emoji: ['⚡', '🎰', '🃏', '💎'],
        tone: 'determined'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE PREFERENCES BY PERSONALITY
// ═══════════════════════════════════════════════════════════════════════════
const SOURCE_PREFERENCES = {
    [PERSONALITY_TYPES.AGGRESSIVE]: ['HCL', 'LODGE', 'TCH'],
    [PERSONALITY_TYPES.CHILL]: ['BRAD_OWEN', 'ANDREW_NEEME', 'LATB'],
    [PERSONALITY_TYPES.ANALYTICAL]: ['DOUG_POLK', 'TRITON', 'POKERGO'],
    [PERSONALITY_TYPES.FUNNY]: ['HCL', 'RAMPAGE', 'LODGE'],
    [PERSONALITY_TYPES.SUPPORTIVE]: ['BRAD_OWEN', 'ANDREW_NEEME', 'HCL'],
    [PERSONALITY_TYPES.GRINDER]: ['WSOP', 'RAMPAGE', 'POKERSTARS']
};

// ═══════════════════════════════════════════════════════════════════════════
// HORSE PERSONALITY SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class HorsePersonalityService {
    constructor(supabaseUrl, supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.cache = new Map(); // Cache personalities in memory
    }

    /**
     * Generate a random personality for a new horse
     */
    generatePersonality() {
        const types = Object.values(PERSONALITY_TYPES);
        const levels = Object.values(ACTIVITY_LEVELS);

        const type = types[Math.floor(Math.random() * types.length)];
        const activityLevel = levels[Math.floor(Math.random() * levels.length)];

        // Generate 2-3 random traits
        const allTraits = ['night_owl', 'morning_grinder', 'weekend_warrior',
            'tournament_focused', 'cash_game_specialist', 'mixed_game_lover',
            'stats_nerd', 'live_player', 'online_crusher'];
        const numTraits = 2 + Math.floor(Math.random() * 2);
        const traits = [];
        for (let i = 0; i < numTraits; i++) {
            const trait = allTraits[Math.floor(Math.random() * allTraits.length)];
            if (!traits.includes(trait)) traits.push(trait);
        }

        return {
            type,
            activityLevel,
            traits,
            preferredSources: SOURCE_PREFERENCES[type] || ['HCL'],
            commentStyle: TRAIT_MODIFIERS[type]?.tone || 'casual',
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Get or create personality for a horse
     */
    async getPersonality(horseId) {
        // Check cache first
        if (this.cache.has(horseId)) {
            return this.cache.get(horseId);
        }

        // Fetch from database
        const { data: horse } = await this.supabase
            .from('content_authors')
            .select('personality')
            .eq('profile_id', horseId)
            .single();

        if (horse?.personality?.type) {
            this.cache.set(horseId, horse.personality);
            return horse.personality;
        }

        // Generate new personality
        const personality = this.generatePersonality();

        // Save to database
        await this.supabase
            .from('content_authors')
            .update({ personality })
            .eq('profile_id', horseId);

        this.cache.set(horseId, personality);
        return personality;
    }

    /**
     * Get a comment modified by personality
     */
    async getPersonalizedComment(horseId, baseComment, category) {
        const personality = await this.getPersonality(horseId);
        const modifiers = TRAIT_MODIFIERS[personality.type] || TRAIT_MODIFIERS.chill;

        // 30% chance to add personality phrase
        if (Math.random() < 0.3 && modifiers.commentPhrases.length > 0) {
            const phrase = modifiers.commentPhrases[Math.floor(Math.random() * modifiers.commentPhrases.length)];
            return Math.random() < 0.5 ? `${phrase} ${baseComment}` : `${baseComment} ${phrase}`;
        }

        // 20% chance to add personality emoji
        if (Math.random() < 0.2 && modifiers.emoji.length > 0) {
            const emoji = modifiers.emoji[Math.floor(Math.random() * modifiers.emoji.length)];
            return `${baseComment} ${emoji}`;
        }

        return baseComment;
    }

    /**
     * Get preferred sources for a horse
     */
    async getPreferredSources(horseId, allSources) {
        const personality = await this.getPersonality(horseId);
        const preferred = personality.preferredSources || [];

        // 60% chance to use preferred source, 40% any source
        if (Math.random() < 0.6 && preferred.length > 0) {
            return preferred.filter(s => allSources.includes(s));
        }

        return allSources;
    }

    /**
     * Check if horse should be active based on personality
     */
    async shouldBeActive(horseId) {
        const personality = await this.getPersonality(horseId);

        const activityChance = {
            [ACTIVITY_LEVELS.HYPER]: 0.9,
            [ACTIVITY_LEVELS.NORMAL]: 0.7,
            [ACTIVITY_LEVELS.CHILL]: 0.4,
            [ACTIVITY_LEVELS.LURKER]: 0.2
        };

        return Math.random() < (activityChance[personality.activityLevel] || 0.5);
    }

    /**
     * Get activity multiplier for social actions
     */
    async getActivityMultiplier(horseId) {
        const personality = await this.getPersonality(horseId);

        const multipliers = {
            [ACTIVITY_LEVELS.HYPER]: 2.0,
            [ACTIVITY_LEVELS.NORMAL]: 1.0,
            [ACTIVITY_LEVELS.CHILL]: 0.5,
            [ACTIVITY_LEVELS.LURKER]: 0.2
        };

        return multipliers[personality.activityLevel] || 1.0;
    }

    /**
     * Get all horse personalities for analytics
     */
    async getAllPersonalities() {
        const { data: horses } = await this.supabase
            .from('content_authors')
            .select('profile_id, name, personality')
            .eq('is_active', true);

        return horses || [];
    }
}

export { HorsePersonalityService, TRAIT_MODIFIERS, SOURCE_PREFERENCES };
export default HorsePersonalityService;
