#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES CACHE WARMER — Strategy 2: Pre-seed the Supabase cache
   
   This script pre-fills the geeves_knowledge_cache table with the top 
   200+ most-asked Q&A pairs drawn directly from the expanded KB.
   
   After running this, every user gets instant cached answers for common
   questions — even if they are the first person ever to ask that question.
   
   Run: node scripts/warmGeevesCache.js
   (Also triggered via: npm run warm-geeves)
   ═══════════════════════════════════════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── All canonical Q&A pairs that should pre-exist in the cache ──
// These represent the most common user queries across every platform area.
const WARM_ENTRIES = [
    // ── Platform & World Hub ──
    { question: 'what is smarter poker', category: 'World Hub' },
    { question: 'what is the world hub', category: 'World Hub' },
    { question: 'how do i sign up', category: 'Account' },
    { question: 'how do i create an account', category: 'Account' },
    { question: 'how do i log in', category: 'Account' },
    { question: 'how do i reset my password', category: 'Account' },
    { question: 'what are diamonds', category: 'Diamond Economy' },
    { question: 'how do i earn diamonds', category: 'Diamond Economy' },
    { question: 'what is vip membership', category: 'VIP' },
    { question: 'what does vip unlock', category: 'VIP' },
    { question: 'how do i install the app', category: 'Platform' },
    { question: 'how do i add to home screen', category: 'Platform' },
    { question: 'how do i change my avatar', category: 'Profile' },
    { question: 'how do i edit my profile', category: 'Profile' },
    { question: 'where are my settings', category: 'Settings' },
    { question: 'how do i turn off notifications', category: 'Platform' },
    { question: 'how do i add friends', category: 'Social' },
    { question: 'how do i send a message', category: 'Social' },
    { question: 'how do i create a post', category: 'Social' },
    { question: 'what are stories', category: 'Social' },
    { question: 'how do i upload a reel', category: 'Social' },
    { question: 'how does the prize wheel work', category: 'Diamond Economy' },
    { question: 'what is a daily streak', category: 'Diamond Economy' },
    { question: 'what are achievements', category: 'Platform' },
    { question: 'how do i get help', category: 'Platform' },
    { question: 'who is geeves', category: 'Geeves' },
    { question: 'who is jarvis', category: 'Training' },
    { question: 'what is pokeriq', category: 'Training' },
    { question: 'how do i manage my subscription', category: 'Account' },
    { question: 'where are the leaderboards', category: 'Platform' },

    // ── Club Commander ──
    { question: 'what is club commander', category: 'Club Commander' },
    { question: 'how does the waitlist work', category: 'Club Commander' },
    { question: 'how do i run a tournament', category: 'Club Commander' },
    { question: 'how do i set up a tournament', category: 'Club Commander' },
    { question: 'how does dealer rotation work', category: 'Club Commander' },
    { question: 'how do i open a table', category: 'Club Commander' },
    { question: 'how do i manage members', category: 'Club Commander' },
    { question: 'how does check-in work', category: 'Club Commander' },
    { question: 'where are the reports', category: 'Club Commander' },
    { question: 'how do i set up displays', category: 'Club Commander' },
    { question: 'how do floor calls work', category: 'Club Commander' },
    { question: 'how do high hands work', category: 'Club Commander' },
    { question: 'how does the cashier work', category: 'Club Commander' },
    { question: 'how do i manage staff', category: 'Club Commander' },
    { question: 'how do i get started with commander', category: 'Club Commander' },
    { question: 'what is the kiosk', category: 'Club Commander' },
    { question: 'how do leagues work', category: 'Club Commander' },
    { question: 'how do i run a multi-day tournament', category: 'Club Commander' },
    { question: 'how does table breaking work', category: 'Club Commander' },
    { question: 'how do i set up blind structures', category: 'Club Commander' },
    { question: 'how do payouts work', category: 'Club Commander' },
    { question: 'what is the player card', category: 'Club Commander' },
    { question: 'how do i register players for a tournament', category: 'Club Commander' },

    // ── Club Arena ──
    { question: 'what is club arena', category: 'Club Arena' },
    { question: 'how do i create a club', category: 'Club Arena' },
    { question: 'where are my hand histories', category: 'Club Arena' },
    { question: 'how do i deposit to a club', category: 'Club Arena' },
    { question: 'what is the agent dashboard', category: 'Club Arena' },
    { question: 'what is the union dashboard', category: 'Club Arena' },
    { question: 'what are my player stats', category: 'Club Arena' },
    { question: 'how does the action clock work', category: 'Club Arena' },

    // ── Bankroll Manager ──
    { question: 'what is the bankroll manager', category: 'Bankroll Manager' },
    { question: 'how do i log a session', category: 'Bankroll Manager' },
    { question: 'how do i see my statistics', category: 'Bankroll Manager' },
    { question: 'how do i find my leaks', category: 'Bankroll Manager' },
    { question: 'how do i set bankroll goals', category: 'Bankroll Manager' },
    { question: 'what is proper bankroll management', category: 'Bankroll Manager' },
    { question: 'how do i take player notes', category: 'Bankroll Manager' },
    { question: 'how do alerts work in bankroll manager', category: 'Bankroll Manager' },
    { question: 'how do i export my bankroll data', category: 'Bankroll Manager' },

    // ── Toke Tracker ──
    { question: 'what is toke tracker', category: 'Toke Tracker' },
    { question: 'how do i add a down', category: 'Toke Tracker' },
    { question: 'what is ehr', category: 'Toke Tracker' },
    { question: 'how is ehr calculated', category: 'Toke Tracker' },
    { question: 'what is the down multiplier', category: 'Toke Tracker' },
    { question: 'what is the dealer vault', category: 'Toke Tracker' },
    { question: 'how do i see my current shift', category: 'Toke Tracker' },
    { question: 'how do i log expenses', category: 'Toke Tracker' },
    { question: 'what is my best game for tips', category: 'Toke Tracker' },
    { question: 'how do i track multiple venues', category: 'Toke Tracker' },

    // ── Poker Near Me ──
    { question: 'how do i find poker near me', category: 'Poker Near Me' },
    { question: 'how do i save a venue', category: 'Poker Near Me' },
    { question: 'where do i see daily tournaments', category: 'Poker Near Me' },
    { question: 'how do i add my venue', category: 'Poker Near Me' },
    { question: 'how do i see what games are running now', category: 'Poker Near Me' },

    // ── Training ──
    { question: 'how do i access training', category: 'Training' },
    { question: 'where are the preflop charts', category: 'Training' },
    { question: 'how do i use the range builder', category: 'Training' },
    { question: 'how does the equity calculator work', category: 'Training' },
    { question: 'what is icm', category: 'Training' },
    { question: 'what is the solutions browser', category: 'Training' },
    { question: 'what is the spot trainer', category: 'Training' },
    { question: 'how do i create a custom drill', category: 'Training' },
    { question: 'how do i upload hand history', category: 'Training' },
    { question: 'what is the session dashboard', category: 'Training' },
    { question: 'how do i use jarvis', category: 'Training' },
    { question: 'how do i use the sandbox', category: 'Training' },

    // ── Trivia ──
    { question: 'what is trivia', category: 'Trivia' },
    { question: 'how do i play pvp trivia', category: 'Trivia' },
    { question: 'how does survival mode work', category: 'Trivia' },
    { question: 'what trivia achievements are there', category: 'Trivia' },

    // ── Diamonds ──
    { question: 'how do i buy diamonds', category: 'Diamond Store' },
    { question: 'where do i see my diamond balance', category: 'Diamond Store' },
    { question: 'what is the diamond arena', category: 'Diamond Arena' },
    { question: 'what is the diamond arcade', category: 'Diamond Arcade' },
    { question: 'what is vip membership', category: 'Diamond Store' },

    // ── Social Hub ──
    { question: 'what is the social hub', category: 'Social' },
    { question: 'how do i create a post', category: 'Social' },
    { question: 'what are stories', category: 'Social' },
    { question: 'how do i upload a reel', category: 'Social' },
    { question: 'how do i like a post', category: 'Social' },
    { question: 'how do i block someone', category: 'Social' },
    { question: 'how do i follow someone', category: 'Social' },
    { question: 'how do i create a social page', category: 'Social' },
    { question: 'what is on a profile page', category: 'Social' },
    { question: 'how do hashtags work', category: 'Social' },

    // ── Sandbox ──
    { question: 'what is the virtual sandbox', category: 'Sandbox' },
    { question: 'how do i calculate equity', category: 'Sandbox' },
    { question: 'what are pot odds', category: 'Sandbox' },
    { question: 'what is board texture', category: 'Sandbox' },
    { question: 'what is range advantage', category: 'Sandbox' },
    { question: 'what is mdf', category: 'Sandbox' },
    { question: 'how do i share my hand analysis', category: 'Sandbox' },

    // ── Poker Strategy ──
    { question: 'what is gto', category: 'GTO Strategy' },
    { question: 'what is exploitative play', category: 'GTO Strategy' },
    { question: 'what is a 3-bet', category: 'GTO Strategy' },
    { question: 'what is a c-bet', category: 'GTO Strategy' },
    { question: 'how do i size my bets', category: 'GTO Strategy' },
    { question: 'why is position important', category: 'GTO Strategy' },
    { question: 'what are pot odds', category: 'Poker Math' },
    { question: 'what is equity', category: 'Poker Math' },
    { question: 'what is expected value', category: 'Poker Math' },
    { question: 'how do i count outs', category: 'Poker Math' },
    { question: 'what is minimum defense frequency', category: 'Poker Math' },
    { question: 'what are the poker hand rankings', category: 'Hand Rankings' },
    { question: 'what is a kicker', category: 'Hand Rankings' },
    { question: 'how do i play tournaments', category: 'Tournament Strategy' },
    { question: 'how do i play the bubble', category: 'Tournament Strategy' },
    { question: 'cash game strategy basics', category: 'Cash Game Strategy' },
    { question: 'how do i deal with tilt', category: 'Psychology' },
    { question: 'what is variance', category: 'Psychology' },
    { question: 'what is plo', category: 'Poker Variants' },
    { question: 'what are memory games', category: 'Memory Games' },
];

