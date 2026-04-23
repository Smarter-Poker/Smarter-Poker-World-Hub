// HORSES SOCIAL ALL-IN-ONE CRON
// Consolidated endpoint: runs likes, comments, and replies in sequence.
// Replaces 3 separate crons (likes every 10min, comments every 7min, replies every 8min)
// Current schedule: every 2 hours — 12 runs/day
// (was every 15 min but caused consistent 60s Vercel timeout failures)
//
// FIX (2026-03-29): Reduced batch sizes + added 55s hard deadline to prevent
// timeout failures. Typing indicators and sleep timers accumulated to 70-100s,
// exceeding the 60s Vercel serverless limit.

import { likePosts, commentOnPosts, replyToComments } from '../../../src/content-engine/pipeline/HorseSocialEngine.js';
import { processDirectMessages } from '../../../src/content-engine/pipeline/HorseMessengerEngine.js';
import { reportApiError } from '../../../src/lib/sentryWrap';

export const config = {
    maxDuration: 60,
};

// Race a task against a deadline. Returns result or null on timeout.
async function withDeadline(fn, deadlineMs, label) {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 2000) {
        console.warn(`   [DEADLINE] Skipping ${label} — only ${Math.round(remaining / 1000)}s left`);
        return null;
    }
    try {
        return await Promise.race([
            fn(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`${label} hit deadline`)), remaining - 1000)
            )
        ]);
    } catch (err) {
        console.warn(`   [DEADLINE] ${label}: ${err.message}`);
        return null;
    }
}

export default async function handler(req, res) {
    // Security: validate cron secret for external callers
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
        // Also allow Vercel's built-in cron auth
        if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    // Hard deadline: finish all work within 55s to leave headroom for the 60s max
    const deadline = Date.now() + 55_000;
    const results = { liked: 0, commented: 0, replied: 0, dm: 0, skipped: [] };

    // Step 1: Likes (reduced batch: 8 instead of 15)
    const likeResult = await withDeadline(
        () => likePosts(8, true), deadline, 'likes'
    );
    results.liked = likeResult?.liked || 0;
    if (!likeResult) results.skipped.push('likes');

    // Step 2: Comments (reduced batch: 5 instead of 10)
    const commentResult = await withDeadline(
        () => commentOnPosts(5, true), deadline, 'comments'
    );
    results.commented = commentResult?.commented || 0;
    if (!commentResult) results.skipped.push('comments');

    // Step 3: Replies (reduced batch: 5 instead of 10)
    const replyResult = await withDeadline(
        () => replyToComments(5), deadline, 'replies'
    );
    results.replied = replyResult?.replied || 0;
    if (!replyResult) results.skipped.push('replies');

    // Step 4: Grok Direct Messages (only if >8s left)
    const dmResult = await withDeadline(
        () => processDirectMessages(), deadline, 'DMs'
    );
    if (!dmResult) results.skipped.push('DMs');

    // Always return 200 — partial progress is fine for cron jobs
    return res.status(200).json({
        success: true,
        ...results,
        timestamp: new Date().toISOString()
    });
}
