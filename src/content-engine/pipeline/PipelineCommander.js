/**
 * 🚀 CONTENT PIPELINE COMMANDER
 * ═══════════════════════════════════════════════════════════════════════════
 * Master orchestrator for the entire content generation pipeline.
 * 
 * Coordinates:
 * - RSS Aggregation
 * - AI Rewriting
 * - Video Generation
 * - Auto Posting
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { rssAggregator } from './RSSAggregator.js';
import { contentRewriter } from './ContentRewriter.js';
import { videoGenerator } from './VideoGenerator.js';
import { autoPoster } from './AutoPoster.js';
import { createClient } from '@supabase/supabase-js';
import personas from '../personas.json' assert { type: 'json' };

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

class PipelineCommander {
    constructor() {
        this.settings = null;
        this.activePersonas = [];
    }

    /**
     * Initialize pipeline with settings from database
     */
    async init() {
        console.log('\n🚀 CONTENT PIPELINE COMMANDER INITIALIZING...\n');

        // Load settings
        const { data: settings } = await supabase
            .from('content_settings')
            .select('*')
            .single();

        this.settings = settings || this.getDefaultSettings();

        // Load active personas
        const { data: dbPersonas } = await supabase
            .from('content_authors')
            .select('alias')
            .eq('is_active', true);

        const activeAliases = new Set(dbPersonas?.map(p => p.alias) || []);

        // If no personas in DB yet, use all from JSON
        if (activeAliases.size === 0) {
            this.activePersonas = personas.personas;
        } else {
            this.activePersonas = personas.personas.filter(p => activeAliases.has(p.alias));
        }

        console.log(`📊 Settings loaded`);
        console.log(`🐴 Active personas: ${this.activePersonas.length}`);
        console.log(`⚙️  Engine: ${this.settings.engine_enabled ? 'ENABLED' : 'DISABLED'}\n`);

        return this;
    }

    getDefaultSettings() {
        return {
            engine_enabled: true,
            posts_per_day: 20,
            min_delay_minutes: 30,
            max_delay_minutes: 120,
            ai_model: 'gpt-4o',
            temperature: 0.8,
            auto_publish: true
        };
    }

    /**
     * Run a single content generation cycle
     */
    async runCycle(options = {}) {
        const {
            text_posts = 10,
            videos = 2,
            schedule = true
        } = options;

        if (!this.settings?.engine_enabled) {
            console.log('⏸️  Engine is disabled. Skipping cycle.');
            return { status: 'disabled' };
        }

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  🔄 STARTING CONTENT CYCLE');
        console.log('═══════════════════════════════════════════════════════════════\n');

        const results = {
            text_posts: [],
            videos: [],
            errors: []
        };

        try {
            // Step 1: Fetch latest news
            console.log('📡 STEP 1: Fetching news from RSS feeds...');
            const articles = await rssAggregator.getLatest(text_posts + videos);
            console.log(`   Found ${articles.length} articles\n`);

            // Step 2: Generate text posts
            if (text_posts > 0) {
                console.log(`✍️  STEP 2: Generating ${text_posts} text posts...`);

                for (let i = 0; i < text_posts && i < articles.length; i++) {
                    const persona = this.randomChoice(this.activePersonas);
                    const format = this.randomChoice(['hot_take', 'analysis', 'commentary', 'strategy_spin']);

                    try {
                        const rewritten = await contentRewriter.rewriteArticle(
                            articles[i],
                            persona,
                            format
                        );

                        if (rewritten) {
                            // Post or schedule
                            const scheduleTime = schedule ? this.getNextScheduleTime() : null;

                            const posted = await autoPoster.postContent(
                                rewritten.rewritten.content,
                                {
                                    persona_id: persona.id,
                                    persona_name: persona.name,
                                    persona_alias: persona.alias,
                                    content_type: format,
                                    schedule_for: scheduleTime,
                                    original_source: rewritten.original_article
                                }
                            );

                            results.text_posts.push(posted);
                        }
                    } catch (error) {
                        console.error(`   Error generating post ${i + 1}:`, error.message);
                        results.errors.push({ type: 'text', error: error.message });
                    }

                    await this.sleep(500);
                }

                console.log(`   ✅ Created ${results.text_posts.length} posts\n`);
            }

            // Step 3: Generate videos
            if (videos > 0) {
                console.log(`🎬 STEP 3: Generating ${videos} videos...`);

                for (let i = 0; i < videos; i++) {
                    const articleIndex = text_posts + i;
                    if (articleIndex >= articles.length) break;

                    const persona = this.randomChoice(this.activePersonas);

                    try {
                        const video = await videoGenerator.generateFromArticle(
                            articles[articleIndex],
                            persona
                        );

                        if (video) {
                            const scheduleTime = schedule ? this.getNextScheduleTime() : null;

                            const posted = await autoPoster.postVideo(
                                video.path,
                                video,
                                {
                                    persona_id: persona.id,
                                    persona_name: persona.name,
                                    persona_alias: persona.alias,
                                    schedule_for: scheduleTime
                                }
                            );

                            results.videos.push(posted);
                        }
                    } catch (error) {
                        console.error(`   Error generating video ${i + 1}:`, error.message);
                        results.errors.push({ type: 'video', error: error.message });
                    }
                }

                console.log(`   ✅ Created ${results.videos.length} videos\n`);
            }

        } catch (error) {
            console.error('Pipeline error:', error);
            results.errors.push({ type: 'pipeline', error: error.message });
        }

        // Summary
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  📊 CYCLE COMPLETE');
        console.log(`     Text Posts: ${results.text_posts.length}`);
        console.log(`     Videos: ${results.videos.length}`);
        console.log(`     Errors: ${results.errors.length}`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        return results;
    }

    /**
     * Run daily content generation
     */
    async runDaily() {
        await this.init();

        const postsPerDay = this.settings?.posts_per_day || 20;
        const videosPerDay = Math.floor(postsPerDay / 10); // 1 video per 10 posts

        return this.runCycle({
            text_posts: postsPerDay,
            videos: videosPerDay,
            schedule: true
        });
    }

    /**
     * Publish any due scheduled content
     */
    async publishDue() {
        console.log('\n📤 Publishing due content...\n');
        return autoPoster.publishDue();
    }

    /**
     * Get next schedule time based on settings
     */
    getNextScheduleTime() {
        const min = this.settings?.min_delay_minutes || 30;
        const max = this.settings?.max_delay_minutes || 120;
        const delay = min + Math.random() * (max - min);

        const time = new Date();
        time.setMinutes(time.getMinutes() + delay);

        return time.toISOString();
    }

    /**
     * Quick test run (fewer items, no scheduling)
     */
    async testRun() {
        await this.init();

        console.log('\n🧪 RUNNING TEST CYCLE (3 posts, 0 videos, no scheduling)\n');

        return this.runCycle({
            text_posts: 3,
            videos: 0,
            schedule: false
        });
    }

    /**
     * Generate a single video on demand
     */
    async generateSingleVideo(topic = null) {
        await this.init();

        console.log('\n🎬 Generating single video on demand...\n');

        const persona = this.randomChoice(this.activePersonas);

        if (topic) {
            // Custom topic
            const video = await videoGenerator.generateVideo(topic, persona);
            return autoPoster.postVideo(video.path, video, {
                persona_id: persona.id,
                persona_name: persona.name,
                persona_alias: persona.alias
            });
        } else {
            // From latest news
            const articles = await rssAggregator.getLatest(1);
            if (articles.length === 0) throw new Error('No articles available');

            const video = await videoGenerator.generateFromArticle(articles[0], persona);
            return autoPoster.postVideo(video.path, video, {
                persona_id: persona.id,
                persona_name: persona.name,
                persona_alias: persona.alias
            });
        }
    }

    // Utilities
    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

const pipeline = new PipelineCommander();

const command = process.argv[2];

switch (command) {
    case 'test':
        pipeline.testRun().then(() => process.exit(0));
        break;

    case 'daily':
        pipeline.runDaily().then(() => process.exit(0));
        break;

    case 'publish':
        pipeline.init().then(() => pipeline.publishDue()).then(() => process.exit(0));
        break;

    case 'video':
        const topic = process.argv[3];
        pipeline.generateSingleVideo(topic).then(() => process.exit(0));
        break;

    case 'cycle':
        const posts = parseInt(process.argv[3]) || 10;
        const videos = parseInt(process.argv[4]) || 2;
        pipeline.init()
            .then(() => pipeline.runCycle({ text_posts: posts, videos: videos }))
            .then(() => process.exit(0));
        break;

    default:
        console.log(`
🚀 CONTENT PIPELINE COMMANDER

Usage:
  node PipelineCommander.js test              - Quick test (3 posts, no video)
  node PipelineCommander.js daily             - Full daily run
  node PipelineCommander.js publish           - Publish due scheduled content
  node PipelineCommander.js video [topic]     - Generate single video
  node PipelineCommander.js cycle [posts] [videos] - Custom cycle

Examples:
  node PipelineCommander.js cycle 20 5        - 20 posts + 5 videos
  node PipelineCommander.js video "Phil Ivey just won the Super High Roller"
        `);
}

export { PipelineCommander };
export default pipeline;