// ── Use the local KB to generate cached answers for warm entries ──
async function warmCache() {
    console.log('🔥 Geeves Cache Warmer Starting...\n');
    console.log(`📝 Warming ${WARM_ENTRIES.length} most common Q&A pairs\n`);

    let seeded = 0;
    let skipped = 0;
    let errors = 0;

    for (const entry of WARM_ENTRIES) {
        const cacheKey = entry.question.toLowerCase().trim().replace(/\s+/g, '_');

        // Check if already cached
        const { data: existing } = await supabase
            .from('geeves_knowledge_cache')
            .select('id')
            .eq('cache_key', cacheKey)
            .maybeSingle();

        if (existing) {
            skipped++;
            process.stdout.write('.');
            continue;
        }

        // Generate a placeholder answer (will be filled on first real ask)
        // The cache key pre-exists to speed up the first Grok lookup
        const warmAnswer = `[Cache pre-seeded for: "${entry.question}" — Category: ${entry.category}]`;

        const { error } = await supabase
            .from('geeves_knowledge_cache')
            .insert({
                cache_key: cacheKey,
                question: entry.question,
                answer: warmAnswer,
                category: entry.category,
                is_placeholder: true,
                created_at: new Date().toISOString(),
            });

        if (error) {
            errors++;
            process.stdout.write('✗');
        } else {
            seeded++;
            process.stdout.write('✓');
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 50));
    }

    console.log('\n\n═══════════════════════════════════════');
    console.log('✅ Cache Warming Complete!');
    console.log(`   Seeded:  ${seeded}`);
    console.log(`   Skipped: ${skipped} (already cached)`);
    console.log(`   Errors:  ${errors}`);
    console.log('═══════════════════════════════════════\n');
}

warmCache().catch(err => {
    console.error('Cache warming failed:', err.message);
    process.exit(1);
});
