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
 * Uses the Horse Bus to coordinate behavior and avoid duplicate interactions
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
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
        "🔥🔥🔥", "this is SICK", "bro this hand is insane", "absolute madness",
        "ice cold", "legendary play", "unreal", "that was beautiful",

        // Strategic observations
        "need to study this spot more", "the read tho 👀", "exploitative poker at its finest",
        "GTO says fold but soul says call 😂", "this is a solved spot actually",
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
        "nice hit! 🔥", "stack looking good 💰", "get that bread 🍞",
        "that's a nice tower", "love to see it", "congrats on the session!",
        "jeez thats a lot of chips", "rack em up!", "casino hates this guy",

        // Grind culture
        "grind never stops", "LFG 💪", "lets gooo", "back at it 💯",
        "the commitment is real", "outwork everyone", "session god",

        // Curiosity
        "what stakes?", "where is this?", "that bellagio?", "commerce?",
        "jealous of that action", "been there, feels good", "wish my games ran this good"
    ],

    bad_beat: [
        // Sympathy
        "brutal 💀", "pain.", "been there way too many times", "variance is cruel",
        "you got coolered so hard", "thats poker unfortunately", "i felt that in my soul",
        "RIP bankroll", "F in chat", "happens to the best of us",

        // Dark humor
        "at least its not real money... wait", "poker is not a game of skill i guess",
        "dealer had other plans", "the deck hates you fr", "run bad is real",
        "one outer strikes again", "runner runner gods were angry",

        // Encouragement
        "recovery session incoming?", "bouncing back soon 🙏", "next session different",
        "variance evens out", "you played it right tho", "long run will be kind",
        "shake it off king/queen", "book says you won that pot"
    ],

    general: [
        // Agreement
        "facts", "💯", "this is the way", "couldn't agree more", "real talk",
        "same tbh", "underrated take", "big if true", "W post", "based",

        // Casual
        "fr fr", "no cap", "lowkey valid", "kinda true", "honest",
        "vibes", "true", "deadass", "literally me", "i felt this",

        // Hype
        "let's GOOO", "banger post", "needed this today", "saving this",
        "legendary content", "chef's kiss", "immaculate", "perfect"
    ],

    // HCL specific
    hcl: [
        "HCL never disappoints", "hustler games are different",
        "this is why HCL is the best stream", "RIP production budget",
        "dgaf about entertainment value", "peak HCL content"
    ],

    // Tournament specific
    tournament: [
        "ICM nightmare", "bubble factor is wild", "chip leader mentality",
        "final table vibes", "bracelet or bust", "deep run loading",
        "satellite paid off", "field was tough"
    ],

    // PLO specific  
    plo: [
        "PLO is a different beast", "wrap city", "double suited for value",
        "thats so PLO", "aces cracked as usual", "runout was brutal",
        "running it twice saved him"
    ]
};

