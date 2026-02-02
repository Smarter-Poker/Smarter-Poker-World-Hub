/**
 * ✍️ AI CONTENT REWRITER
 * ═══════════════════════════════════════════════════════════════════════════
 * Takes news headlines/articles and rewrites them in persona voices.
 * Creates original commentary, not just reposts.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../lib/grokClient.js';
import { rssAggregator } from './RSSAggregator.js';
import personas from '../personas.json' assert { type: 'json' };

const openai = getGrokClient();

// Content formats
const CONTENT_FORMATS = {
    hot_take: {
        name: 'Hot Take',
        prompt: `Write a spicy hot take reaction to this poker news. Be opinionated and engaging. 
        Start with your reaction, then explain why you feel that way. 2-3 sentences max.`,
        maxTokens: 150
    },
    analysis: {
        name: 'Analysis',
        prompt: `Write a thoughtful analysis of this poker news from a player's perspective.
        What does this mean for the poker community? Share your unique insight. 3-4 sentences.`,
        maxTokens: 200
    },
    commentary: {
        name: 'Commentary',
        prompt: `React to this news like you're chatting with poker friends at the table.
        Be natural, conversational, maybe a little humor. 2-3 sentences.`,
        maxTokens: 150
    },
    strategy_spin: {
        name: 'Strategy Angle',
        prompt: `Connect this poker news to a strategy lesson or tip.
        What can players learn from this? Turn news into actionable insight. 3-4 sentences.`,
        maxTokens: 200
    },
    short_form: {
        name: 'Short Form (Reel/TikTok script)',
        prompt: `Write a punchy 15-30 second video script about this poker news.
        Format: Hook (1 line) → Main point (2-3 lines) → Call to action or punchline (1 line).
        Make it engaging for short attention spans.`,
        maxTokens: 150
    }
};

// Voice style prompts (imported from ContentCommander)
const VOICE_PROMPTS = {
    analytical: "Write with precision and data. Use statistics and logical breakdowns.",
    enthusiastic: "You're excited! Use energy and encouragement.",
    experienced: "You've seen it all. Share wisdom from years at the table.",
    technical: "Focus on GTO concepts and technical accuracy.",
    street_smart: "You learned poker the hard way. Keep it real.",
    casual: "Keep it light and conversational. Poker should be fun.",
    humorous: "Make it witty. Drop some jokes.",
    confident: "You know your stuff. Project certainty.",
    educational: "Teach while you react. Make people learn something.",
    sarcastic: "A little sarcasm goes a long way.",
    passionate: "Show your love for the game.",
    skeptical: "Question everything. Be the devil's advocate."
};

class ContentRewriter {

    /**
     * Rewrite a single article in a persona's voice
     */
    async rewriteArticle(article, persona, format = 'commentary') {
        const formatConfig = CONTENT_FORMATS[format] || CONTENT_FORMATS.commentary;
        const voiceGuide = VOICE_PROMPTS[persona.voice] || VOICE_PROMPTS.casual;

        const systemPrompt = `You are ${persona.name}, a poker player from ${persona.location}.
Specialty: ${persona.specialty?.replace('_', ' ')} at ${persona.stakes}.
Background: ${persona.bio}

VOICE STYLE: ${voiceGuide}

Rules:
- Write as yourself, in first person
- Be authentic to your background and expertise
- No hashtags unless they fit naturally
- Don't mention that you "read an article" - react like you heard this news naturally
- Reference your personal experience when relevant`;

        const userPrompt = `${formatConfig.prompt}

NEWS TO REACT TO:
Headline: ${article.title}
Summary: ${article.description}
Source: ${article.source_name}`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: formatConfig.maxTokens,
                temperature: 0.85
            });

            const content = response.choices[0].message.content;

            return {
                original_article: {
                    title: article.title,
                    link: article.link,
                    source: article.source_name
                },
                rewritten: {
                    content: content,
                    format: format,
                    persona_id: persona.id,
                    persona_name: persona.name,
                    persona_alias: persona.alias,
                    created_at: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error(`Rewrite error for ${persona.name}:`, error.message);
            return null;
        }
    }

    /**
     * Generate a batch of rewritten content from latest news
     */
    async generateBatch(count = 10) {
        console.log(`\n✍️ Generating ${count} rewritten articles...\n`);

        // Get latest articles
        const articles = await rssAggregator.getLatest(count * 2);

        if (articles.length === 0) {
            console.log('No articles found!');
            return [];
        }

        const results = [];
        const formats = Object.keys(CONTENT_FORMATS);

        for (let i = 0; i < count; i++) {
            // Pick random article and persona
            const article = articles[i % articles.length];
            const persona = this.randomChoice(personas.personas);
            const format = this.randomChoice(formats);

            const result = await this.rewriteArticle(article, persona, format);

            if (result) {
                results.push(result);
                console.log(`✅ ${persona.alias} (${format}): "${article.title.slice(0, 50)}..."`);
            }

            // Rate limit protection
            await this.sleep(500);
        }

        console.log(`\n📝 Generated ${results.length} pieces of content\n`);
        return results;
    }

    /**
     * Generate video script from article
     */
    async generateVideoScript(article, persona) {
        return this.rewriteArticle(article, persona, 'short_form');
    }

    /**
     * Get content formats
     */
    getFormats() {
        return CONTENT_FORMATS;
    }

    // Utilities
    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const contentRewriter = new ContentRewriter();
export default ContentRewriter;
