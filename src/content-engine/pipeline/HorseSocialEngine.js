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
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTIC COMMENT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════
const COMMENT_TEMPLATES = {
    video: [
        "🔥🔥🔥",
        "this is SICK",
        "bro this hand is insane",
        "need to study this spot more",
        "the read tho 👀",
        "ice cold",
        "legendary play",
        "GTO says fold but soul says call 😂",
        "this is why i love poker",
        "sending this to my home game group",
        "been watching this on repeat",
        "mariano is built different",
        "airball is a menace fr",
        "imagine being at that table",
        "the commentary makes it 10x better",
        "i would've folded pre tbh",
        "hero call of the year",
        "the tank was so painful to watch",
        "exploitative poker at its finest",
        "studying this for my next session"
    ],
    photo: [
        "nice hit! 🔥",
        "congrats on the session!",
        "love to see it",
        "stack looking good",
        "get that bread 🍞",
        "grind never stops",
        "LFG 💪",
        "been there, feels good",
        "jealous of that action",
        "what stakes?"
    ],
    bad_beat: [
        "brutal 💀",
        "pain.",
        "been there way too many times",
        "variance is cruel",
        "you got coolered so hard",
        "thats poker unfortunately",
        "i felt that in my soul",
        "recovery session incoming?",
        "bouncing back soon 🙏",
        "at least its not real money... wait"
    ],
    general: [
        "facts",
        "💯",
        "this is the way",
        "couldn't agree more",
        "real talk",
        "same tbh",
        "underrated take",
        "big if true",
        "W post",
        "based"
    ]
};

// Horse personality modifiers for comments
const PERSONALITY_MODIFIERS = {
    aggressive: ["fr fr", "no cap", "straight up", "period"],
    chill: ["honestly", "ngl", "lowkey", "vibes"],
    analytical: ["mathematically", "from a GTO perspective", "if we think about ranges"],
    funny: ["😂", "lmaooo", "bro", "dead 💀"]
};

// ═══════════════════════════════════════════════════════════════════════════
// HORSE BUS - Coordinates horse interactions
// ═══════════════════════════════════════════════════════════════════════════
class HorseBus {
    constructor() {
        this.recentInteractions = new Map(); // Track recent interactions
    }

    // Check if a horse recently interacted with another
    hasRecentInteraction(horseId, targetId, type, windowMs = 3600000) {
        const key = `${horseId}:${targetId}:${type}`;
        const lastTime = this.recentInteractions.get(key);
        if (lastTime && Date.now() - lastTime < windowMs) {
            return true;
        }
        return false;
    }

    // Record an interaction
    recordInteraction(horseId, targetId, type) {
        const key = `${horseId}:${targetId}:${type}`;
        this.recentInteractions.set(key, Date.now());
    }
}

const horseBus = new HorseBus();

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
            horseBus.recordInteraction(horse.profile_id, target.profile_id, 'friend_request');

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
 * Horses comment on recent posts
 */
async function commentOnPosts(maxComments = 20) {
    console.log('\n💬 HORSES COMMENTING ON POSTS...');

    // Get all horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses) return { commented: 0 };

    const horseIds = horses.map(h => h.profile_id);

    // Get recent posts from horses
    const { data: posts } = await supabase
        .from('social_posts')
        .select('id, author_id, content_type, content')
        .in('author_id', horseIds)
        .order('created_at', { ascending: false })
        .limit(50);

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

        // Check if already commented
        if (horseBus.hasRecentInteraction(commenter.profile_id, post.id, 'comment')) {
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
            horseBus.recordInteraction(commenter.profile_id, post.id, 'comment');
            commented++;

            if (commented >= maxComments) break;
        }

        await new Promise(r => setTimeout(r, 800)); // Natural pace
    }

    console.log(`   Posted: ${commented} comments`);
    return { commented };
}

/**
 * Horses like each other's posts
 */
async function likePosts(maxLikes = 30) {
    console.log('\n❤️ HORSES LIKING POSTS...');

    // Get all horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses) return { liked: 0 };

    const horseIds = horses.map(h => h.profile_id);

    // Get recent posts
    const { data: posts } = await supabase
        .from('social_posts')
        .select('id, author_id')
        .in('author_id', horseIds)
        .order('created_at', { ascending: false })
        .limit(100);

    if (!posts?.length) return { liked: 0 };

    let liked = 0;

    for (const post of posts) {
        // Pick random horses to like (not the author)
        const likers = horses.filter(h => h.profile_id !== post.author_id);
        const numLikers = 1 + Math.floor(Math.random() * 3); // 1-3 likers

        for (let i = 0; i < numLikers && liked < maxLikes; i++) {
            const liker = likers[Math.floor(Math.random() * likers.length)];
            if (!liker) continue;

            if (horseBus.hasRecentInteraction(liker.profile_id, post.id, 'like')) {
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
                horseBus.recordInteraction(liker.profile_id, post.id, 'like');
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
// MAIN SOCIAL INTERACTION LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function runSocialInteractions() {
    console.log('\n🐴🐴🐴 HORSE SOCIAL ENGINE 🐴🐴🐴');
    console.log('═'.repeat(60));

    try {
        // 1. Send friend requests
        const friendResults = await sendFriendRequests(10);

        // 2. Accept pending friend requests
        const acceptResults = await acceptFriendRequests(15);

        // 3. Comment on posts
        const commentResults = await commentOnPosts(20);

        // 4. Like posts
        const likeResults = await likePosts(30);

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 SOCIAL INTERACTION SUMMARY');
        console.log('═'.repeat(60));
        console.log(`   Friend Requests Sent: ${friendResults.sent}`);
        console.log(`   Friend Requests Accepted: ${acceptResults.accepted}`);
        console.log(`   Comments Posted: ${commentResults.commented}`);
        console.log(`   Posts Liked: ${likeResults.liked}`);
        console.log('\n🎉 Horses are socializing!');

        return {
            success: true,
            ...friendResults,
            ...acceptResults,
            ...commentResults,
            ...likeResults
        };

    } catch (error) {
        console.error('Social engine error:', error.message);
        return { success: false, error: error.message };
    }
}

// Run if called directly
runSocialInteractions();

export { runSocialInteractions, sendFriendRequests, acceptFriendRequests, commentOnPosts, likePosts };
