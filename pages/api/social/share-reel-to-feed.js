/**
 * POST /api/social/share-reel-to-feed
 * Server-side handler to share a reel to the user's social feed.
 * Uses service-role to bypass RLS and handles trigger errors gracefully.
 *
 * Body: { reel_id, user_description }
 *
 * Reel media, caption, topic, rights, and availability are always read from
 * the authoritative public Reel reader. Caller-supplied media is ignored.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { buildReelPath } from '../../../src/lib/reelsFeedClient';
import { readPublicReelById } from '../../../src/lib/server/reelsFeed';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findExistingShare({ userId, publicationKey, reelLinks }) {
    const { data: keyedShare, error: keyedError } = await supabase
        .from('social_posts')
        .select('id')
        .eq('author_id', userId)
        .eq('metadata->>publication_key', publicationKey)
        .limit(1);

    if (keyedError) throw keyedError;
    if (keyedShare?.[0]?.id) return keyedShare[0];

    const { data: linkedShare, error: linkedError } = await supabase
        .from('social_posts')
        .select('id')
        .eq('author_id', userId)
        .in('link_url', reelLinks)
        .limit(1);

    if (linkedError) throw linkedError;
    return linkedShare?.[0] || null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // Destructure inside the try - see share-to-feed.js. An unparseable body
        // threw outside every handler and surfaced as a 500, not a 400.
        const { reel_id, user_description } = req.body || {};
        const requestedReelId = String(reel_id || '').trim();
        if (!UUID_RE.test(requestedReelId)) {
            return res.status(400).json({ error: 'Valid reel_id required' });
        }

        const reelResult = await readPublicReelById({
            client: supabase,
            id: requestedReelId,
            category: 'for-you',
        });
        const reel = reelResult.data;
        if (!reel) {
            return res.status(404).json({ error: 'Reel not found or unavailable' });
        }

        const reelLink = `https://smarter.poker${buildReelPath(reel)}`;
        const legacyReelLink = `https://smarter.poker/hub/reels?id=${encodeURIComponent(reel.id)}`;
        const publicationKey = `reel-share:${user.id}:${reel.id}`;
        const reelLinks = [reelLink, legacyReelLink];

        // Treat category-aware and legacy links as one share identity. This
        // prevents an old bookmark from creating a second post for the same
        // canonical Reel after category-safe links ship. The metadata key is
        // protected by a production unique index, so simultaneous requests
        // converge on one post instead of racing through this read.
        const existing = await findExistingShare({
            userId: user.id,
            publicationKey,
            reelLinks,
        });

        if (existing) {
            return res.json({ success: true, already_shared: true, postId: existing.id });
        }

        // Build content: user description first, then original caption
        const parts = [];
        const userDescription = typeof user_description === 'string'
            ? user_description.trim().slice(0, 500)
            : '';
        if (userDescription) parts.push(userDescription);
        if (reel.caption?.trim()) parts.push(reel.caption.trim());
        const postContent = parts.join('\n\n') || 'Shared A Reel';

        const { data: post, error } = await supabase.from('social_posts').insert({
            author_id: user.id,
            content: postContent,
            // This is a reference to the canonical Reel, not a new video
            // upload. Keeping the playable URL out of media_urls prevents the
            // video-post mirror trigger from creating an incorrectly authored
            // duplicate social_reels row for the person sharing it.
            content_type: 'link',
            media_urls: [],
            visibility: 'public',
            link_url: reelLink,
            link_title: reel.caption?.trim().slice(0, 180) || 'Smarter.Poker Reel',
            link_description: 'Watch This Reel On Smarter.Poker',
            link_image: reel.thumbnail_url || null,
            link_site_name: 'Smarter.Poker Reels',
            metadata: {
                publication_key: publicationKey,
                shared_reel_id: reel.id,
                shared_reel_topic: reel.topic,
                // The authoritative detail reader returns the normalized
                // source_name; list readers add channel_name later when they
                // attach profiles. Preserve either shape without replacing a
                // real third-party source with a Smarter.Poker fallback.
                shared_reel_channel_name: reel.source_name || reel.channel_name || null,
            },
        }).select('id').maybeSingle();

        if (error) {
            console.warn('[share-reel-to-feed] Insert error:', error.message);
            // A 23505 is the expected loser of a simultaneous-share race. A
            // trigger may also report an error after the row committed. In
            // both cases, read back the one durable identity before failing.
            if (error.code === '23505' || error.message?.includes('trigger procedure')) {
                const recovered = await findExistingShare({
                    userId: user.id,
                    publicationKey,
                    reelLinks,
                });
                if (recovered) {
                    return res.json({
                        success: true,
                        already_shared: true,
                        postId: recovered.id,
                        ...(error.message?.includes('trigger procedure')
                            ? { trigger_warning: true }
                            : {}),
                    });
                }
            }
            return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true, postId: post?.id });
    } catch (err) {
        console.warn('[share-reel-to-feed] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
