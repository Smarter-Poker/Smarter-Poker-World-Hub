/**
 * POST /api/live/end-stream
 * Server-side handler for post-stream actions: post to social feed, save as draft, or delete.
 * Uses service-role client to bypass RLS for reliable social_posts insert.
 *
 * Body: { stream_id, action: 'post'|'save'|'delete', caption? }
 *
 * BUG FIX: For all actions, the corresponding live feed post (content_type='live')
 * is updated with metadata.ended = true so PostCard can render an "Ended" badge
 * instead of a pulsing "LIVE NOW" badge, while keeping content_type='live' so
 * the live card UI template is still used for replay access.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Update the live broadcast feed post to reflect stream-ended state.
 *
 * BUG-FIX-DEEP-AUDIT-R2 CSS-1: this used to do its own fetch + JSONB merge
 * in JS. It now defers to fn_mark_feed_post_ended (SECURITY DEFINER RPC)
 * which does the merge atomically in SQL. That eliminates a TOCTOU window
 * where a parallel writer could clobber a fresh JSONB merge between the
 * SELECT and the UPDATE here.
 *
 * The RPC handles both the FK fast path (live_streams.feed_post_id) and
 * the legacy JSONB-scan fallback. media_urls is still updated from this
 * handler when videoUrl is available, because the RPC doesn't know about
 * the recording URL.
 */