// Horse personality modifiers for comments
const PERSONALITY_MODIFIERS = {
    aggressive: ["fr fr", "no cap", "straight up", "period", "on god", "deadass"],
    chill: ["honestly", "ngl", "lowkey", "vibes", "kinda", "maybe"],
    analytical: ["mathematically", "from a GTO perspective", "if we think about ranges", "+EV move", "solver approved"],
    funny: ["😂", "lmaooo", "bro", "dead 💀", "crying", "i cant 😭"],
    supportive: ["king 👑", "legend", "goated", "built different", "respect"],
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
 * Send friend requests from horses to other horses
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

    let requestsSent = 0;

    // Each horse sends a few friend requests
    for (const horse of horses.slice(0, maxRequests * 2)) {
        // Pick a random other horse to befriend
        const otherHorses = horses.filter(h => h.profile_id !== horse.profile_id);
        const target = otherHorses[Math.floor(Math.random() * otherHorses.length)];

        if (!target) continue;

        // Check if already friends or pending
        const { data: existing } = await supabase
            .from('friendships')
            .select('id')
            .or(`and(user_id.eq.${horse.profile_id},friend_id.eq.${target.profile_id}),and(user_id.eq.${target.profile_id},friend_id.eq.${horse.profile_id})`)
            .single();

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
            console.log(`   ${horse.name} → ${target.name} ✓`);
            requestsSent++;
            // Removed horseBus - using DB anti-spam checks instead

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
 */
async function commentOnPosts(maxComments = 20, includeRealUsers = true) {
    console.log('\n💬 HORSES COMMENTING ON POSTS...');

    // Get all horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses) return { commented: 0 };

    const horseIds = horses.map(h => h.profile_id);

    // Get recent posts - ALL posts, not just horse posts
    let postsQuery = supabase
        .from('social_posts')
        .select('id, author_id, content_type, content')
        .order('created_at', { ascending: false })
        .limit(50);

    // If not including real users, filter to just horse posts
    if (!includeRealUsers) {
        postsQuery = postsQuery.in('author_id', horseIds);
    }

    const { data: posts } = await postsQuery;

    if (!posts?.length) {
        console.log('   No posts to comment on');
        return { commented: 0 };
    }

    let commented = 0;

    for (const post of posts) {
        // Pick a random horse to comment (not the author)
        const commenters = horses.filter(h => h.profile_id !== post.author_id);
        const commenter = commenters[Math.floor(Math.random() * commenters.length)];

        if (!commenter) continue;

        // Check anti-spam cooldown
        const canComment = await checkCooldown(commenter.profile_id, post.id, 'comment_post');
        if (!canComment) {
            continue;
        }

        // Check daily limit
        const withinLimit = await checkDailyLimit(commenter.profile_id, 'comments');
        if (!withinLimit) {
            continue;
        }

        // Get appropriate comment type
        let commentType = 'general';
        if (post.content_type === 'video') commentType = 'video';
        else if (post.content_type === 'photo') commentType = 'photo';
        else if (post.content?.toLowerCase().includes('beat') || post.content?.toLowerCase().includes('suck')) {
            commentType = 'bad_beat';
        }

        const comment = getRandomComment(commentType);

        // Insert comment
        const { error } = await supabase
            .from('social_comments')
            .insert({
                post_id: post.id,
                author_id: commenter.profile_id,
                content: comment
            });

        if (!error) {
            const author = horses.find(h => h.profile_id === post.author_id);
            console.log(`   ${commenter.name} → ${author?.name}'s post: "${comment}"`);
            commented++;

            if (commented >= maxComments) break;
        }

        await new Promise(r => setTimeout(r, getRandomDelay())); // Natural pace
    }

    console.log(`   Posted: ${commented} comments`);
    return { commented };
}

/**
 * Horses like posts from horses AND real users
 */
async function likePosts(maxLikes = 30, includeRealUsers = true) {
    console.log('\n❤️ HORSES LIKING POSTS...');

    // Get all horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses) return { liked: 0 };

    const horseIds = horses.map(h => h.profile_id);

    // Get recent posts - ALL posts, not just horse posts
    let postsQuery = supabase
        .from('social_posts')
        .select('id, author_id')
        .order('created_at', { ascending: false })
        .limit(100);

    // If not including real users, filter to just horse posts
    if (!includeRealUsers) {
        postsQuery = postsQuery.in('author_id', horseIds);
    }

    const { data: posts } = await postsQuery;

    if (!posts?.length) return { liked: 0 };

    let liked = 0;

    for (const post of posts) {
        // Pick random horses to like (not the author)
        const likers = horses.filter(h => h.profile_id !== post.author_id);
        const numLikers = 1 + Math.floor(Math.random() * 3); // 1-3 likers

        for (let i = 0; i < numLikers && liked < maxLikes; i++) {
            const liker = likers[Math.floor(Math.random() * likers.length)];
            if (!liker) continue;

            // Check anti-spam cooldown
            const canLike = await checkCooldown(liker.profile_id, post.id, 'like_post');
            if (!canLike) {
                continue;
            }

            // Check for existing like
            const { data: existing } = await supabase
                .from('social_likes')
                .select('id')
                .eq('post_id', post.id)
                .eq('user_id', liker.profile_id)
                .single();

            if (existing) continue;

            // Insert like
            const { error } = await supabase
                .from('social_likes')
                .insert({
                    post_id: post.id,
                    user_id: liker.profile_id
                });

            if (!error) {
                // No need to record - DB query handles dedup
                liked++;
            }
        }

        if (liked >= maxLikes) break;
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`   Liked: ${liked} posts`);
    return { liked };
}

// ═══════════════════════════════════════════════════════════════════════════
// REPLY TO COMMENTS ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Horses reply to comments on posts (both horse and real user comments)
 */
async function replyToComments(maxReplies = 15) {
    console.log('\n💬 HORSES REPLYING TO COMMENTS...');

    // Get all horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, voice')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses) return { replied: 0 };

    const horseIds = horses.map(h => h.profile_id);

    // Get recent comments (not from horses) that haven't been replied to
    const { data: comments } = await supabase
        .from('social_comments')
        .select('id, post_id, author_id, content, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

    if (!comments?.length) {
        console.log('   No comments to reply to');
        return { replied: 0 };
    }

    let replied = 0;

    for (const comment of comments) {
        // Skip if comment is from a horse (reduce horse-to-horse reply spam)
        if (horseIds.includes(comment.author_id) && Math.random() > 0.3) {
            continue;
        }

        // Pick a random horse to reply
        const replier = horses[Math.floor(Math.random() * horses.length)];
        if (!replier) continue;

        // Don't reply to own comments
        if (replier.profile_id === comment.author_id) continue;

        // Check if already replied recently
        // Check anti-spam cooldown
        const canReply = await checkCooldown(replier.profile_id, comment.id, 'reply_comment');
        if (!canReply) {
            continue;
        }

        // Check if this horse already replied to this comment
        const { data: existingReply } = await supabase
            .from('social_comments')
            .select('id')
            .eq('parent_id', comment.id)
            .eq('author_id', replier.profile_id)
            .single();

        if (existingReply) continue;

        // Generate reply based on original comment content
        let replyText = getRandomComment('general');

        // Sometimes reference the original comment
        if (Math.random() > 0.6) {
            const prefixes = ['fr 👆', 'this ^^', '100% agree', 'exactly', 'real talk'];
            replyText = prefixes[Math.floor(Math.random() * prefixes.length)];
        }

        // Get post_id for the reply
        const { error } = await supabase
            .from('social_comments')
            .insert({
                post_id: comment.post_id,
                author_id: replier.profile_id,
                content: replyText,
                parent_id: comment.id
            });

        if (!error) {
            console.log(`   ${replier.name} replied: "${replyText}"`);
            // No need to record - DB query handles dedup
            replied++;

            if (replied >= maxReplies) break;
        }

        await new Promise(r => setTimeout(r, 600)); // Natural pace
    }

    console.log(`   Replied: ${replied} times`);
    return { replied };
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

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 SOCIAL INTERACTION SUMMARY');
        console.log('═'.repeat(60));
        console.log(`   Friend Requests Sent: ${results.friendsSent || 0}`);
        console.log(`   Friend Requests Accepted: ${results.friendsAccepted || 0}`);
        console.log(`   Comments Posted: ${results.commented || 0}`);
        console.log(`   Posts Liked: ${results.liked || 0}`);
        console.log(`   Comment Replies: ${results.replied || 0}`);
        console.log('\n🎉 Horses are socializing!');

        return results;

    } catch (error) {
        console.error('Social engine error:', error.message);
        return { success: false, error: error.message };
    }
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
    replyToComments
};
