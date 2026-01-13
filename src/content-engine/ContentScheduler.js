/**
 * 📅 CONTENT SCHEDULER
 * ═══════════════════════════════════════════════════════════════════════════
 * Manages the automated posting schedule for seeded content.
 * Distributes posts across the day with natural timing patterns.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { contentGenerator } from './ContentCommander.js';
import personas from './personas.json' assert { type: 'json' };

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SCHEDULE_CONFIG = {
    // Peak posting hours (local time for each timezone)
    PEAK_HOURS: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],

    // Posts per persona per day (max)
    MAX_POSTS_PER_PERSONA_PER_DAY: 2,

    // Minimum gap between posts from same author (hours)
    MIN_GAP_HOURS: 4,

    // Daily content targets by type
    DAILY_MIX: {
        strategy_tip: 5,
        hand_analysis: 4,
        mindset_post: 3,
        beginner_guide: 3,
        advanced_concept: 2,
        bankroll_advice: 2,
        tournament_tip: 3,
        news_commentary: 2
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ContentScheduler {

    /**
     * Generate a full day's content schedule
     */
    async scheduleDayContent(targetDate = new Date()) {
        console.log(`\n📅 Scheduling content for: ${targetDate.toDateString()}\n`);

        const schedule = [];
        const usedPersonaSlots = {}; // Track posts per persona

        // Generate slots for each content type based on daily mix
        for (const [contentType, count] of Object.entries(SCHEDULE_CONFIG.DAILY_MIX)) {
            for (let i = 0; i < count; i++) {
                // Pick a random persona that hasn't hit their limit
                const availablePersonas = personas.personas.filter(p => {
                    const used = usedPersonaSlots[p.id] || 0;
                    return used < SCHEDULE_CONFIG.MAX_POSTS_PER_PERSONA_PER_DAY;
                });

                if (availablePersonas.length === 0) continue;

                const persona = this.randomChoice(availablePersonas);
                usedPersonaSlots[persona.id] = (usedPersonaSlots[persona.id] || 0) + 1;

                // Generate random time during peak hours
                const hour = this.randomChoice(SCHEDULE_CONFIG.PEAK_HOURS);
                const minute = Math.floor(Math.random() * 60);

                const scheduledTime = new Date(targetDate);
                scheduledTime.setHours(hour, minute, 0, 0);

                schedule.push({
                    persona,
                    contentType,
                    scheduledTime
                });
            }
        }

        // Sort by scheduled time
        schedule.sort((a, b) => a.scheduledTime - b.scheduledTime);

        console.log(`📝 Generated ${schedule.length} scheduled slots\n`);

        return schedule;
    }

    /**
     * Execute the schedule - generate and queue content
     */
    async executeSchedule(schedule) {
        console.log(`\n⚡ Executing schedule with ${schedule.length} items\n`);

        for (const slot of schedule) {
            try {
                // Generate content
                const content = await contentGenerator.generateContent(
                    slot.persona,
                    slot.contentType
                );

                if (!content) continue;

                // Insert content as scheduled
                const { data: insertedContent, error: contentError } = await supabase
                    .from('seeded_content')
                    .insert({
                        ...content,
                        status: 'scheduled',
                        scheduled_for: slot.scheduledTime.toISOString()
                    })
                    .select()
                    .single();

                if (contentError) {
                    console.error('Content insert error:', contentError);
                    continue;
                }

                // Create schedule entry
                const { error: scheduleError } = await supabase
                    .from('content_schedule')
                    .insert({
                        content_id: insertedContent.id,
                        scheduled_time: slot.scheduledTime.toISOString()
                    });

                if (scheduleError) {
                    console.error('Schedule insert error:', scheduleError);
                    continue;
                }

                console.log(`✅ Scheduled: ${slot.persona.alias} - ${slot.contentType} @ ${slot.scheduledTime.toLocaleTimeString()}`);

                // Rate limit protection
                await this.sleep(1500);

            } catch (error) {
                console.error(`Error processing slot:`, error);
            }
        }

        console.log(`\n🎉 Schedule execution complete!\n`);
    }

    /**
     * Check and publish any content that's due
     */
    async publishDueContent() {
        console.log('\n🔄 Checking for content to publish...\n');

        const { data, error } = await supabase.rpc('publish_scheduled_content');

        if (error) {
            console.error('Publish error:', error);
            return;
        }

        // Get count of just-published content
        const { data: published } = await supabase
            .from('seeded_content')
            .select('id, author_alias, content_type')
            .eq('status', 'published')
            .gte('published_at', new Date(Date.now() - 60000).toISOString());

        if (published && published.length > 0) {
            console.log(`📰 Just published ${published.length} posts:`);
            published.forEach(p => console.log(`   - ${p.author_alias}: ${p.content_type}`));
        } else {
            console.log('No content due for publishing.');
        }
    }

    /**
     * Run a full day cycle
     */
    async runDailyCycle() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Schedule tomorrow's content
        const schedule = await this.scheduleDayContent(tomorrow);
        await this.executeSchedule(schedule);
    }

    /**
     * Seed initial content immediately (for bootstrapping)
     */
    async seedImmediate(count = 50) {
        console.log(`\n🌱 IMMEDIATE SEED: Generating ${count} posts for instant publish\n`);

        const content = await contentGenerator.generateBatch(count);

        for (const post of content) {
            const { error } = await supabase
                .from('seeded_content')
                .insert({
                    ...post,
                    status: 'published',
                    published_at: new Date().toISOString()
                });

            if (error) {
                console.error('Insert error:', error);
            }
        }

        console.log(`\n✅ Immediate seed complete! ${content.length} posts published.\n`);
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

const scheduler = new ContentScheduler();

const command = process.argv[2];

switch (command) {
    case 'seed':
        const seedCount = parseInt(process.argv[3]) || 50;
        scheduler.seedImmediate(seedCount);
        break;

    case 'schedule':
        scheduler.runDailyCycle();
        break;

    case 'publish':
        scheduler.publishDueContent();
        break;

    case 'full':
        // Full bootstrap: seed + schedule
        (async () => {
            await scheduler.seedImmediate(100);
            await scheduler.runDailyCycle();
        })();
        break;

    default:
        console.log(`
📅 CONTENT SCHEDULER CLI

Usage:
  node ContentScheduler.js seed [count]    - Immediately publish [count] posts
  node ContentScheduler.js schedule        - Schedule tomorrow's content
  node ContentScheduler.js publish         - Publish any due scheduled content
  node ContentScheduler.js full            - Full bootstrap (seed 100 + schedule)
        `);
}

export default ContentScheduler;
