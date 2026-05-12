/**
 * BUG 12 + BUG 16 FIX — pages/api/live/start-stream.js
 * This file replaces the existing pages/api/live/start-stream.js.
 *
 * BUG 12: Live feed post appears ~1 min after stream starts (should be instant).
 *   CAUSE: Feed post is created by a cron job running every ~60s, not inline.
 *          OR: The social_posts insert exists but live_streams.feed_post_id is
 *          never set, so Realtime clients miss it until polling fires.
 *   FIX:   Insert social_posts record synchronously inside this handler, then
 *          immediately set live_streams.feed_post_id so Realtime subscribers
 *          see the post the instant the stream starts.
 *
 * BUG 16: Live stream post shows user's alias instead of real display name.
 *   CAUSE: Content string built from user.user_metadata (alias/handle) instead
 *          of profiles.full_name (display name).
 *   FIX:   Fetch profiles.full_name first; fall back to profiles.username only
 *          if full_name is null.
 */

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!applyRateLimit(req, res, LIMITS.write)) return;

  const { user } = await getServerUserWithFallback(req, supabase);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { title, thumbnail_url } = req.body || {};

  try {
    // ── BUG-16 FIX: fetch real display name from profiles ──────────────────
    // profiles.full_name is the canonical display name set during onboarding.
    // user.user_metadata.alias is a handle and must NOT be used for feed posts.
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const displayName =
      profile?.full_name ||
      profile?.username ||
      user.email?.split('@')[0] ||
      'Streamer';

    // Create the live_streams row first so we have the ID for the feed post FK.
    const { data: stream, error: streamErr } = await supabase
      .from('live_streams')
      .insert({
        broadcaster_id: user.id,
        title: title || `${displayName}'s Live Stream`,
        status: 'live',
        thumbnail_url: thumbnail_url || null,
        started_at: new Date().toISOString(),
      })
      .select('id, title, thumbnail_url')
      .maybeSingle();

    if (streamErr || !stream) {
      console.warn('[start-stream] live_streams insert error:', streamErr?.message);
      return res.status(500).json({ error: streamErr?.message || 'Failed to create stream' });
    }

    // ── BUG-12 FIX: create feed post IMMEDIATELY, not via cron ─────────────
    // content_type='live' tells PostCard to render the live-stream embed widget,
    // not a static image. metadata.ended=false marks it as an active stream.
    const { data: feedPost, error: postErr } = await supabase
      .from('social_posts')
      .insert({
        author_id: user.id,
        // BUG-16 FIX: use real display name
        content: `🔴 ${displayName} is live: ${stream.title}`,
        content_type: 'live',
        media_urls: [],
        thumbnail_url: stream.thumbnail_url || null,
        visibility: 'public',
        metadata: {
          stream_id: stream.id,
          ended: false,
          source: 'live_broadcast',
          lives_id: stream.id,
          broadcaster_name: displayName,
        },
      })
      .select('id')
      .maybeSingle();

    if (postErr) {
      // Non-fatal: stream can proceed without a feed post — log and continue.
      console.warn('[start-stream] social_posts insert error:', postErr.message);
    }

    // ── BUG-12 FIX: set feed_post_id FK immediately ────────────────────────
    // Clients with a Realtime subscription on live_streams.feed_post_id see
    // the post appear the moment this update lands — not 60s later.
    if (feedPost?.id) {
      await supabase
        .from('live_streams')
        .update({ feed_post_id: feedPost.id })
        .eq('id', stream.id);
    }

    return res.json({
      success: true,
      stream_id: stream.id,
      feed_post_id: feedPost?.id || null,
    });

  } catch (err) {
    console.warn('[start-stream] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
