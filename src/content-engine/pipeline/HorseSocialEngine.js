/**
 * 🐴 HORSE SOCIAL ENGINE - Automated Social Interactions
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Makes Horses interact with each other autonomously:
 * - Friend requests (send, accept)
 * - Comments on each other's posts
 * - Likes on posts
 * - Responses to comments
 * 
 * Uses per-horse scheduling so each horse acts on its own unique time slot,
 * preventing all horses from acting simultaneously.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { shouldHorseBeActive, getHorseActivityRate, isHorseActiveHour, isHorseActiveHourTZ, applyWritingStyle } from './HorseScheduler.js';
config({ path: '../../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
// Use service role key for reliable writes, fall back to anon key
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTIC COMMENT TEMPLATES (100+ phrases)
// ═══════════════════════════════════════════════════════════════════════════
const COMMENT_TEMPLATES = {
    video: [
        // Fire reactions
        "insane", "this is SICK", "bro this hand is insane", "absolute madness",
        "ice cold", "legendary play", "unreal", "that was beautiful",

        // Strategic observations
        "need to study this spot more", "the read tho", "exploitative poker at its finest",
        "GTO says fold but soul says call", "this is a solved spot actually",
        "the sizing tells the story", "perfect bet sizing", "range advantage is real",

        // Personal reactions
        "this is why i love poker", "sending this to my home game group",
        "been watching this on repeat", "i would've folded pre tbh",
        "imagine being at that table", "the tank was so painful to watch",
        "studying this for my next session", "taking notes rn",

        // Player specific
        "mariano is built different", "airball is a menace fr", "garret is on another level",
        "wesley plays so aggro", "henry always finds a fold", "polk is a sicko",
        "dwan would've called here", "negreanu reads are insane",

        // Commentary
        "the commentary makes it 10x better", "bart's analysis is spot on",
        "love the hand breakdown", "this is textbook poker",

        // Hero calls/folds
        "hero call of the year", "discipline on display", "soul read fr",
        "he knew. HE KNEW.", "the read was too good", "heart of a champion"
    ],

    photo: [
        // Stack pics
        "nice hit", "stack looking good", "get that bread",
        "that's a nice tower", "love to see it", "congrats on the session!",
        "jeez thats a lot of chips", "rack em up!", "casino hates this guy",

        // Grind culture
        "grind never stops", "LFG", "lets gooo", "back at it",
        "the commitment is real", "outwork everyone", "session god",

        // Curiosity
        "what stakes?", "where is this?", "that bellagio?", "commerce?",
        "jealous of that action", "been there, feels good", "wish my games ran this good"
    ],

    bad_beat: [
        // Sympathy
        "brutal", "pain.", "been there way too many times", "variance is cruel",
        "you got coolered so hard", "thats poker unfortunately", "i felt that in my soul",
        "RIP bankroll", "F in chat", "happens to the best of us",

        // Dark humor
        "at least its not real money... wait", "poker is not a game of skill i guess",
        "dealer had other plans", "the deck hates you fr", "run bad is real",
        "one outer strikes again", "runner runner gods were angry",

        // Encouragement
        "recovery session incoming?", "bouncing back soon", "next session different",
        "variance evens out", "you played it right tho", "long run will be kind",
        "shake it off king/queen", "book says you won that pot"
    ],

    general: [
        "facts", "hundred percent", "this is the way", "couldn't agree more", "real talk",
        "same tbh", "underrated take", "big if true", "W post", "based",
        "fr fr", "no cap", "lowkey valid", "kinda true", "honest",
        "vibes", "true", "deadass", "literally me", "i felt this",
        "let's GOOO", "banger post", "needed this today", "saving this",
        "legendary content", "chef's kiss", "immaculate", "perfect"
    ],
    hcl: [
        "HCL never disappoints", "hustler games are different",
        "this is why HCL is the best stream", "RIP production budget",
        "dgaf about entertainment value", "peak HCL content"
    ],
    tournament: [
        "ICM nightmare", "bubble factor is wild", "chip leader mentality",
        "final table vibes", "bracelet or bust", "deep run loading",
        "satellite paid off", "field was tough", "that final table was stacked"
    ],
    plo: [
        "PLO is a different beast", "wrap city", "double suited for value",
        "thats so PLO", "aces cracked as usual", "runout was brutal",
        "running it twice saved him"
    ],
    // Phase 26: Keyword-based contextual comment categories
    cash_game: [
        "what stakes?", "cash game life", "reload button is dangerous",
        "session was wild", "grinding the live tables", "the action was insane tonight",
        "miss these stakes", "love a good cash session", "how deep were you?"
    ],
    bluff: [
        "absolute stone cold bluff", "that takes guts", "heart of a lion",
        "risky but respect it", "he had to fold there", "the balls on this guy",
        "bluff of the year candidate", "fearless at the table"
    ],
    river: [
        "river card always has something to say", "the river giveth and taketh",
        "classic one-outer", "river brings the drama every time",
        "that runout was disgusting", "nothing like a river card to ruin your day",
        "the river was a movie", "river rat strikes again"
    ],
    strategy: [
        "interesting line here", "the bet sizing tells a story",
        "think about this from a range perspective", "EV is king",
        "this is a textbook spot", "solver would approve",
        "the math checks out", "optimal play right there"
    ],
    session_report: [
        "solid session", "the grind pays off", "congrats on the win",
        "love seeing positive results", "keep stacking",
        "nice profit", "good to book a win", "the hours put in show"
    ],
    grind: [
        "grinder mentality", "respect the grind", "putting in volume",
        "every hand counts", "the work ethic is real",
        "outwork outgrind outplay", "this is what dedication looks like"
    ],
    wsop: [
        "WSOP dreams", "bracelet hunting season", "the Rio is calling",
        "one time for the bracelet", "main event vibes",
        "that WSOP energy is unmatched", "bracelet or nothing"
    ],
    variance: [
        "variance is a beast", "long run will sort it out",
        "standard deviation in action", "the swings are real",
        "trust the process", "keep playing your game", "sample size matters"
    ],
    bankroll: [
        "bankroll management is key", "protect the roll",
        "smart money management", "never risk more than you can afford",
        "the roll is healthy", "responsible grinding"
    ]
};

// Horse personality modifiers for comments
const PERSONALITY_MODIFIERS = {
    aggressive: ["fr fr", "no cap", "straight up", "period", "on god", "deadass"],
    chill: ["honestly", "ngl", "lowkey", "vibes", "kinda", "maybe"],
    analytical: ["mathematically", "from a GTO perspective", "if we think about ranges", "+EV move", "solver approved"],
    funny: ["haha", "lmaooo", "bro", "dead", "crying", "i cant"],
    supportive: ["king", "legend", "goated", "built different", "respect"],
    skeptical: ["idk about this one", "sus play ngl", "questionable", "risky but ok"]
};

// ═══════════════════════════════════════════════════════════════════════════
// ANTI-SPAM GUARD SYSTEM - Database backed for persistence
// ═══════════════════════════════════════════════════════════════════════════

// Daily limits per horse - prevent unrealistic spam
const DAILY_LIMITS = {
    likes: 50,        // Max 50 likes per day per horse
    comments: 15,     // Max 15 comments per day per horse  
    replies: 10,      // Max 10 replies per day per horse
    friend_requests: 5 // Max 5 friend requests per day per horse
};

// Cooldowns in milliseconds - minimum time between same interaction type
const COOLDOWNS = {
    like_same_post: 24 * 60 * 60 * 1000,  // Can't like same post twice in 24h
    comment_same_post: 6 * 60 * 60 * 1000, // Can't comment on same post twice in 6h
    reply_same_comment: 12 * 60 * 60 * 1000, // Can't reply to same comment twice in 12h
    like_same_author: 30 * 60 * 1000,  // Wait 30min before liking same author again
    comment_same_author: 2 * 60 * 60 * 1000, // Wait 2h before commenting on same author again
};

// Check if horse has hit daily limit
async function checkDailyLimit(horseProfileId, actionType) {
    const today = new Date().toISOString().split('T')[0];

    // Check different tables based on action type
    let count = 0;

    if (actionType === 'likes') {
        const { count: likeCount } = await supabase
            .from('social_likes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', horseProfileId)
            .gte('created_at', today);
        count = likeCount || 0;
    } else if (actionType === 'comments' || actionType === 'replies') {
        const { count: commentCount } = await supabase
            .from('social_comments')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', horseProfileId)
            .gte('created_at', today);
        count = commentCount || 0;
    } else if (actionType === 'friend_requests') {
        const { count: friendCount } = await supabase
            .from('friendships')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', horseProfileId)
            .gte('created_at', today);
        count = friendCount || 0;
    }

    const limit = DAILY_LIMITS[actionType] || 20;
    return count < limit;
}

// Check cooldown - has horse interacted with this target recently?
async function checkCooldown(horseProfileId, targetId, actionType) {
    let cooldownMs;
    let tableName;
    let targetColumn;

    if (actionType === 'like_post') {
        cooldownMs = COOLDOWNS.like_same_post;
        tableName = 'social_likes';
        targetColumn = 'post_id';
    } else if (actionType === 'comment_post') {
        cooldownMs = COOLDOWNS.comment_same_post;
        tableName = 'social_comments';
        targetColumn = 'post_id';
    } else if (actionType === 'reply_comment') {
        cooldownMs = COOLDOWNS.reply_same_comment;
        tableName = 'social_comments';
        targetColumn = 'parent_id';
    } else {
        return true; // No cooldown defined, allow
    }

    const cutoffTime = new Date(Date.now() - cooldownMs).toISOString();

    const { data } = await supabase
        .from(tableName)
        .select('id')
        .eq(targetColumn === 'post_id' ? (tableName === 'social_likes' ? 'post_id' : 'post_id') : 'parent_id', targetId)
        .eq(tableName === 'social_likes' ? 'user_id' : 'author_id', horseProfileId)
        .gte('created_at', cutoffTime)
        .limit(1);

    return !data || data.length === 0; // Return true if no recent interaction
}

// Get random delay for natural pacing (1-5 seconds)
function getRandomDelay() {
    return 1000 + Math.random() * 4000;
}

// Add randomness to skip some actions (makes behavior less robotic)
function shouldAct(probability = 0.7) {
    return Math.random() < probability;
}

// ═══════════════════════════════════════════════════════════════════════════
// FRIEND REQUEST ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send friend requests from horses to other horses AND real users
 */
