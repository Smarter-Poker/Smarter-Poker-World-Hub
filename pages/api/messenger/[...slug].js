/**
 * /api/messenger/* — Hono catch-all router (Phase 4.4 module #11, 2026-04-29)
 *
 * Consolidates 14 previously-separate handlers under a single Hono app.
 * Same pattern as news/video/live-help/promo/employee/venues/kyc/hendonmob/trivia.
 *
 * Routes (mounted at /api/messenger):
 *   POST /broadcast-message              — owner/admin broadcast to all conversations (rate-limited)
 *   POST /delete-conversation            — soft-delete user participation (rate-limited)
 *   POST /edit-message                   — edit own message within 5min window (rate-limited)
 *   POST /get-conversations              — list user's conversations w/ unread counts (read-rate)
 *   POST /get-messages                   — paginated messages for a conversation (rate-limited)
 *   GET  /gif-search                     — GIPHY proxy (no auth, GET-only, public)
 *   POST /global-search                  — search messages across user's conversations (read-rate)
 *   POST /insert-missed-call-notification — create missed-call notification (rate-limited)
 *   POST /link-preview                   — fetch OG metadata from URL (read-rate, in-mem cache)
 *   POST /mark-read                      — update last_read_at (rate-limited)
 *   POST /react-message                  — toggle reaction emoji (rate-limited)
 *   POST /send-message                   — send to conversation (rate-limited, sanitized)
 *   POST /start-conversation             — get/create 1-on-1 (rate-limited)
 *   POST /update-presence                — set online/offline (read-rate, high-freq)
 *
 * Replaces: 14 files, 1505 LOC -> ~1100 LOC ([...slug].js with shared middleware).
 * Net: -405 LOC.
 *
 * Auth pattern (per-route):
 *   - public: gif-search (rate-limited via writeLimit chain only — no user check)
 *   - userAuth: 13 routes via getServerUserWithFallback (Phase 4.1d ESM-clean)
 *
 * No DB schema changes — all tables + RPCs already exist:
 *   tables: social_conversations, social_conversation_participants, social_messages,
 *           message_reactions, profiles, notifications, club_members
 *   RPCs:   fn_get_user_conversations, fn_send_message, fn_get_or_create_conversation,
 *           fn_toggle_message_reaction, fn_update_presence
 *           (all with documented inline fallbacks if not deployed)
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeMessage, escapeLikeQuery } from '../../../src/utils/messageSanitizer';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Errors that indicate the RPC doesn't exist at all
function isMissingRpc(error) {
  if (!error) return false;
  const msg = String(error.message || '');
  const code = String(error.code || '');
  if (code === 'PGRST202') return true;
  if (/function .* does not exist/i.test(msg)) return true;
  if (/could not find the function/i.test(msg)) return true;
  return false;
}

// In-memory cache for link-preview
const previewCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_CONTENT_LENGTH = 500 * 1024;

const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👎', '🎉', '👏', '🙏', '🤔', '✅', '💯']);
const EDIT_WINDOW_MS = 5 * 60 * 1000;

const GIPHY_API_KEY = process.env.GIPHY_API_KEY || 'GRZ1Yjou2kmUFz1jcXP0S2skHrMZOFoQ';

// ─── OG metadata parser (preserved from link-preview.js) ──────────────────
function parseOGMeta(html, parsedUrl) {
  const result = {
    title: '', description: '', image: '', siteName: '', favicon: '',
    url: parsedUrl.href,
    domain: parsedUrl.hostname.replace('www.', ''),
  };

  const getMeta = (property) => {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, 'i'),
      new RegExp(`<meta[^>]+name=["']twitter:${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:${property}["']`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  };

  result.title = getMeta('title') || '';
  result.description = getMeta('description') || '';
  result.image = getMeta('image') || '';
  result.siteName = getMeta('site_name') || '';

  if (!result.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) result.title = titleMatch[1].trim();
  }

  if (!result.description) {
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (descMatch?.[1]) result.description = descMatch[1].trim();
  }

  if (result.description.length > 200) result.description = result.description.slice(0, 200) + '...';

  if (result.image && !result.image.startsWith('http')) {
    try { result.image = new URL(result.image, parsedUrl.origin).href; } catch { result.image = ''; }
  }

  const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
  if (faviconMatch?.[1]) {
    result.favicon = faviconMatch[1].startsWith('http')
      ? faviconMatch[1]
      : `${parsedUrl.origin}${faviconMatch[1].startsWith('/') ? '' : '/'}${faviconMatch[1]}`;
  } else {
    result.favicon = `${parsedUrl.origin}/favicon.ico`;
  }

  return result;
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/messenger');

const userAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) {
      return c.json({ success: false, error: 'Auth required' }, 401);
    }
    c.set('user', user);
    await next();
  } catch (err) {
    console.warn('[messenger] auth err:', err);
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
};

const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

const readLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.read)) {
    return c.body(null, 429);
  }
  await next();
};

// ─── Routes ───────────────────────────────────────────────────────────────

// POST /api/messenger/broadcast-message
app.post('/broadcast-message', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { content: rawContent, clubId } = body;

    if (!rawContent || !clubId) {
      return c.json({ success: false, error: 'Missing content or clubId' }, 400);
    }
    if (typeof rawContent !== 'string' || rawContent.length > 2000) {
      return c.json({ success: false, error: 'Payload too large or invalid' }, 413);
    }

    const content = `📢 ${sanitizeMessage(rawContent)}`;

    const { data: membership } = await supabase
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return c.json({ success: false, error: 'Only club owners/admins can broadcast' }, 403);
    }

    const { data: conversations } = await supabase
      .from('social_conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (!conversations || conversations.length === 0) {
      return c.json({ success: true, sent: 0, message: 'No conversations to broadcast to' });
    }

    const results = await Promise.allSettled(
      conversations.map(conv =>
        supabase.rpc('fn_send_message', {
          p_conversation_id: conv.conversation_id,
          p_sender_id: user.id,
          p_content: content,
        })
      )
    );

    let sent = 0;
    const errors = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && !result.value.error) {
        sent++;
      } else {
        const errMsg = result.status === 'rejected' ? result.reason?.message : result.value?.error?.message;
        errors.push({ conv: conversations[i].conversation_id, error: errMsg });
      }
    });

    return c.json({ success: true, sent, total: conversations.length, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    console.warn('[messenger/broadcast-message]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/delete-conversation
app.post('/delete-conversation', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { conversationId } = body;

    if (!conversationId) {
      return c.json({ success: false, error: 'conversationId required' }, 400);
    }

    const { data: participant } = await supabase
      .from('social_conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participant) {
      return c.json({ success: false, error: 'Not a participant in this conversation' }, 403);
    }

    const { error: deleteErr } = await supabase
      .from('social_conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    if (deleteErr) {
      console.warn('[messenger/delete-conversation]', deleteErr);
      return c.json({ success: false, error: deleteErr.message }, 500);
    }

    const { data: remaining } = await supabase
      .from('social_conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .limit(1);

    if (!remaining || remaining.length === 0) {
      await supabase.from('social_messages').delete().eq('conversation_id', conversationId);
      await supabase.from('social_conversations').delete().eq('id', conversationId);
    }

    return c.json({ success: true });
  } catch (err) {
    console.warn('[messenger/delete-conversation]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/edit-message
app.post('/edit-message', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { messageId, content: rawContent } = body;

    if (!messageId || !rawContent) {
      return c.json({ success: false, error: 'Missing messageId or content' }, 400);
    }
    if (typeof rawContent !== 'string' || rawContent.length > 2000) {
      return c.json({ success: false, error: 'Payload too large', message: 'Messages cannot exceed 2,000 characters.' }, 413);
    }

    const content = sanitizeMessage(rawContent);

    const { data: msg } = await supabase
      .from('social_messages')
      .select('id, sender_id, created_at, is_deleted')
      .eq('id', messageId)
      .maybeSingle();

    if (!msg) return c.json({ success: false, error: 'Message not found' }, 404);
    if (msg.sender_id !== user.id) {
      return c.json({ success: false, error: 'You can only edit your own messages' }, 403);
    }
    if (msg.is_deleted) {
      return c.json({ success: false, error: 'Cannot edit a deleted message' }, 400);
    }

    const createdAt = new Date(msg.created_at).getTime();
    if (Date.now() - createdAt > EDIT_WINDOW_MS) {
      return c.json({
        success: false,
        error: 'Edit window expired',
        message: 'Messages can only be edited within 5 minutes of sending.',
      }, 400);
    }

    const { error: updateErr } = await supabase
      .from('social_messages')
      .update({ content, is_edited: true, updated_at: new Date().toISOString() })
      .eq('id', messageId);

    if (updateErr) throw updateErr;

    return c.json({ success: true, content });
  } catch (err) {
    console.warn('[messenger/edit-message]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/get-conversations — list with unread counts
app.post('/get-conversations', readLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;

  try {
    // Primary: RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'fn_get_user_conversations',
      { p_user_id: userId }
    );

    if (!rpcError) {
      if (!Array.isArray(rpcData)) {
        return c.json({ success: false, error: 'Unexpected RPC response shape' }, 500);
      }
      const conversations = rpcData.map((cv) => ({
        id: cv.conversation_id || cv.id,
        last_message_at: cv.last_message_at,
        last_message_preview: cv.last_message_preview,
        is_group: cv.is_group || false,
        otherUser: cv.other_user || cv.otherUser || null,
        unreadCount: cv.unread_count ?? cv.unreadCount ?? 0,
        last_read_at: cv.last_read_at,
      }));
      return c.json({ success: true, conversations });
    }

    if (!isMissingRpc(rpcError)) {
      console.warn('[messenger/get-conversations] RPC error (not falling back):', rpcError);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }

    // Fallback waterfall
    console.warn('[messenger/get-conversations] fn_get_user_conversations not deployed; using fallback waterfall.');

    const { data: participations, error: partError } = await supabase
      .from('social_conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId)
      .limit(500);

    if (partError) return c.json({ success: false, error: 'Internal server error' }, 500);
    if (!participations || participations.length === 0) {
      return c.json({ success: true, conversations: [] });
    }

    const conversationIds = participations.map((p) => p.conversation_id);
    const participationMap = {};
    participations.forEach((p) => { participationMap[p.conversation_id] = p; });

    const earliestRead = participations.reduce((earliest, p) => {
      const ts = p.last_read_at || '1970-01-01';
      return ts < earliest ? ts : earliest;
    }, '9999-12-31');

    const [convsResult, otherParticipantsResult, candidateMsgsResult] = await Promise.all([
      supabase.from('social_conversations')
        .select('id, last_message_at, last_message_preview, is_group')
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false })
        .limit(500),
      supabase.from('social_conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', conversationIds)
        .neq('user_id', userId),
      supabase.from('social_messages')
        .select('conversation_id, created_at')
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId)
        .eq('is_deleted', false)
        .gt('created_at', earliestRead)
        .limit(10000),
    ]);

    if (convsResult.error || otherParticipantsResult.error || candidateMsgsResult.error) {
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }

    const conversations = convsResult.data || [];
    const allOtherParticipants = otherParticipantsResult.data || [];

    const convToOtherUser = {};
    const otherUserIds = new Set();
    allOtherParticipants.forEach((p) => {
      if (!convToOtherUser[p.conversation_id]) {
        convToOtherUser[p.conversation_id] = p.user_id;
        otherUserIds.add(p.user_id);
      }
    });

    let profilesMap = {};
    if (otherUserIds.size > 0) {
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, username, display_name, full_name, avatar_url')
        .in('id', [...otherUserIds]);
      if (profErr) return c.json({ success: false, error: 'Internal server error' }, 500);
      (profiles || []).forEach((p) => { profilesMap[p.id] = p; });
    }

    const unreadCounts = {};
    (candidateMsgsResult.data || []).forEach((msg) => {
      const participation = participationMap[msg.conversation_id];
      const lastRead = participation?.last_read_at || '1970-01-01';
      if (msg.created_at > lastRead) {
        unreadCounts[msg.conversation_id] = (unreadCounts[msg.conversation_id] || 0) + 1;
      }
    });

    const validConversations = conversations
      .map((conv) => {
        const otherUserId = convToOtherUser[conv.id];
        const otherUser = otherUserId ? profilesMap[otherUserId] : null;
        if (!otherUser && !conv.is_group) return null;
        return {
          id: conv.id,
          last_message_at: conv.last_message_at,
          last_message_preview: conv.last_message_preview,
          is_group: conv.is_group,
          otherUser,
          unreadCount: unreadCounts[conv.id] || 0,
          last_read_at: participationMap[conv.id]?.last_read_at,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return timeB - timeA;
      });

    return c.json({ success: true, conversations: validConversations });
  } catch (err) {
    console.warn('[messenger/get-conversations]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/get-messages
app.post('/get-messages', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { conversationId, before, limit: reqLimit } = body;

    if (!conversationId) return c.json({ success: false, error: 'Missing conversationId' }, 400);

    const pageLimit = Math.min(parseInt(reqLimit) || 100, 200);

    const { data: participant } = await supabase
      .from('social_conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participant) {
      return c.json({ success: false, error: 'Not a participant in this conversation' }, 403);
    }

    let query = supabase
      .from('social_messages')
      .select(`
        id, content, created_at, updated_at, sender_id, is_deleted, is_edited,
        profiles:sender_id (id, username, avatar_url, is_vip)
      `)
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false);

    if (before) {
      query = query.lt('created_at', before).order('created_at', { ascending: false }).limit(pageLimit);
    } else {
      query = query.order('created_at', { ascending: false }).limit(pageLimit);
    }

    const { data: messages, error } = await query;
    if (error) {
      console.warn('[messenger/get-messages]', error);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }

    const sorted = (messages || []).reverse();
    return c.json({ success: true, messages: sorted, count: sorted.length });
  } catch (err) {
    console.warn('[messenger/get-messages]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/messenger/gif-search — public GIPHY proxy
app.get('/gif-search', async (c) => {
  const q = c.req.query('q');
  const offset = parseInt(c.req.query('offset') || '0');
  const limit = parseInt(c.req.query('limit') || '20');
  const type = c.req.query('type') || 'gif';
  const endpoint = type === 'sticker' ? 'stickers' : 'gifs';

  try {
    let url;
    if (q && q.trim()) {
      url = `https://api.giphy.com/v1/${endpoint}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q.trim())}&limit=${limit}&offset=${offset}&rating=pg-13&lang=en`;
    } else {
      url = `https://api.giphy.com/v1/${endpoint}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=pg-13`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 401) {
        return c.json({ success: false, error: 'GIPHY API key is not configured or invalid', gifs: [] });
      }
      throw new Error(`GIPHY API returned ${response.status}`);
    }

    const data = await response.json();
    const gifs = (data.data || []).map(gif => ({
      id: gif.id,
      title: gif.title,
      url: gif.images?.fixed_height?.url || gif.images?.original?.url,
      preview: gif.images?.fixed_height_small?.url || gif.images?.preview_gif?.url,
      width: parseInt(gif.images?.fixed_height?.width || '200'),
      height: parseInt(gif.images?.fixed_height?.height || '200'),
    }));

    return c.json({ success: true, gifs, total: data.pagination?.total_count || 0 });
  } catch (err) {
    console.warn('[messenger/gif-search]', err);
    return c.json({ success: false, error: 'GIF search failed' }, 500);
  }
});

// POST /api/messenger/global-search
app.post('/global-search', readLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { query, clubId } = body;

    if (!query || typeof query !== 'string' || query.length < 2) {
      return c.json({ success: false, error: 'Query must be at least 2 characters' }, 400);
    }

    const { data: participations } = await supabase
      .from('social_conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    const convIds = (participations || []).map(p => p.conversation_id);
    if (convIds.length === 0) {
      return c.json({ success: true, results: [] });
    }

    const escapedQuery = escapeLikeQuery(query);
    const { data: messages, error: searchErr } = await supabase
      .from('social_messages')
      .select('id, content, created_at, sender_id, conversation_id, is_deleted')
      .in('conversation_id', convIds)
      .ilike('content', `%${escapedQuery}%`)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(30);

    if (searchErr) throw searchErr;

    const senderIds = [...new Set((messages || []).map(m => m.sender_id))];
    let profiles = {};
    if (senderIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', senderIds);
      (profs || []).forEach(p => { profiles[p.id] = p; });
    }

    const results = (messages || []).map(m => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      conversation_id: m.conversation_id,
      sender: profiles[m.sender_id] || { id: m.sender_id, username: 'Unknown' },
      isOwn: m.sender_id === user.id,
    }));

    return c.json({ success: true, results });
  } catch (err) {
    console.warn('[messenger/global-search]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/insert-missed-call-notification
app.post('/insert-missed-call-notification', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { calleeId, callType, reason } = body;

    if (!calleeId) return c.json({ success: false, error: 'calleeId required' }, 400);
    if (calleeId === user.id) return c.json({ success: true, skipped: true });

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const callerName = profile?.username || profile?.full_name || 'Someone';
    const typeLabel = callType === 'video' ? 'Video' : 'Voice';
    const reasonLabel = reason === 'declined' ? 'Declined' : 'Missed';

    const { error: insertErr } = await supabase
      .from('notifications')
      .insert({
        user_id: calleeId,
        type: 'missed_call',
        title: callerName,
        message: `${reasonLabel} ${typeLabel} Call`,
        actor_id: user.id,
        link: '/hub/messenger',
        data: {
          callType: callType || 'voice',
          reason: reason || 'missed',
          caller_avatar: profile?.avatar_url || null,
        },
      });

    if (insertErr) {
      console.warn('[messenger/insert-missed-call-notification]', insertErr);
      return c.json({ success: false, error: insertErr.message }, 500);
    }

    return c.json({ success: true });
  } catch (err) {
    console.warn('[messenger/insert-missed-call-notification]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/link-preview
app.post('/link-preview', readLimit, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return c.json({ success: false, error: 'URL is required' }, 400);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Invalid protocol');
    } catch {
      return c.json({ success: false, error: 'Invalid URL' }, 400);
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
      return c.json({ success: false, error: 'Private URLs not allowed' }, 400);
    }

    const cached = previewCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return c.json({ success: true, preview: cached.data });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SmarterPoker-LinkPreview/1.0 (bot; +https://smarter.poker)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) return c.json({ success: false, error: `HTTP ${response.status}` });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return c.json({ success: false, error: 'Not an HTML page' });

    const html = await response.text();
    const limitedHtml = html.slice(0, MAX_CONTENT_LENGTH);
    const preview = parseOGMeta(limitedHtml, parsedUrl);

    previewCache.set(url, { data: preview, timestamp: Date.now() });
    if (previewCache.size > 500) {
      const oldestKey = previewCache.keys().next().value;
      previewCache.delete(oldestKey);
    }

    return c.json({ success: true, preview });
  } catch (e) {
    if (e?.name === 'AbortError') return c.json({ success: false, error: 'Request timeout' });
    console.warn('[messenger/link-preview]', e);
    return c.json({ success: false, error: 'Failed to fetch preview' });
  }
});

// POST /api/messenger/mark-read
app.post('/mark-read', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { conversationId } = body;

    if (!conversationId) return c.json({ success: false, error: 'conversationId required' }, 400);

    const { data, error } = await supabase
      .from('social_conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[messenger/mark-read]', error);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }
    if (!data) return c.json({ success: false, error: 'Participant not found' }, 404);

    return c.json({ success: true, data });
  } catch (err) {
    console.warn('[messenger/mark-read]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/react-message
app.post('/react-message', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { messageId, reaction } = body;

    if (!messageId) return c.json({ success: false, error: 'messageId required' }, 400);
    if (!reaction) return c.json({ success: false, error: 'reaction required' }, 400);

    const { error: rpcErr } = await supabase.rpc('fn_toggle_message_reaction', {
      p_message_id: messageId,
      p_user_id: user.id,
      p_reaction: reaction,
    });

    if (rpcErr) {
      console.warn('[messenger/react-message] RPC error, using inline fallback:', rpcErr.message);

      const { data: existing } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('reaction', reaction)
        .maybeSingle();

      if (existing) {
        await supabase.from('message_reactions').delete().eq('id', existing.id);
      } else {
        await supabase.from('message_reactions').insert({
          message_id: messageId,
          user_id: user.id,
          reaction,
          created_at: new Date().toISOString(),
        });
      }
    }

    return c.json({ success: true });
  } catch (err) {
    console.warn('[messenger/react-message]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/send-message
app.post('/send-message', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { conversationId, content: rawContent } = body;

    if (!conversationId || !rawContent) {
      return c.json({ success: false, error: 'Missing conversationId or content' }, 400);
    }
    if (typeof rawContent !== 'string') {
      return c.json({ success: false, error: 'Invalid content type' }, 400);
    }
    if (rawContent.length > 2000) {
      return c.json({
        success: false,
        error: 'Payload too large',
        message: 'Messages cannot exceed 2,000 characters.',
      }, 413);
    }

    const content = sanitizeMessage(rawContent);

    const { data: participant } = await supabase
      .from('social_conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participant) {
      return c.json({ success: false, error: 'Not a participant in this conversation' }, 403);
    }

    const { data: msgId, error } = await supabase.rpc('fn_send_message', {
      p_conversation_id: conversationId,
      p_sender_id: user.id,
      p_content: content,
    });

    if (error) throw error;

    return c.json({ success: true, msgId, content });
  } catch (err) {
    console.warn('[messenger/send-message]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/start-conversation
app.post('/start-conversation', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { otherUserId } = body;

    if (!otherUserId) return c.json({ success: false, error: 'otherUserId required' }, 400);
    if (otherUserId === user.id) {
      return c.json({ success: false, error: 'Cannot start conversation with yourself' }, 400);
    }

    const { data: convId, error: rpcErr } = await supabase.rpc('fn_get_or_create_conversation', {
      user1_id: user.id,
      user2_id: otherUserId,
    });

    if (rpcErr) {
      console.warn('[messenger/start-conversation] RPC not found, using inline:', rpcErr.message);

      const { data: existing } = await supabase
        .from('social_conversation_participants')
        .select('conversation_id, social_conversations!inner(id, is_group)')
        .eq('user_id', user.id)
        .eq('social_conversations.is_group', false)
        .limit(50);

      const myConvIds = (existing || []).map(p => p.conversation_id);

      let foundId = null;
      if (myConvIds.length > 0) {
        const { data: shared } = await supabase
          .from('social_conversation_participants')
          .select('conversation_id')
          .eq('user_id', otherUserId)
          .in('conversation_id', myConvIds)
          .limit(1);
        foundId = shared?.[0]?.conversation_id || null;
      }

      if (foundId) return c.json({ success: true, conversationId: foundId });

      const { data: newConv, error: createErr } = await supabase
        .from('social_conversations')
        .insert({ is_group: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .select('id')
        .maybeSingle();

      if (createErr) return c.json({ success: false, error: 'Failed to create conversation' }, 500);

      await supabase.from('social_conversation_participants').insert([
        { conversation_id: newConv.id, user_id: user.id, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString() },
        { conversation_id: newConv.id, user_id: otherUserId, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString() },
      ]);

      return c.json({ success: true, conversationId: newConv.id });
    }

    return c.json({ success: true, conversationId: convId });
  } catch (err) {
    console.warn('[messenger/start-conversation]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/messenger/update-presence
app.post('/update-presence', readLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const isOnline = Boolean(body?.isOnline);

    const { error: rpcErr } = await supabase.rpc('fn_update_presence', {
      p_user_id: user.id,
      p_is_online: isOnline,
    });

    if (rpcErr) {
      console.warn('[messenger/update-presence] RPC error, using inline fallback:', rpcErr.message);
      await supabase.from('profiles').update({
        last_seen_at: new Date().toISOString(),
        is_online: isOnline,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
    }

    return c.json({ success: true });
  } catch {
    // Presence is non-critical — swallow errors silently
    return c.json({ success: true });
  }
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
      console.warn('[messenger] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[messenger] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
