/**
 * 🧠 HORSE MEMORY SERVICE
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Gives each horse persistent memory of their past posts and interactions.
 * Enables personality consistency and prevents content repetition.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface HorseMemory {
    id: string;
    memory_type: 'POST' | 'OPINION' | 'INTERACTION' | 'TOPIC' | 'STORY' | 'CLAIM';
    content_summary: string;
    keywords: string[];
    sentiment: 'positive' | 'negative' | 'neutral';
    related_topic: string | null;
    strength: number;
    created_at: Date;
}

export interface HorsePersonality {
    aggression_level: number;
    humor_level: number;
    technical_depth: number;
    contrarian_tendency: number;
    gto_vs_exploitative: 'gto_purist' | 'balanced' | 'exploitative';
    risk_tolerance: 'conservative' | 'moderate' | 'aggressive' | 'degen';
    preferred_topics: Record<string, number>;
    avoided_topics: string[];
    catchphrases: string[];
    pet_peeves: string[];
    origin_story: string | null;
    biggest_win: string | null;
    current_goals: string | null;
}

export interface MemoryContext {
    recentMemories: HorseMemory[];
    personality: HorsePersonality | null;
    topicsOnCooldown: string[];
    relationships: { authorId: number; type: string; sentiment: number }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 MEMORY SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class HorseMemoryService {

    /**
     * Get full memory context for a horse before generating content
     */
    async getMemoryContext(authorId: number, topic?: string): Promise<MemoryContext> {
        const [memories, personality, cooldowns, relationships] = await Promise.all([
            this.getRecentMemories(authorId, topic),
            this.getPersonality(authorId),
            this.getTopicsOnCooldown(authorId),
            this.getRelationships(authorId)
        ]);

        return {
            recentMemories: memories,
            personality,
            topicsOnCooldown: cooldowns,
            relationships
        };
    }

    /**
     * Get recent memories for a horse
     */
    async getRecentMemories(authorId: number, topic?: string, limit: number = 10): Promise<HorseMemory[]> {
        const { data, error } = await supabase.rpc('get_horse_memories', {
            p_author_id: authorId,
            p_topic: topic || null,
            p_limit: limit
        });

        if (error) {
            console.error('[HorseMemory] Error fetching memories:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Get horse personality traits
     */
    async getPersonality(authorId: number): Promise<HorsePersonality | null> {
        const { data, error } = await supabase.rpc('get_horse_personality', {
            p_author_id: authorId
        });

        if (error || !data || Object.keys(data).length === 0) {
            return null;
        }

        return data as HorsePersonality;
    }

    /**
     * Get topics currently on cooldown for this horse
     */
    async getTopicsOnCooldown(authorId: number): Promise<string[]> {
        const { data, error } = await supabase
            .from('horse_topic_cooldowns')
            .select('topic, last_posted_at, cooldown_hours')
            .eq('author_id', authorId);

        if (error || !data) return [];

        const now = new Date();
        return data
            .filter(row => {
                const cooldownEnd = new Date(row.last_posted_at);
                cooldownEnd.setHours(cooldownEnd.getHours() + row.cooldown_hours);
                return cooldownEnd > now;
            })
            .map(row => row.topic);
    }

    /**
     * Get relationships with other horses
     */
    async getRelationships(authorId: number): Promise<{ authorId: number; type: string; sentiment: number }[]> {
        const { data, error } = await supabase
            .from('horse_relationships')
            .select('target_author_id, relationship_type, sentiment_score')
            .eq('author_id', authorId);

        if (error || !data) return [];

        return data.map(row => ({
            authorId: row.target_author_id,
            type: row.relationship_type,
            sentiment: row.sentiment_score
        }));
    }

    /**
     * Record a new memory after posting
     */
    async recordMemory(
        authorId: number,
        memoryType: HorseMemory['memory_type'],
        contentSummary: string,
        options: {
            relatedTopic?: string;
            keywords?: string[];
            sentiment?: 'positive' | 'negative' | 'neutral';
            sourcePostId?: string;
        } = {}
    ): Promise<string | null> {
        const { data, error } = await supabase.rpc('record_horse_memory', {
            p_author_id: authorId,
            p_memory_type: memoryType,
            p_content_summary: contentSummary,
            p_related_topic: options.relatedTopic || null,
            p_keywords: options.keywords || [],
            p_sentiment: options.sentiment || 'neutral',
            p_source_post_id: options.sourcePostId || null
        });

        if (error) {
            console.error('[HorseMemory] Error recording memory:', error);
            return null;
        }

        return data;
    }

    /**
     * Set topic cooldown after posting about it
     */
    async setTopicCooldown(authorId: number, topic: string, hours: number = 48): Promise<void> {
        await supabase.rpc('set_topic_cooldown', {
            p_author_id: authorId,
            p_topic: topic,
            p_cooldown_hours: hours
        });
    }

    /**
     * Check if a topic is on cooldown
     */
    async isTopicOnCooldown(authorId: number, topic: string): Promise<boolean> {
        const { data } = await supabase.rpc('is_topic_on_cooldown', {
            p_author_id: authorId,
            p_topic: topic
        });
        return data === true;
    }

    /**
     * Record an interaction between horses
     */
    async recordInteraction(
        authorId: number,
        targetAuthorId: number,
        isPositive: boolean
    ): Promise<void> {
        // Get existing relationship
        const { data: existing } = await supabase
            .from('horse_relationships')
            .select('*')
            .eq('author_id', authorId)
            .eq('target_author_id', targetAuthorId)
            .single();

        if (existing) {
            // Update existing
            const positive = existing.positive_interactions + (isPositive ? 1 : 0);
            const negative = existing.negative_interactions + (isPositive ? 0 : 1);
            const total = existing.total_interactions + 1;
            const sentiment = (positive - negative) / total;

            await supabase
                .from('horse_relationships')
                .update({
                    total_interactions: total,
                    positive_interactions: positive,
                    negative_interactions: negative,
                    sentiment_score: Math.max(-1, Math.min(1, sentiment)),
                    last_interaction_at: new Date().toISOString()
                })
                .eq('id', existing.id);
        } else {
            // Create new
            await supabase.from('horse_relationships').insert({
                author_id: authorId,
                target_author_id: targetAuthorId,
                relationship_type: 'neutral',
                total_interactions: 1,
                positive_interactions: isPositive ? 1 : 0,
                negative_interactions: isPositive ? 0 : 1,
                sentiment_score: isPositive ? 0.2 : -0.2,
                last_interaction_at: new Date().toISOString()
            });
        }
    }

    /**
     * Initialize personality for a new horse
     */
    async initializePersonality(
        authorId: number,
        traits: Partial<HorsePersonality>
    ): Promise<void> {
        await supabase.from('horse_personality').upsert({
            author_id: authorId,
            aggression_level: traits.aggression_level ?? 5,
            humor_level: traits.humor_level ?? 5,
            technical_depth: traits.technical_depth ?? 5,
            contrarian_tendency: traits.contrarian_tendency ?? 3,
            gto_vs_exploitative: traits.gto_vs_exploitative ?? 'balanced',
            risk_tolerance: traits.risk_tolerance ?? 'moderate',
            preferred_topics: traits.preferred_topics ?? {},
            avoided_topics: traits.avoided_topics ?? [],
            catchphrases: traits.catchphrases ?? [],
            pet_peeves: traits.pet_peeves ?? [],
            origin_story: traits.origin_story ?? null,
            biggest_win: traits.biggest_win ?? null,
            current_goals: traits.current_goals ?? null,
            updated_at: new Date().toISOString()
        });
    }

    /**
     * Build memory-aware prompt section for AI generation
     */
    buildMemoryPromptSection(context: MemoryContext): string {
        const sections: string[] = [];

        // Personality traits
        if (context.personality) {
            const p = context.personality;
            sections.push(`PERSONALITY TRAITS:
- Aggression: ${p.aggression_level}/10 (${p.aggression_level >= 7 ? 'confrontational' : p.aggression_level <= 3 ? 'mild-mannered' : 'balanced'})
- Humor: ${p.humor_level}/10 (${p.humor_level >= 7 ? 'very witty' : p.humor_level <= 3 ? 'serious' : 'occasional jokes'})
- Technical Depth: ${p.technical_depth}/10 (${p.technical_depth >= 7 ? 'loves deep analysis' : p.technical_depth <= 3 ? 'keeps it simple' : 'moderate detail'})
- Philosophy: ${p.gto_vs_exploitative === 'gto_purist' ? 'GTO believer' : p.gto_vs_exploitative === 'exploitative' ? 'Exploitative player' : 'Balanced approach'}
- Risk Tolerance: ${p.risk_tolerance}`);

            if (p.catchphrases?.length) {
                sections.push(`SIGNATURE PHRASES (use occasionally): ${p.catchphrases.join(', ')}`);
            }

            if (p.origin_story) {
                sections.push(`BACKSTORY: ${p.origin_story}`);
            }

            if (p.current_goals) {
                sections.push(`CURRENT GOALS: ${p.current_goals}`);
            }
        }

        // Recent memories
        if (context.recentMemories.length > 0) {
            const memoryLines = context.recentMemories
                .slice(0, 5)
                .map(m => `- [${m.memory_type}] ${m.content_summary}`);
            sections.push(`RECENT MEMORY (reference these for consistency):\n${memoryLines.join('\n')}`);
        }

        // Topics to avoid
        if (context.topicsOnCooldown.length > 0) {
            sections.push(`TOPICS ON COOLDOWN (do NOT post about): ${context.topicsOnCooldown.join(', ')}`);
        }

        // Relationships
        if (context.relationships.length > 0) {
            const relationshipInfo = context.relationships
                .filter(r => Math.abs(r.sentiment) > 0.3)
                .map(r => `Author #${r.authorId}: ${r.sentiment > 0 ? 'friendly' : 'rival'}`);
            if (relationshipInfo.length > 0) {
                sections.push(`RELATIONSHIPS:\n${relationshipInfo.join('\n')}`);
            }
        }

        return sections.join('\n\n');
    }

    /**
     * Extract keywords from content for memory storage
     */
    extractKeywords(content: string): string[] {
        const pokerKeywords = [
            'GTO', 'exploitative', 'ranges', 'equity', 'EV', 'ICM',
            'preflop', 'postflop', 'flop', 'turn', 'river',
            'bluff', 'value', 'check', 'bet', 'raise', 'fold', 'call',
            'position', 'button', 'blinds', 'ante', 'stack',
            'tournament', 'cash game', 'MTT', 'SNG', 'heads up',
            'bankroll', 'variance', 'tilt', 'mindset',
            'solver', 'HUD', 'stats', 'VPIP', 'PFR',
            'NLH', 'PLO', 'mixed games', 'high stakes', 'micros'
        ];

        const contentLower = content.toLowerCase();
        return pokerKeywords.filter(kw => contentLower.includes(kw.toLowerCase()));
    }

    /**
     * Determine sentiment of content
     */
    analyzeSentiment(content: string): 'positive' | 'negative' | 'neutral' {
        const positiveWords = ['great', 'love', 'awesome', 'nice', 'profit', 'win', 'crushed', 'shipped'];
        const negativeWords = ['hate', 'terrible', 'bad beat', 'variance', 'tilt', 'lost', 'punted', 'rigged'];

        const contentLower = content.toLowerCase();
        const positiveCount = positiveWords.filter(w => contentLower.includes(w)).length;
        const negativeCount = negativeWords.filter(w => contentLower.includes(w)).length;

        if (positiveCount > negativeCount) return 'positive';
        if (negativeCount > positiveCount) return 'negative';
        return 'neutral';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

export const horseMemoryService = new HorseMemoryService();
export default horseMemoryService;