async function sendFriendRequests(maxRequests = 10) {
    console.log('\n🤝 SENDING FRIEND REQUESTS...');

    // Get all horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses || horses.length < 2) return { sent: 0 };

    const horseIds = horses.map(h => h.profile_id);

    // Get real users (non-horse profiles) for horses to befriend
    const { data: realUsers } = await supabase
        .from('profiles')
        .select('id, username, full_name')
        .not('id', 'in', `(${horseIds.join(',')})`)
        .limit(50);

    // Combine potential targets: other horses + real users
    const allTargets = [
        ...horses.map(h => ({ profile_id: h.profile_id, name: h.name, isHorse: true })),
        ...(realUsers || []).map(u => ({ profile_id: u.id, name: u.full_name || u.username, isHorse: false }))
    ];

    let requestsSent = 0;

    // Each horse sends a few friend requests
    for (const horse of horses.slice(0, maxRequests * 2)) {
        // Pick a random target to befriend (prioritize real users 70% of time)
        const targetPool = Math.random() < 0.7
            ? allTargets.filter(t => !t.isHorse && t.profile_id !== horse.profile_id)
            : allTargets.filter(t => t.profile_id !== horse.profile_id);

        const target = targetPool[Math.floor(Math.random() * targetPool.length)];

        if (!target) continue;

        // Check if already friends or pending
        const { data: existing } = await supabase
            .from('friendships')
            .select('id')
            .or(`and(user_id.eq.${horse.profile_id},friend_id.eq.${target.profile_id}),and(user_id.eq.${target.profile_id},friend_id.eq.${horse.profile_id})`)
            .maybeSingle();

        if (existing) continue; // Already have relationship

        // Send friend request
        const { error } = await supabase
            .from('friendships')
            .insert({
                user_id: horse.profile_id,
                friend_id: target.profile_id,
                status: 'pending'
            });

        if (!error) {
            console.log(`   ${horse.name} → ${target.name} ${target.isHorse ? '🐴' : '👤'} ✓`);
            requestsSent++;

            if (requestsSent >= maxRequests) break;
        }

        await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    console.log(`   Sent: ${requestsSent} friend requests`);
    return { sent: requestsSent };
}

/**
 * Accept pending friend requests
 */
async function acceptFriendRequests(maxAccepts = 15) {
    console.log('\n✅ ACCEPTING FRIEND REQUESTS...');

    // Get all horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses) return { accepted: 0 };

    const horseIds = horses.map(h => h.profile_id);

    // Find pending requests TO horses
    const { data: pending } = await supabase
        .from('friendships')
        .select('id, user_id, friend_id')
        .eq('status', 'pending')
        .in('friend_id', horseIds)
        .limit(maxAccepts * 2);

    if (!pending?.length) {
        console.log('   No pending requests to accept');
        return { accepted: 0 };
    }

    let accepted = 0;

    for (const request of pending) {
        // Random chance to accept (80%)
        if (Math.random() < 0.8) {
            const { error } = await supabase
                .from('friendships')
                .update({ status: 'accepted' })
                .eq('id', request.id);

            if (!error) {
                const horse = horses.find(h => h.profile_id === request.friend_id);
                const sender = horses.find(h => h.profile_id === request.user_id);
                console.log(`   ${horse?.name || 'Horse'} accepted ${sender?.name || 'User'} ✓`);
                accepted++;

                if (accepted >= maxAccepts) break;
            }
        }

        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`   Accepted: ${accepted} requests`);
    return { accepted };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMENT ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function getRandomComment(type = 'general') {
    const templates = COMMENT_TEMPLATES[type] || COMMENT_TEMPLATES.general;
    return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Horses comment on posts from horses AND real users
 * Uses per-horse scheduling and writing styles
 */
async function commentOnPosts(maxComments = 20, includeRealUsers = true) {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();

    console.log(`\n💬 HORSES COMMENTING ON POSTS... (minute ${currentMinute})`);

    // Get all horses
    const { data: allHorses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, avatar_url, timezone')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!allHorses) return { commented: 0, activeHorses: 0 };

    // FILTER: Only horses in their active time slot
    const activeHorses = allHorses.filter(horse => {
        const isInSlot = shouldHorseBeActive(horse.profile_id, currentMinute, 2);
        const isActive = isHorseActiveHourTZ(horse.profile_id, currentHour, horse.timezone);
        return isInSlot && isActive;
    });

    console.log(`   Active horses this minute: ${activeHorses.length}/${allHorses.length}`);

    if (activeHorses.length === 0) {
        console.log('   No horses in their active slot this minute');
        return { commented: 0, activeHorses: 0 };
    }

    const horseIds = allHorses.map(h => h.profile_id);

    // Get recent posts
    let postsQuery = supabase
        .from('social_posts')
        .select('id, author_id, content_type, content')
        .order('created_at', { ascending: false })
        .limit(50);

    // Phase 12 - Inter-Bot Drama: Allow horses to also see all horse posts
    const { data: posts } = await postsQuery;

    if (!posts?.length) {
        console.log('   No posts to comment on');
        return { commented: 0, activeHorses: activeHorses.length };
    }

    let commented = 0;

    // Each ACTIVE horse may comment on some posts
    for (const horse of activeHorses) {
        // Check probability based on this horse's activity rate
        const activityRate = getHorseActivityRate(horse.profile_id, 'comment');
        if (Math.random() > activityRate) {
            console.log(`   ${horse.name} chose not to comment (rate: ${(activityRate * 100).toFixed(0)}%)`);
            continue;
        }

        // Pick a random post to comment on (not their own)
        const eligiblePosts = posts.filter(p => p.author_id !== horse.profile_id);
        const post = eligiblePosts[Math.floor(Math.random() * eligiblePosts.length)];

        if (!post) continue;

        // Check anti-spam cooldown
        const canComment = await checkCooldown(horse.profile_id, post.id, 'comment_post');
        if (!canComment) continue;

        // Check daily limit
        const withinLimit = await checkDailyLimit(horse.profile_id, 'comments');
        if (!withinLimit) continue;

        // Phase 26: Keyword-based contextual comment selection
        let commentType = 'general';
        const lc = (post.content || '').toLowerCase();
        if (post.content_type === 'video') commentType = 'video';
        else if (post.content_type === 'photo') commentType = 'photo';
        else if (lc.includes('beat') || lc.includes('suck') || lc.includes('cooler') || lc.includes('one-outer')) commentType = 'bad_beat';
        else if (lc.includes('wsop') || lc.includes('bracelet') || lc.includes('world series')) commentType = 'wsop';
        else if (lc.includes('tournament') || lc.includes('mtt') || lc.includes('final table') || lc.includes('bubble')) commentType = 'tournament';
        else if (lc.includes('plo') || lc.includes('omaha') || lc.includes('pot limit')) commentType = 'plo';
        else if (lc.includes('hcl') || lc.includes('hustler') || lc.includes('live at the bike')) commentType = 'hcl';
        else if (lc.includes('bluff') || lc.includes('fold') || lc.includes('hero call')) commentType = 'bluff';
        else if (lc.includes('river') || lc.includes('runout') || lc.includes('runner')) commentType = 'river';
        else if (lc.includes('session') || lc.includes('profit') || lc.includes('won') || lc.includes('cashed')) commentType = 'session_report';
        else if (lc.includes('cash game') || lc.includes('stakes') || lc.includes('1/2') || lc.includes('2/5') || lc.includes('5/10')) commentType = 'cash_game';
        else if (lc.includes('grind') || lc.includes('volume') || lc.includes('hours')) commentType = 'grind';
        else if (lc.includes('variance') || lc.includes('downswing') || lc.includes('upswing') || lc.includes('run bad')) commentType = 'variance';
        else if (lc.includes('bankroll') || lc.includes('roll') || lc.includes('moving up')) commentType = 'bankroll';
        else if (lc.includes('strategy') || lc.includes('gto') || lc.includes('solver') || lc.includes('range') || lc.includes('ev') || lc.includes('sizing')) commentType = 'strategy';

        // Get base comment and apply horse's unique writing style
        let comment = getRandomComment(commentType);
        comment = applyWritingStyle(comment, horse.profile_id);

        // 🟢 DYNAMIC TYPING INDICATOR (Phase 11)
        // Broadcast a typing payload to all connected clients viewing this post
        try {
            await supabase.channel('social-feed').send({
                type: 'broadcast',
                event: 'typing',
                payload: {
                    post_id: post.id,
                    user_id: horse.profile_id,
                    name: horse.name,
                    avatar_url: horse.avatar_url || null,
                    isTyping: true
                }
            });
            
            // Simulate human typing delay (3s - 8s based on comment length)
            const typingMs = Math.max(3000, Math.min(8000, comment.length * 100));
            console.log(`   [Live] ${horse.name} is typing on post ${post.id.substring(0,6)}... (${Math.round(typingMs/1000)}s)`);
            await new Promise(r => setTimeout(r, typingMs));
            
            // Send stop typing event
            await supabase.channel('social-feed').send({
                type: 'broadcast',
                event: 'typing',
                payload: { post_id: post.id, user_id: horse.profile_id, isTyping: false }
            });
        } catch (err) {
            console.warn(`   [Live] Failed to broadcast typing indicator for ${horse.name}`);
        }

        // Insert comment
        const { error } = await supabase
            .from('social_comments')
            .insert({
                post_id: post.id,
                author_id: horse.profile_id,
                content: comment
            });

        // Phase 28: @Mention — 15% chance to tag a horse friend
        if (!error && Math.random() < 0.15) {
            const otherHorses = allHorses.filter(h => h.profile_id !== horse.profile_id);
            if (otherHorses.length > 0) {
                const friend = otherHorses[Math.floor(Math.random() * otherHorses.length)];
                const { data: friendProfile } = await supabase
                    .from('profiles').select('username').eq('id', friend.profile_id).maybeSingle();
                if (friendProfile?.username) {
                    const mentionComment = `@${friendProfile.username} ${comment}`;
                    await supabase.from('social_comments').update({ content: mentionComment })
                        .eq('post_id', post.id).eq('author_id', horse.profile_id)
                        .eq('content', comment);
                    comment = mentionComment;
                    console.log(`   ${horse.name} tagged @${friendProfile.username}`);
                    
                    // Phase 28 Fix: Insert notification for the mentioned friend
                    await supabase.from('notifications').insert({
                        user_id: friend.profile_id,
                        actor_id: horse.profile_id,
                        type: 'mention',
                        reference_id: post.id,
                        message: `mentioned you in a comment`
                    });
                }
            }
        }

        if (!error) {
            const author = allHorses.find(h => h.profile_id === post.author_id);
            console.log(`   ${horse.name} → ${author?.name || 'User'}'s post: "${comment}"`);
            commented++;
            
            // Sync denormalized comment_count on social_posts (fire-and-forget)
            supabase.rpc('increment_post_count', { p_post_id: post.id, p_field: 'comment_count' }).catch(() => {
                supabase.from('social_posts').select('comment_count').eq('id', post.id).maybeSingle().then(({ data: p }) => {
                    if (p) supabase.from('social_posts').update({ comment_count: (p.comment_count || 0) + 1 }).eq('id', post.id);
                }).catch(() => {});
            });

            if (commented >= maxComments) break;
        }

        // Random delay between horses (3-10 seconds)
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 7000));
    }

    console.log(`   Posted: ${commented} comments from ${activeHorses.length} active horses`);
    return { commented, activeHorses: activeHorses.length };
}

/**
 * Horses like posts from horses AND real users
 * Now uses per-horse scheduling - each horse only acts during their unique time slot
 */
async function likePosts(maxLikes = 30, includeRealUsers = true) {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();

    console.log(`\n❤️ HORSES LIKING POSTS... (minute ${currentMinute})`);

    // Get all horses
    const { data: allHorses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, timezone')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!allHorses) return { liked: 0, activeHorses: 0 };

    // FILTER: Only horses whose time slot matches current minute (variance ±2)
    const activeHorses = allHorses.filter(horse => {
        const isInSlot = shouldHorseBeActive(horse.profile_id, currentMinute, 2);
        const isActive = isHorseActiveHourTZ(horse.profile_id, currentHour, horse.timezone);
        return isInSlot && isActive;
    });

    console.log(`   Active horses this minute: ${activeHorses.length}/${allHorses.length}`);

    if (activeHorses.length === 0) {
        console.log('   No horses in their active slot this minute');
        return { liked: 0, activeHorses: 0 };
    }

    const horseIds = allHorses.map(h => h.profile_id);

    // Get recent posts
    let postsQuery = supabase
        .from('social_posts')
        .select('id, author_id')
        .order('created_at', { ascending: false })
        .limit(100);

    // Phase 12 - Inter-Bot Drama: Allow horses to also like all horse posts
    const { data: posts } = await postsQuery;

    if (!posts?.length) return { liked: 0, activeHorses: activeHorses.length };

    let liked = 0;

    // Each ACTIVE horse may like some posts
    for (const horse of activeHorses) {
        // Check probability based on this horse's activity rate
        const activityRate = getHorseActivityRate(horse.profile_id, 'like');
        if (Math.random() > activityRate) {
            console.log(`   ${horse.name} chose not to engage (rate: ${(activityRate * 100).toFixed(0)}%)`);
            continue;
        }

        // Pick 1-3 random posts for this horse to like
        const numToLike = 1 + Math.floor(Math.random() * 3);
        const shuffledPosts = posts.filter(p => p.author_id !== horse.profile_id).sort(() => Math.random() - 0.5);

        for (let i = 0; i < numToLike && liked < maxLikes; i++) {
            const post = shuffledPosts[i];
            if (!post) break;

            // Check cooldown
            const canLike = await checkCooldown(horse.profile_id, post.id, 'like_post');
            if (!canLike) continue;

            // Check for existing like
            const { data: existing } = await supabase
                .from('social_likes')
                .select('id')
                .eq('post_id', post.id)
                .eq('user_id', horse.profile_id)
                .maybeSingle();

            if (existing) continue;

            // Phase 16: Pick a weighted reaction type
            const reactionRoll = Math.random();
            let reaction = 'like';
            if (reactionRoll > 0.90) reaction = 'wow';        // 10%
            else if (reactionRoll > 0.80) reaction = 'fire';  // 10%
            else if (reactionRoll > 0.65) reaction = 'haha';  // 15%
            else if (reactionRoll > 0.40) reaction = 'love';  // 25%
            // else: 'like' (40%)

            // Insert like with reaction type
            const { error } = await supabase
                .from('social_likes')
                .insert({
                    post_id: post.id,
                    user_id: horse.profile_id,
                    reaction_type: reaction
                });

            if (!error) {
                console.log(`   ${horse.name} liked a post ❤️`);
                liked++;
                
                // Sync denormalized like_count on social_posts (fire-and-forget)
                supabase.rpc('increment_post_count', { p_post_id: post.id, p_field: 'like_count' }).catch(() => {
                    supabase.from('social_posts').select('like_count').eq('id', post.id).maybeSingle().then(({ data: p }) => {
                        if (p) supabase.from('social_posts').update({ like_count: (p.like_count || 0) + 1 }).eq('id', post.id);
                    }).catch(() => {});
                });
            }
        }

        // Random delay between horses (2-8 seconds)
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 6000));
    }

    console.log(`   Liked: ${liked} posts from ${activeHorses.length} active horses`);
    return { liked, activeHorses: activeHorses.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// REPLY TO COMMENTS ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Horses reply to comments on posts (both horse and real user comments)
 * Uses per-horse scheduling and writing styles
 */
async function replyToComments(maxReplies = 15) {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();

    console.log(`\n💬 HORSES REPLYING TO COMMENTS... (minute ${currentMinute})`);

    // Get all horses
    const { data: allHorses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, voice, timezone')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!allHorses) return { replied: 0, activeHorses: 0 };

    // FILTER: Only horses in their active time slot
    const activeHorses = allHorses.filter(horse => {
        const isInSlot = shouldHorseBeActive(horse.profile_id, currentMinute, 2);
        const isActive = isHorseActiveHourTZ(horse.profile_id, currentHour, horse.timezone);
        return isInSlot && isActive;
    });

    console.log(`   Active horses this minute: ${activeHorses.length}/${allHorses.length}`);

    if (activeHorses.length === 0) {
        console.log('   No horses in their active slot this minute');
        return { replied: 0, activeHorses: 0 };
    }

    const horseIds = allHorses.map(h => h.profile_id);

    // Get recent comments
    const { data: comments } = await supabase
        .from('social_comments')
        .select('id, post_id, author_id, content, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

    if (!comments?.length) {
        console.log('   No comments to reply to');
        return { replied: 0, activeHorses: activeHorses.length };
    }

    let replied = 0;

    // Each ACTIVE horse may reply to comments
    for (const horse of activeHorses) {
        // Check probability
        const activityRate = getHorseActivityRate(horse.profile_id, 'reply');
        if (Math.random() > activityRate) {
            console.log(`   ${horse.name} chose not to reply (rate: ${(activityRate * 100).toFixed(0)}%)`);
            continue;
        }

        // Pick a comment to reply to (not their own)
        const eligibleComments = comments.filter(c =>
            c.author_id !== horse.profile_id &&
            // Reduce horse-to-horse reply spam
            (!horseIds.includes(c.author_id) || Math.random() < 0.3)
        );
        const comment = eligibleComments[Math.floor(Math.random() * eligibleComments.length)];

        if (!comment) continue;

        // Check cooldown
        const canReply = await checkCooldown(horse.profile_id, comment.id, 'reply_comment');
        if (!canReply) continue;

        // Check for existing reply
        const { data: existingReply } = await supabase
            .from('social_comments')
            .select('id')
            .eq('parent_id', comment.id)
            .eq('author_id', horse.profile_id)
            .maybeSingle();

        if (existingReply) continue;

        // Generate reply with horse's writing style
        let replyText = getRandomComment('general');

        // Sometimes reference the original comment
        if (Math.random() > 0.6) {
            const prefixes = ['fr tho', 'this ^^', '100% agree', 'exactly', 'real talk'];
            replyText = prefixes[Math.floor(Math.random() * prefixes.length)];
        }

        // Apply horse's unique writing style
        replyText = applyWritingStyle(replyText, horse.profile_id);

        // Insert reply
        const { error } = await supabase
            .from('social_comments')
            .insert({
                post_id: comment.post_id,
                author_id: horse.profile_id,
                content: replyText,
                parent_id: comment.id
            });

        if (!error) {
            console.log(`   ${horse.name} replied: "${replyText}"`);
            replied++;
            
            // Sync denormalized comment_count on social_posts (fire-and-forget)
            supabase.rpc('increment_post_count', { p_post_id: comment.post_id, p_field: 'comment_count' }).catch(() => {
                supabase.from('social_posts').select('comment_count').eq('id', comment.post_id).maybeSingle().then(({ data: p }) => {
                    if (p) supabase.from('social_posts').update({ comment_count: (p.comment_count || 0) + 1 }).eq('id', comment.post_id);
                }).catch(() => {});
            });

            if (replied >= maxReplies) break;
        }

        // Random delay between horses (3-8 seconds)
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
    }

    console.log(`   Replied: ${replied} times from ${activeHorses.length} active horses`);
    return { replied, activeHorses: activeHorses.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SOCIAL INTERACTION LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function runSocialInteractions(options = {}) {
    console.log('\n🐴🐴🐴 HORSE SOCIAL ENGINE 🐴🐴🐴');
    console.log('═'.repeat(60));

    const {
        includeFriends = true,
        includeComments = true,
        includeLikes = true,
        includeReplies = true,
        includeCommentReactions = true,
        includeRealUsers = true
    } = options;

    try {
        const results = { success: true };

        // 1. Send friend requests
        if (includeFriends) {
            const friendResults = await sendFriendRequests(10);
            const acceptResults = await acceptFriendRequests(15);
            results.friendsSent = friendResults.sent;
            results.friendsAccepted = acceptResults.accepted;
        }

        // 2. Comment on posts
        if (includeComments) {
            const commentResults = await commentOnPosts(20, includeRealUsers);
            results.commented = commentResults.commented;
        }

        // 3. Like posts
        if (includeLikes) {
            const likeResults = await likePosts(30, includeRealUsers);
            results.liked = likeResults.liked;
        }

        // 4. Reply to comments
        if (includeReplies) {
            const replyResults = await replyToComments(15);
            results.replied = replyResults.replied;
        }

        // 5. React to comments (Phase 27)
        if (includeCommentReactions) {
            const reactResults = await reactToComments(15);
            results.commentReactions = reactResults.reacted;
        }

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 SOCIAL INTERACTION SUMMARY');
        console.log('═'.repeat(60));
        console.log(`   Friend Requests Sent: ${results.friendsSent || 0}`);
        console.log(`   Friend Requests Accepted: ${results.friendsAccepted || 0}`);
        console.log(`   Comments Posted: ${results.commented || 0}`);
        console.log(`   Posts Liked: ${results.liked || 0}`);
        console.log(`   Comment Replies: ${results.replied || 0}`);
        console.log(`   Comment Reactions: ${results.commentReactions || 0}`);
        console.log('\n🎉 Horses are socializing!');

        return results;

    } catch (error) {
        console.error('Social engine error:', error.message);
        return { success: false, error: error.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 27: HORSE-TO-HORSE COMMENT REACTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function reactToComments(maxReactions = 15) {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();

    console.log(`\n🔥 HORSES REACTING TO COMMENTS... (minute ${currentMinute})`);

    const { data: allHorses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, timezone')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!allHorses) return { reacted: 0 };

    const activeHorses = allHorses.filter(horse => {
        const isInSlot = shouldHorseBeActive(horse.profile_id, currentMinute, 2);
        const isActive = isHorseActiveHourTZ(horse.profile_id, currentHour, horse.timezone);
        return isInSlot && isActive;
    });

    if (activeHorses.length === 0) return { reacted: 0 };

    const horseIds = allHorses.map(h => h.profile_id);

    // Get recent comments from other horses
    const { data: recentComments } = await supabase
        .from('social_comments')
        .select('id, author_id')
        .in('author_id', horseIds)
        .order('created_at', { ascending: false })
        .limit(50);

    if (!recentComments?.length) return { reacted: 0 };

    let reacted = 0;

    for (const horse of activeHorses) {
        if (Math.random() > 0.3) continue; // 30% chance to react

        const eligibleComments = recentComments.filter(c => c.author_id !== horse.profile_id);
        if (eligibleComments.length === 0) continue;

        const comment = eligibleComments[Math.floor(Math.random() * eligibleComments.length)];

        // Weighted reaction type
        const roll = Math.random();
        let reaction = 'like';
        if (roll > 0.85) reaction = 'wow';
        else if (roll > 0.70) reaction = 'fire';
        else if (roll > 0.50) reaction = 'haha';
        else if (roll > 0.30) reaction = 'love';

        const { error } = await supabase
            .from('social_comment_likes')
            .upsert({
                comment_id: comment.id,
                user_id: horse.profile_id,
                reaction_type: reaction
            }, { onConflict: 'comment_id,user_id' });

        if (!error) {
            reacted++;
            console.log(`   ${horse.name} reacted ${reaction} to a comment`);
        }

        if (reacted >= maxReactions) break;
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`   Reacted to ${reacted} comments`);
    return { reacted };
}

// Run if called directly
if (typeof window === 'undefined' && process.argv[1]?.includes('HorseSocialEngine')) {
    runSocialInteractions();
}

export {
    runSocialInteractions,
    sendFriendRequests,
    acceptFriendRequests,
    commentOnPosts,
    likePosts,
    replyToComments,
    reactToComments
};
