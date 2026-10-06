import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeMessage } from '../../../src/utils/messageSanitizer';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { notifyNewMessage } from '../../../src/lib/notify';
import { randomUUID } from 'node:crypto';
import { getMessengerWorkspace } from '../../../src/lib/messengerWorkspace.mjs';

const isUUID = value => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const unavailable = () => Object.assign(new Error('Message Could Not Be Confirmed. Please Retry.'), { status: 503 });

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // 1. Enforce Token-Bucket Rate Limiter (30 requests / minute)
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { conversationId, requestId: suppliedRequestId, content: rawContent, message_type: rawMessageType, media_metadata: rawMetadata } = req.body || {};

      if (suppliedRequestId !== undefined && !isUUID(suppliedRequestId)) {
          return res.status(400).json({ success: false, error: 'Invalid Message Request' });
      }
      // Older clients did not send an operation identity. They keep independent
      // sends; current clients retain this ID through an explicit retry.
      const requestId = suppliedRequestId?.toLowerCase() || randomUUID();

      if (!isUUID(conversationId) || !rawContent) {
          return res.status(400).json({ success: false, error: 'Missing conversationId or content' });
      }

      // 2. Payload Size Enforcement (Stop 10MB Base64 attacks)
      if (typeof rawContent !== 'string') {
          return res.status(400).json({ success: false, error: 'Invalid content type' });
      }

      if (rawContent.length > 2000) {
          return res.status(413).json({
              success: false,
              error: 'Payload too large',
              message: 'Messages cannot exceed 2,000 characters.'
          });
      }

      // Allowlist message_type to prevent injection of arbitrary types
      const ALLOWED_MESSAGE_TYPES = new Set(['text', 'shared_post', 'gif', 'image', 'system']);
      const messageType = ALLOWED_MESSAGE_TYPES.has(rawMessageType) ? rawMessageType : 'text';

      // Validate metadata: must be a plain object, cap serialized size at 8KB
      let safeMetadata = {};
      if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
          const metaStr = JSON.stringify(rawMetadata);
          if (metaStr.length <= 8192) {
              safeMetadata = rawMetadata;
          } else {
              console.warn('[send-message] media_metadata too large, truncating to empty');
          }
      }

      // 3. XSS Neutralization
      const content = sanitizeMessage(rawContent);

      try {
          // 4. Auth Verification
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const userId = user.id;

          // ── Club identity: verify it, never take the client's word ──
          // media_metadata was only checked for "plain object under 8 KB". The
          // inbox renderer (get-conversations.js) reads is_club_identity /
          // club_name / club_avatar straight out of the OTHER party's message
          // and uses them to replace the displayed name and avatar of the
          // sender. So a stock account could send
          //   { is_club_identity: true, club_name: 'Shark Club',
          //     club_avatar: '<the real club avatar>' }
          // and the recipient's inbox would render that thread as the club.
          // Full impersonation of any club page, from any account.
          //
          // Fix: the claim is checked here and the displayed fields are
          // rewritten from the database, so the client can only ever say WHICH
          // page it is acting as -- never what that page is called or looks
          // like. Failing the check strips the claim rather than rejecting the
          // message, so a stale client degrades to a normal personal message
          // instead of losing the user's text.
          if (safeMetadata && safeMetadata.is_club_identity) {
              const claimedPageId =
                  typeof safeMetadata.club_id === 'string' &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeMetadata.club_id)
                      ? safeMetadata.club_id
                      : null;

              let verifiedPage = null;
              if (claimedPageId) {
                  const { data: page, error: pageError } = await getSupabase()
                      .from('social_pages')
                      .select('id, name, avatar_url, owner_id, linked_entity_id, linked_entity_type')
                      .eq('id', claimedPageId)
                      .maybeSingle();
                  if (pageError) throw unavailable();

                  if (page) {
                      if (page.owner_id === userId) {
                          verifiedPage = page;
                      } else if (page.linked_entity_type === 'club' && page.linked_entity_id) {
                          // Club staff may speak as the club. Ordinary members
                          // may not -- a 578-member club where anyone can post
                          // as the club is not an identity, it is a megaphone.
                          const { data: membership, error: membershipError } = await getSupabase()
                              .from('club_members')
                              .select('role')
                              .eq('club_id', page.linked_entity_id)
                              .eq('user_id', userId)
                              .maybeSingle();
                          if (membershipError) throw unavailable();
                          if (membership && ['owner', 'admin'].includes(membership.role)) {
                              verifiedPage = page;
                          }
                      }
                  }
              }

              if (verifiedPage) {
                  safeMetadata = {
                      ...safeMetadata,
                      is_club_identity: true,
                      club_id: verifiedPage.id,
                      club_name: verifiedPage.name,
                      club_avatar: verifiedPage.avatar_url,
                  };
              } else {
                  const stripped = { ...safeMetadata };
                  delete stripped.is_club_identity;
                  delete stripped.club_id;
                  delete stripped.club_name;
                  delete stripped.club_avatar;
                  safeMetadata = stripped;
                  console.warn(
                      '[send-message] rejected unverified club identity claim from user',
                      userId,
                      'for page',
                      claimedPageId || '(malformed)'
                  );
              }
          }

          // Verify participant access
          const { data: participant, error: partError } = await getSupabase()
              .from('social_conversation_participants')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('user_id', userId)
              .maybeSingle();

          if (partError) throw unavailable();
          if (!participant) {
              return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
          }

          // Sending uses the same private-invoice and active-club boundary as
          // opening the conversation. Participation alone is not visibility.
          await getMessengerWorkspace(getSupabase(), userId, { workspace: 'resolve', conversationId });

          // Blocking, enforced on the server. messenger_blocked was read and
          // written only by the client (useMessengerService), and no route in
          // pages/api/messenger/ ever consulted it -- so a blocked user could
          // POST here directly and the message was inserted and delivered.
          // Checked both directions: blocking is mutual in effect.
          let otherIds = [];
          try {
              const { data: others, error: othersError } = await getSupabase()
                  .from('social_conversation_participants')
                  .select('user_id')
                  .eq('conversation_id', conversationId)
                  .neq('user_id', userId);
              if (othersError || !Array.isArray(others)) throw unavailable();
              otherIds = [...new Set(others.map((o) => o.user_id).filter(Boolean))];
              if (otherIds.length > 0) {
                  const { data: blocks, error: blocksError } = await getSupabase()
                      .from('messenger_blocked')
                      .select('blocker_id, blocked_id')
                      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
                  if (blocksError || !Array.isArray(blocks)) throw unavailable();
                  const blocked = blocks.some(
                      (b) =>
                          (b.blocker_id === userId && otherIds.includes(b.blocked_id)) ||
                          (b.blocked_id === userId && otherIds.includes(b.blocker_id))
                  );
                  if (blocked) {
                      return res.status(403).json({ success: false, error: 'Cannot send to this conversation' });
                  }
              }
          } catch (blockErr) {
              console.warn('[send-message] block check failed:', blockErr?.message || blockErr);
              throw unavailable();
          }

          // The transaction rechecks access and binds this sender/request pair
          // to one immutable payload, including when the first reply is lost.
          const { data: rpcResult, error } = await getSupabase().rpc('fn_send_message_once', {
              p_conversation_id: conversationId,
              p_sender_id: userId,
              p_request_id: requestId,
              p_content: content,
              p_message_type: messageType,
              p_metadata: safeMetadata,
          });

          if (error) {
              if (error.code === '23505' && error.message === 'Message Request Conflicts With Previous Send') {
                  return res.status(409).json({ success: false, error: error.message });
              }
              if (error.code === '42501') {
                  return res.status(403).json({ success: false, error: 'Cannot Send To This Conversation' });
              }
              throw unavailable();
          }
          const realMsgId = rpcResult?.message_id;
          if (rpcResult?.success !== true || !isUUID(realMsgId) || typeof rpcResult.replayed !== 'boolean') throw unavailable();

          // ── Notify the recipients ────────────────────────────────────────
          // Until now a direct message produced NOTHING: no bell entry, no
          // push. Delivery relied entirely on Supabase Realtime, so a message
          // only landed if the recipient already had the app open. Someone
          // messaging you was silent on a locked phone.
          //
          // Routed through notify() rather than a bare insert so it delivers
          // INLINE (a message that arrives up to 5 minutes late via the outbox
          // cron is useless) while still passing the full preference gate --
          // mute_all, push_enabled, per-type prefs, the legacy messenger_alerts
          // column, quiet hours and the daily cap.
          //
          // Only the first committed send owns fan-out. Retrying an acknowledged
          // or ambiguous send must not insert another bell item or push event.
          // Notification failures never change the persisted message outcome.
          try {
              if (!rpcResult.replayed && otherIds.length > 0) {
                  const { data: senderProfile } = await getSupabase()
                      .from('profiles')
                      .select('username, avatar_url')
                      .eq('id', userId)
                      .maybeSingle();
                  const senderName =
                      senderProfile?.username || 'Someone';

                  // Never put message media or metadata in a lock-screen preview.
                  const preview =
                      messageType && messageType !== 'text'
                          ? `Sent ${messageType === 'image' ? 'a photo' : 'an attachment'}`
                          : String(content || '').slice(0, 140);

                  await Promise.all(
                      otherIds.map((recipientId) =>
                          notifyNewMessage(
                              getSupabase(), recipientId, senderName, preview, conversationId,
                              senderProfile?.avatar_url || null
                          )
                      )
                  );
              }
          } catch (notifyErr) {
              // A notification problem must never fail a message that was sent.
              console.warn('[send-message] notify failed:', notifyErr?.message || notifyErr);
          }

          return res.json({ success: true, msgId: realMsgId, content, requestId, replayed: rpcResult.replayed });
      } catch (e) {
          console.warn('[ANTIGRAVITY] Send Message Exception:', e);
          const status = [400, 403, 404].includes(e?.status) ? e.status : 503;
          return res.status(status).json({ success: false, error: status === 503
              ? 'Message Could Not Be Confirmed. Please Retry.' : 'Cannot Send To This Conversation' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
