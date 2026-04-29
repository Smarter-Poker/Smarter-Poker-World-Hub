/**
 * /api/live/* — Hono catch-all router (Phase 4.5 module #3, 2026-04-28)
 *
 * Consolidates 4 Go-Live broadcast handlers under a single Hono app:
 *   POST   /token        — LiveKit access token (broadcaster or viewer)
 *   POST   /end-stream   — post-stream actions: post / save / delete
 *   POST   /gift         — atomic diamond gift sender → receiver + realtime broadcast
 *   GET    /schedule     — list upcoming scheduled lives
 *   POST   /schedule     — create scheduled live + notify followers
 *   DELETE /schedule     — cancel scheduled live (owner only)
 *
 * Replaces 4 source files totalling 392 LOC.
 *
 * Auth: shared `getServerUserWithFallback` (post-4.1d ESM-clean) — required for
 * every route; broadcaster_id mismatch returns 403.
 *
 * /token uses dynamic import('livekit-server-sdk') because the v2 SDK is
 * ESM-only with no CJS dist; `toJwt()` is async in v2.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/live');

// All routes require an authenticated user
app.use('*', async (c, next) => {
  const req = c.env?.req;
  try {
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', user);
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /token — LiveKit access token for broadcaster or viewer
// ═══════════════════════════════════════════════════════════════════════════
app.post('/token', async (c) => {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

  if (!apiKey || !apiSecret || !livekitUrl) {
    return c.json(
      {
        error:
          'LiveKit not configured — set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, NEXT_PUBLIC_LIVEKIT_URL',
      },
      503
    );
  }

  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { room, identity, name, broadcaster = false } = body;

    if (!room || !identity) return c.json({ error: 'room and identity required' }, 400);

    let displayName = name;
    if (!displayName) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', user.id)
        .maybeSingle();
      displayName = profile?.username || profile?.full_name || identity;
    }

    // Dynamic import REQUIRED — livekit-server-sdk v2 is ESM-only, no CJS build
    const { AccessToken } = await import('livekit-server-sdk');

    const at = new AccessToken(apiKey, apiSecret, {
      identity: String(identity),
      name: String(displayName),
      ttl: 3600,
    });

    at.addGrant({
      roomJoin: true,
      room: String(room),
      canPublish: Boolean(broadcaster),
      canSubscribe: true,
      canPublishData: true,
      roomCreate: Boolean(broadcaster),
    });

    const token = await at.toJwt();
    return c.json({ token, url: livekitUrl });
  } catch (err) {
    console.warn('[live/token] error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /end-stream — post / save / delete after a broadcast ends
// ═══════════════════════════════════════════════════════════════════════════
app.post('/end-stream', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { stream_id, action, caption } = body;

  if (!stream_id || !action) return c.json({ error: 'stream_id and action required' }, 400);

  try {
    const { data: stream } = await supabase
      .from('live_streams')
      .select('id, broadcaster_id, video_url, thumbnail_url, title')
      .eq('id', stream_id)
      .maybeSingle();

    if (!stream) return c.json({ error: 'Stream not found' }, 404);
    if (stream.broadcaster_id !== user.id) return c.json({ error: 'Not your stream' }, 403);

    if (action === 'delete') {
      if (stream.video_url) {
        const path = stream.video_url.split('/live-recordings/')[1];
        if (path) await supabase.storage.from('live-recordings').remove([path]).catch(() => {});
      }
      await supabase.from('live_streams').delete().eq('id', stream_id);
      return c.json({ success: true, action: 'deleted' });
    }

    if (action === 'save') {
      await supabase
        .from('live_streams')
        .update({ is_posted: false, is_draft: true })
        .eq('id', stream_id);
      return c.json({ success: true, action: 'saved' });
    }

    if (action === 'post') {
      await supabase
        .from('live_streams')
        .update({ is_posted: true, is_draft: false })
        .eq('id', stream_id);

      const { data: post, error: postErr } = await supabase
        .from('social_posts')
        .insert({
          author_id: user.id,
          content: caption || `🔴 Live replay: ${stream.title || 'Stream'}`,
          content_type: 'video',
          media_urls: stream.video_url ? [stream.video_url] : [],
          thumbnail_url: stream.thumbnail_url || null,
          visibility: 'public',
          metadata: { stream_id, source: 'live_replay' },
        })
        .select('id')
        .maybeSingle();

      if (postErr) {
        console.warn('[live/end-stream] social_posts insert error:', postErr.message);
        return c.json({ error: 'Failed to create social post' }, 500);
      }

      return c.json({ success: true, action: 'posted', postId: post?.id });
    }

    return c.json({ error: 'Invalid action. Use: post, save, or delete' }, 400);
  } catch (err) {
    console.warn('[live/end-stream] error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /gift — atomic diamond gift to broadcaster + realtime + notify
// ═══════════════════════════════════════════════════════════════════════════
app.post('/gift', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { stream_id, receiver_id, amount, message } = body;

  if (!stream_id || !receiver_id || !amount || amount < 1) {
    return c.json({ error: 'stream_id, receiver_id, and amount required' }, 400);
  }
  if (amount > 10000) return c.json({ error: 'Maximum gift is 10,000 diamonds' }, 400);
  if (receiver_id === user.id) return c.json({ error: 'Cannot gift yourself' }, 400);

  try {
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const senderName = senderProfile?.username || senderProfile?.full_name || 'A fan';

    // Atomic deduct (FOR UPDATE row lock prevents overdraft)
    const { data: deductResult, error: deductErr } = await supabase.rpc('deduct_diamonds', {
      p_user_id: user.id,
      p_amount: amount,
      p_description: 'Live gift to broadcaster',
      p_transaction_type: 'live_gift_sent',
    });

    if (deductErr) throw new Error(`Deduction failed: ${deductErr.message}`);
    if (deductResult && !deductResult.success) {
      return c.json(
        { error: deductResult.error || 'Insufficient diamonds', balance: deductResult.balance },
        400
      );
    }

    const senderNewBalance = deductResult?.balance ?? 0;

    const { error: creditErr } = await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: receiver_id,
      p_amount: amount,
      p_type: 'live_gift_received',
      p_description: `${senderName} sent ${amount} diamonds during your live`,
      p_reference_id: stream_id,
    });
    if (creditErr) throw new Error(`Credit failed: ${creditErr.message}`);

    const { data: gift } = await supabase
      .from('live_gifts')
      .insert({ stream_id, sender_id: user.id, receiver_id, amount, message: message || null })
      .select()
      .maybeSingle();

    // Realtime broadcast: wait for SUBSCRIBED status before sending,
    // otherwise send() silently drops.
    const channel = supabase.channel(`live-gifts-${stream_id}`);
    await new Promise((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
      setTimeout(resolve, 3000);
    });
    await channel
      .send({
        type: 'broadcast',
        event: 'gift',
        payload: {
          sender_id: user.id,
          sender_name: senderName,
          sender_avatar: senderProfile?.avatar_url || null,
          receiver_id,
          amount,
          message: message || null,
          gift_id: gift?.id,
        },
      })
      .catch(() => {});
    supabase.removeChannel(channel);

    await supabase
      .from('notifications')
      .insert({
        user_id: receiver_id,
        type: 'live_gift',
        title: 'Diamond Gift Received',
        message: `${senderName} sent you ${amount} diamonds during your live stream!`,
        actor_id: user.id,
        link: `/hub/lives?id=${stream_id}`,
        read: false,
      })
      .catch(() => {});

    return c.json({ success: true, gift, newBalance: senderNewBalance });
  } catch (err) {
    console.warn('[live/gift] error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// /schedule — GET / POST / DELETE
// ═══════════════════════════════════════════════════════════════════════════
app.get('/schedule', async (c) => {
  const user = c.get('user');
  const broadcaster_id = c.req.query('broadcaster_id') || user.id;

  const { data, error } = await supabase
    .from('scheduled_lives')
    .select('*, broadcaster:profiles(id, username, full_name, avatar_url)')
    .eq('broadcaster_id', broadcaster_id)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data: data || [] });
});

app.post('/schedule', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { title, description, thumbnail_url, scheduled_at } = body;

  if (!title || !scheduled_at) return c.json({ error: 'title and scheduled_at required' }, 400);

  const { data, error } = await supabase
    .from('scheduled_lives')
    .insert({ broadcaster_id: user.id, title, description, thumbnail_url, scheduled_at })
    .select()
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 500);

  // Fan-out notifications to followers (best-effort)
  const { data: followers } = await supabase
    .from('social_follows')
    .select('follower_id')
    .eq('following_id', user.id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, full_name')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = profile?.username || profile?.full_name || 'Someone you follow';
  const scheduledDate = new Date(scheduled_at).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  if (followers?.length) {
    const notifications = followers.map((f) => ({
      user_id: f.follower_id,
      type: 'live_scheduled',
      title: 'Upcoming Live Stream',
      message: `${displayName} is going live: "${title}" on ${scheduledDate}`,
      link: '/hub/lives',
      actor_id: user.id,
      read: false,
    }));
    const CHUNK = 50;
    for (let i = 0; i < notifications.length; i += CHUNK) {
      await supabase.from('notifications').insert(notifications.slice(i, i + CHUNK));
    }
  }

  return c.json({ data });
});

app.delete('/schedule', async (c) => {
  const user = c.get('user');
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const { error } = await supabase
    .from('scheduled_lives')
    .delete()
    .eq('id', id)
    .eq('broadcaster_id', user.id);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[live] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[live] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
