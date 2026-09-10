/**
 * 📺 LIVE STREAM READS — the query half of LiveStreamService, with no SDK
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 *   `LiveStreamService.js` opens with `import { Room, RoomEvent, Track,
 *   VideoPresets } from 'livekit-client'` at MODULE SCOPE. Anything that
 *   imports the service therefore downloads the whole WebRTC SDK - measured
 *   from the served bundle on 2026-09-10 as a 527 KB chunk carrying
 *   RTCPeerConnection x157, LocalParticipant, SignalClient and DataPacket.
 *
 *   Three surfaces imported the service and never touched a room:
 *
 *     pages/hub/social-media/index.js        getLiveStreams, getStream
 *     pages/hub/social-pages/[pageId].js     getLiveStreams
 *     pages/hub/lives.js                     LIVE_STREAM_SAFE_COLS only
 *
 *   So a reader scrolling the feed paid 527 KB for a live-streaming SDK that
 *   nothing on that page can use. These three functions are pure Supabase
 *   reads - they touch no LiveKit symbol and no instance state - so they move
 *   here, where they can be imported without dragging the SDK along.
 *
 * ONE SOURCE OF TRUTH
 *   LiveStreamService re-exports these rather than keeping a second copy, so
 *   its existing static methods keep working for every current caller and
 *   there is exactly one implementation of each query (RULE 12).
 *
 * WHAT MUST NOT BE ADDED HERE
 *   Anything that needs `livekit-client`. Joining, publishing, muting,
 *   flipping the camera and disconnecting all stay in LiveStreamService,
 *   which is where the SDK belongs. If you find yourself importing the SDK
 *   into this file, the split has been defeated and the 527 KB is back.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';

/**
 * `live_streams` is column-GRANTed, so a client SELECT must enumerate the safe
 * columns rather than use `*`. This matches the GRANT SELECT (...) set in the
 * migration. The broadcaster's own invite code comes from the
 * fn_get_my_guest_invite_code RPC, never from here.
 */
export const LIVE_STREAM_SAFE_COLS =
  'id, broadcaster_id, title, description, thumbnail_url, status, viewer_count, started_at, ended_at, created_at, video_url, is_posted, is_draft, mime_type, livekit_room, slow_mode, peak_viewers, reaction_count, category, feed_post_id, preview_clip_url, preview_updated_at';

const BROADCASTER_JOIN = ', broadcaster:profiles(id, username, full_name, avatar_url)';

/**
 * Every live stream the caller is allowed to see.
 *
 * Uses the get_visible_live_streams RPC, which drops streams from broadcasters
 * the caller has blocked OR who have blocked the caller. The direct SELECT
 * below is a fallback for a dev database that predates the RPC and does NOT
 * filter blocks; production has the RPC.
 */
export async function getLiveStreams() {
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_visible_live_streams');

  if (!rpcErr && rpcData) {
    // Reshape RPC rows into the shape the rest of the app expects:
    // { ...stream_columns, broadcaster: { id, username, full_name, avatar_url } }
    return rpcData.map((r) => ({
      id: r.id,
      broadcaster_id: r.broadcaster_id,
      title: r.title,
      description: r.description,
      thumbnail_url: r.thumbnail_url,
      preview_clip_url: r.preview_clip_url,
      preview_updated_at: r.preview_updated_at,
      status: r.status,
      viewer_count: r.viewer_count,
      peak_viewers: r.peak_viewers,
      reaction_count: r.reaction_count,
      category: r.category,
      started_at: r.started_at,
      livekit_room: r.livekit_room,
      broadcaster: {
        id: r.broadcaster_id,
        username: r.broadcaster_username,
        full_name: r.broadcaster_full_name,
        avatar_url: r.broadcaster_avatar,
      },
    }));
  }

  if (rpcErr && (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('not exist'))) {
    console.warn(
      '[liveStreamReads] get_visible_live_streams RPC missing - falling back to unfiltered SELECT'
    );
    const { data, error } = await supabase
      .from('live_streams')
      .select(LIVE_STREAM_SAFE_COLS + BROADCASTER_JOIN)
      .eq('status', 'live')
      .order('started_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  if (rpcErr) throw rpcErr;
  return [];
}

/** One stream by id, or null. */
export async function getStream(streamId) {
  const { data, error } = await supabase
    .from('live_streams')
    .select(LIVE_STREAM_SAFE_COLS + BROADCASTER_JOIN)
    .eq('id', streamId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Analytics row for one stream, or null. */
export async function getStreamAnalytics(streamId) {
  const { data } = await supabase
    .from('live_stream_analytics')
    .select('*')
    .eq('id', streamId)
    .maybeSingle();
  return data || null;
}

export default { LIVE_STREAM_SAFE_COLS, getLiveStreams, getStream, getStreamAnalytics };