async function markFeedPostEnded(stream_id, videoUrl = null) {
  try {
    const { error: rpcErr } = await supabase.rpc('fn_mark_feed_post_ended', {
      p_stream_id: stream_id,
    });
    if (rpcErr) {
      console.warn('[end-stream] fn_mark_feed_post_ended:', rpcErr.message);
      return;
    }

    if (videoUrl) {
      let postId = null;
      const { data: streamRow } = await supabase
        .from('live_streams')
        .select('feed_post_id')
        .eq('id', stream_id)
        .maybeSingle();
      postId = streamRow?.feed_post_id || null;

      if (!postId) {
        const { data: legacyMatch } = await supabase
          .from('social_posts')
          .select('id')
          .eq('content_type', 'live')
          .contains('metadata', { stream_id })
          .maybeSingle();
        postId = legacyMatch?.id || null;
      }

      if (postId) {
        await supabase
          .from('social_posts')
          .update({ media_urls: [videoUrl] })
          .eq('id', postId);
      }
    }
  } catch (e) {
    console.warn('[end-stream] markFeedPostEnded failed:', e?.message || e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!applyRateLimit(req, res, LIMITS.write)) return;

  const { user } = await getServerUserWithFallback(req, supabase);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { stream_id, action, caption } = req.body;
  if (!stream_id || !action)
    return res.status(400).json({ error: 'stream_id and action required' });

  try {
    // Verify ownership
    const { data: stream } = await supabase
      .from('live_streams')
      .select('id, broadcaster_id, video_url, thumbnail_url, title')
      .eq('id', stream_id)
      .maybeSingle();

    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.broadcaster_id !== user.id)
      return res.status(403).json({ error: 'Not your stream' });

    if (action === 'delete') {
      const { data: streamRow } = await supabase
        .from('live_streams')
        .select('feed_post_id')
        .eq('id', stream_id)
        .maybeSingle();
      let postDelErr = null;
      if (streamRow?.feed_post_id) {
        const { error } = await supabase.from('social_posts').delete().eq('id', streamRow.feed_post_id);
        postDelErr = error;
      } else {
        const { error } = await supabase
          .from('social_posts')
          .delete()
          .eq('content_type', 'live')
          .contains('metadata', { stream_id });
        postDelErr = error;
      }
      
      if (postDelErr) {
        console.warn('[end-stream] social_posts delete error:', postDelErr.message);
        return res.status(500).json({ error: postDelErr.message });
      }
      if (stream.video_url) {
        const path = stream.video_url.split('/live-recordings/')[1];
        if (path)
          await supabase.storage
            .from('live-recordings')
            .remove([path])
            .catch(() => {});
      }
      // ES-1 FIX: check error so a failed delete surfaces as a 500 instead of
      // silently returning { success: true } while the row still exists.
      const { error: streamDeleteErr } = await supabase
        .from('live_streams')
        .delete()
        .eq('id', stream_id);
      if (streamDeleteErr) {
        console.warn('[end-stream] live_streams delete error:', streamDeleteErr.message);
        return res.status(500).json({ error: streamDeleteErr.message });
      }
      return res.json({ success: true, action: 'deleted' });
    }

    if (action === 'save') {
      await markFeedPostEnded(stream_id);

      // BUG-FIX AUDIT-B3: write critical state FIRST so a crash between these
      // two updates can't leave the stream in a contradictory live+draft state.
      // ES-2 FIX: check error so a failed update surfaces as a 500 instead of
      // silently returning { success: true } with the stream still marked live.
      const { error: saveStreamErr } = await supabase
        .from('live_streams')
        .update({
          status: 'ended',
          is_posted: false,
          is_draft: true,
        })
        .eq('id', stream_id);
      if (saveStreamErr) {
        console.warn('[end-stream] live_streams save update error:', saveStreamErr.message);
        return res.status(500).json({ error: saveStreamErr.message });
      }

      // Best-effort: only stamp ended_at if force_end hasn't already written it —
      // preserves the original force_end timestamp for accurate stream-duration calc.
      await supabase
        .from('live_streams')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', stream_id)
        .is('ended_at', null);

      return res.json({ success: true, action: 'saved' });
    }

    if (action === 'post') {
      const { data: streamRow } = await supabase
        .from('live_streams')
        .select('feed_post_id')
        .eq('id', stream_id)
        .maybeSingle();

      let postId = streamRow?.feed_post_id;
      let existingPost = null;

      if (postId) {
        const { data } = await supabase
          .from('social_posts')
          .select('id, metadata')
          .eq('id', postId)
          .maybeSingle();
        existingPost = data;
      } else {
        const { data } = await supabase
          .from('social_posts')
          .select('id, metadata')
          .eq('content_type', 'live')
          .contains('metadata', { stream_id })
          .maybeSingle();
        existingPost = data;
        if (existingPost) postId = existingPost.id;
      }

      if (existingPost) {
        // BUG-FIX AUDIT-B2: atomic JSONB merge via RPC — eliminates TOCTOU window
        // from the previous JS fetch→merge→update sequence.
        await markFeedPostEnded(stream_id);
        // Content-field update only — metadata already handled atomically above.
        const { error: updateErr } = await supabase
          .from('social_posts')
          .update({
            content: caption || `🔴 Live replay: ${stream.title || 'Stream'}`,
            content_type: 'video',
            media_urls: stream.video_url ? [stream.video_url] : [],
            thumbnail_url: stream.thumbnail_url || null,
          })
          .eq('id', postId);

        if (updateErr) {
          console.warn('[end-stream] social_posts update error:', updateErr.message);
          return res.status(500).json({ error: 'Failed to update social post' });
        }
      } else {
        const { data: post, error: postErr } = await supabase
          .from('social_posts')
          .insert({
            author_id: user.id,
            content: caption || `🔴 Live replay: ${stream.title || 'Stream'}`,
            content_type: 'video',
            media_urls: stream.video_url ? [stream.video_url] : [],
            thumbnail_url: stream.thumbnail_url || null,
            visibility: 'public',
            metadata: { stream_id, ended: true, source: 'live_replay', lives_id: stream_id },
          })
          .select('id')
          .maybeSingle();

        if (postErr) {
          console.warn('[end-stream] social_posts insert error:', postErr.message);
          return res.status(500).json({ error: 'Failed to create social post' });
        }
        postId = post?.id;
      }

      // BUG-FIX AUDIT-B3: critical state first — prevents contradictory live+posted state on crash.
      // ES-3 FIX: check error so a failed update surfaces as a 500 instead of
      // silently returning { success: true } with the stream still marked live.
      const { error: postStreamErr } = await supabase
        .from('live_streams')
        .update({
          status: 'ended',
          is_posted: true,
          is_draft: false,
        })
        .eq('id', stream_id);
      if (postStreamErr) {
        console.warn('[end-stream] live_streams post update error:', postStreamErr.message);
        return res.status(500).json({ error: postStreamErr.message });
      }

      // Best-effort: stamp ended_at only if force_end hasn't already written it.
      await supabase
        .from('live_streams')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', stream_id)
        .is('ended_at', null);

      return res.json({ success: true, action: 'posted', postId });
    }

    if (action === 'force_end') {
      await markFeedPostEnded(stream_id);

      // BUG-FIX AUDIT-B1: guard with .is('ended_at', null) so repeated force_end
      // calls (keepalive retry on 5xx, multi-tab scenario, reconnect race) don't
      // overwrite the original timestamp — which would shift stream-duration
      // calculations forward.
      const { error: forceEndErr } = await supabase
        .from('live_streams')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', stream_id)
        .is('ended_at', null);

      if (forceEndErr) {
        console.warn('[end-stream] force_end update error:', forceEndErr.message);
        return res.status(500).json({ error: forceEndErr.message });
      }

      return res.json({ success: true, action: 'force_ended' });
    }

    return res.status(400).json({ error: 'Invalid action. Use: post, save, delete, or force_end' });
  } catch (err) {
    console.warn('[end-stream] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
