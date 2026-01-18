#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAILY CONTENT GENERATOR — Smarter.Poker System Account
 * 
 * Generates and publishes daily poker strategy content to the social feed.
 * This script runs as the system account and injects content directly into
 * the social_posts table.
 * 
 * Usage:
 *   node scripts/daily-content-generator.js
 * 
 * Future: Can be scheduled via cron job for automated daily execution
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// System account UUID (must match database migration)
const SYSTEM_ACCOUNT_UUID = '00000000-0000-0000-0000-000000000001';

// Initialize Supabase client with SERVICE ROLE key (bypasses RLS)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY, // Service role key required!
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

/**
 * Content library for daily posts
 * Future: Replace with AI-generated content
 */
const CONTENT_LIBRARY = [
    {
        content: "🎯 Daily Strategy Tip: Position is power in poker. Playing more hands from the button gives you a massive informational advantage. You act last post-flop, seeing what everyone else does before making your decision.",
        content_type: "strategy_tip"
    },
    {
        content: "🧠 GTO Concept: Balanced ranges prevent exploitation. If you only bet strong hands, observant opponents will fold. Mix in bluffs at the right frequency to keep them guessing.",
        content_type: "gto_concept"
    },
    {
        content: "💎 Tournament Wisdom: ICM (Independent Chip Model) changes everything near the bubble. That chip you risk is worth more than the chip you could win. Play tight when others are desperate.",
        content_type: "tournament_tip"
    },
    {
        content: "🔥 Training Challenge: Can you identify the optimal bet size with top pair on a wet board? Head to the GTO Training Arena and test your skills across 10 progressive levels!",
        content_type: "training_challenge"
    },
    {
        content: "📊 Poker Math: You need to win 33% of the time to break even on a pot-sized bet. If villain bets $100 into a $100 pot, you're getting 2:1 odds. Know your pot odds!",
        content_type: "poker_math"
    },
    {
        content: "🎲 Hand Reading Tip: When a tight player suddenly gets aggressive, they usually have it. When a loose player gets aggressive, they could have anything. Adjust your ranges accordingly.",
        content_type: "hand_reading"
    },
    {
        content: "⚡ Quick Tip: Don't play every hand. Patience is a weapon. Wait for profitable spots and strike with precision. Your win rate will thank you.",
        content_type: "quick_tip"
    }
];

/**
 * Selects content for today based on date
 * Ensures different content each day
 */
function getTodayContent() {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const index = dayOfYear % CONTENT_LIBRARY.length;
    return CONTENT_LIBRARY[index];
}

/**
 * Publishes a post to the social feed as the system account
 */
async function publishDailyContent() {
    try {
        console.log('🚀 Starting Daily Content Generator...');
        console.log(`📅 Date: ${new Date().toISOString()}`);

        // Verify system account exists
        const { data: systemAccount, error: accountError } = await supabase
            .from('profiles')
            .select('id, username, full_name')
            .eq('id', SYSTEM_ACCOUNT_UUID)
            .single();

        if (accountError || !systemAccount) {
            throw new Error(`System account not found: ${accountError?.message}`);
        }

        console.log(`✅ System account verified: ${systemAccount.username}`);

        // Get today's content
        const todayContent = getTodayContent();
        console.log(`📝 Content type: ${todayContent.content_type}`);

        // Insert post into social_posts
        const { data: post, error: postError } = await supabase
            .from('social_posts')
            .insert({
                author_id: SYSTEM_ACCOUNT_UUID,
                content: todayContent.content,
                content_type: todayContent.content_type,
                visibility: 'public',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (postError) {
            throw new Error(`Failed to create post: ${postError.message}`);
        }

        console.log(`✅ Post created successfully!`);
        console.log(`   Post ID: ${post.id}`);
        console.log(`   Content: ${todayContent.content.substring(0, 80)}...`);
        console.log('');
        console.log('🎉 Daily content published to social feed!');

        return post;

    } catch (error) {
        console.error('❌ Error publishing daily content:', error.message);
        throw error;
    }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    publishDailyContent()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

export { publishDailyContent, getTodayContent };
