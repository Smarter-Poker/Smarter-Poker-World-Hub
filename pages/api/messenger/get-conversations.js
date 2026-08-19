/**
 * 📬 GET CONVERSATIONS API (phase40 hardened)
 *
 * Returns the caller's conversation list. Flow:
 *   1. Verify caller's identity via JWT (local HMAC verify + GoTrue fallback).
 *   2. Primary: call `fn_get_user_conversations(p_user_id)` as service_role.
 *      The RPC bypasses AUTH_MISMATCH check when invoked as service_role, so
 *      trust here depends on step 1 having given us the correct userId.
 *   3. Fallback: if the RPC is literally undefined (404), run a hand-rolled
 *      waterfall against the same tables. All other RPC failures (permission,
 *      connection, timeout) return 500 — we do NOT silently proceed.
 *
 * Security posture:
 *   • The userId passed to the RPC is the JWT-verified user, never from body.
 *   • Service-role key is required. If missing, the handler returns 500
 *     rather than silently dropping to anon key and producing empty results.
 *   • Any error in the unread-count query is surfaced, not swallowed.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            // Fail loud. Falling back to the anon key silently breaks the
            // RLS-bypass assumption this handler is built around.
            throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Errors that indicate the RPC doesn't exist at all (migration not yet run).
// Anything else — including timeouts, permission errors, connection loss — must
// surface as 500 instead of silently dropping to the fallback waterfall.
function isMissingRpc(error) {
    if (!error) return false;
    const msg = String(error.message || '');
    const code = String(error.code || '');
    // PostgREST returns PGRST202 when the RPC is not found.
    if (code === 'PGRST202') return true;
    if (/function .* does not exist/i.test(msg)) return true;
    if (/could not find the function/i.test(msg)) return true;
    return false;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Read limit, not write limit — this endpoint is a GET-equivalent.
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        // ── Identity: local HMAC verify first, GoTrue network fallback if JWT secret missing. ──
        const { user: localUser } = await getServerUserWithFallback(req, getSupabase());
        if (!localUser) {
            return res.status(401).json({ success: false, error: 'Auth required' });
        }
        const userId = localUser.id;

        // ── PRIMARY: fn_get_user_conversations ──
        // contextEntityId: null = Personal inbox, UUID = Club page inbox
        const contextEntityId = req.body?.contextEntityId || null;
        const { data: rpcData, error: rpcError } = await getSupabase().rpc(
            'fn_get_user_conversations',
            {
                p_user_id: userId,
                p_context_entity_id: contextEntityId,
            }
        );

        if (!rpcError) {
            if (!Array.isArray(rpcData)) {
                // RPC succeeded but returned an unexpected shape — surface
                // rather than silently fall back.
                // eslint-disable-next-line no-console
                console.warn('[get-conversations] RPC returned non-array:', typeof rpcData);
                return res.status(500).json({ success: false, error: 'Unexpected RPC response shape' });
            }
            // The RPC returns FLAT columns (verified via pg_get_function_result):
            //   conversation_id, title, is_group, last_message_at, unread_count,
            //   other_user_id, other_user_username, other_user_avatar
            // Supplement with a secondary query to get request status AND last_message_preview.
            // The RPC doesn't return last_message_preview — fetch it here for all conversations.
            const rpcConvIds = rpcData.map(c => c.conversation_id || c.id).filter(Boolean);
            let convMetaMap = {}; // id → { is_request, request_sender_id, last_message_preview }
            let latestClubMetaMap = {}; // id → media_metadata
            if (rpcConvIds.length > 0) {
                try {
                    const [metaRowsRes, messagesRes] = await Promise.all([
                        getSupabase()
                            .from('social_conversations')
                            .select('id, is_request, request_sender_id, last_message_preview')
                            .in('id', rpcConvIds),
                        getSupabase()
                            .from('social_messages')
                            .select('conversation_id, media_metadata')
                            .in('conversation_id', rpcConvIds)
                            .neq('sender_id', userId)
                            .order('created_at', { ascending: false })
                    ]);
                    if (metaRowsRes.data) {
                        metaRowsRes.data.forEach(r => { convMetaMap[r.id] = r; });
                    }
                    if (messagesRes.data) {
                        messagesRes.data.forEach(msg => {
                            if (!latestClubMetaMap[msg.conversation_id] && msg.media_metadata && msg.media_metadata.is_club_identity) {
                                latestClubMetaMap[msg.conversation_id] = msg.media_metadata;
                            }
                        });
                    }
                } catch (reqErr) {
                    // Non-fatal: if this fails, all conversations show (no filtering, no preview)
                    console.warn('[get-conversations] Metadata query failed:', reqErr?.message);
                }
            }

            // Reshape the flat fields into the otherUser object the client expects.
            const conversations = rpcData
                .filter((c) => {
                    const convId = c.conversation_id || c.id;
                    const meta = convMetaMap[convId];
                    // Exclude message requests where current user is the RECIPIENT
                    // (requests where user is the sender still show in their inbox)
                    if (meta?.is_request && meta.request_sender_id && meta.request_sender_id !== userId) return false;
                    return true;
                })
                .map((c) => {
                const convId = c.conversation_id || c.id;
                const meta = convMetaMap[convId];
                const clubMeta = latestClubMetaMap[convId];
                const otherUserId = c.other_user_id || null;
                // RPC returns COALESCE(display_name, username, full_name) as
                // other_user_username — this is the best human-readable name.
                // Map it to display_name + full_name so the client can prefer
                // display names over raw usernames (critical for Google OAuth
                // users who update their profile name after sign-up).
                let displayName = c.other_user_username || null;
                let avatarUrl = c.other_user_avatar || null;
                let isClubIdentity = false;

                if (clubMeta && clubMeta.is_club_identity) {
                    displayName = clubMeta.club_name || displayName;
                    avatarUrl = clubMeta.club_avatar || avatarUrl;
                    isClubIdentity = true;
                }

                const otherUser = otherUserId
                    ? {
                          id: otherUserId,
                          username: displayName,
                          display_name: displayName,
                          full_name: displayName,
                          avatar_url: avatarUrl,
                          is_club_identity: isClubIdentity,
                          club_id: clubMeta?.club_id || null
                      }
                    : null;
                return {
                    id: convId,
                    title: c.title || null,
                    last_message_at: c.last_message_at,
                    // Use the supplementary query value (RPC doesn't include it)
                    last_message_preview: meta?.last_message_preview ?? c.last_message_preview ?? null,
                    is_group: c.is_group || false,
                    otherUser,
                    unreadCount: Number(c.unread_count ?? c.unreadCount ?? 0),
                    last_read_at: c.last_read_at ?? null,
                    isRequest: meta?.is_request || false,
                };
            });
            return res.status(200).json({ success: true, conversations });
        }

        // RPC errored. Only fall back if the RPC itself is missing — every
        // other error is fatal and must not be papered over.
        if (!isMissingRpc(rpcError)) {
            // eslint-disable-next-line no-console
            console.warn('[get-conversations] RPC error (not falling back):', rpcError);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        // eslint-disable-next-line no-console
        console.warn('[get-conversations] fn_get_user_conversations not deployed; using fallback waterfall.');

        // ── FALLBACK waterfall (only when RPC doesn't exist) ──
        // The context filter has to be applied here too. It was not, and the
        // consequence is not cosmetic: in club mode this returned EVERY
        // conversation the user participates in -- private personal DMs
        // included -- rendered underneath the "MESSAGING AS: <CLUB>" header.
        // And the trigger is not only "migration not yet deployed": isMissingRpc
        // above also matches PGRST202, which PostgREST returns for a stale
        // schema cache, which is a routine post-deploy condition.
        //
        // IS NOT DISTINCT FROM semantics, matching the RPC: null means the
        // personal inbox, and .eq() would never match a NULL column.
        let participationQuery = getSupabase()
            .from('social_conversation_participants')
            .select('conversation_id, last_read_at')
            .eq('user_id', userId);
        participationQuery = contextEntityId
            ? participationQuery.eq('context_entity_id', contextEntityId)
            : participationQuery.is('context_entity_id', null);
        const { data: participations, error: partError } = await participationQuery.limit(500);

        if (partError) {
            // eslint-disable-next-line no-console
            console.warn('[get-conversations] participations query error:', partError);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        if (!participations || participations.length === 0) {
            return res.status(200).json({ success: true, conversations: [] });
        }

        const conversationIds = participations.map((p) => p.conversation_id);
        const participationMap = {};
        participations.forEach((p) => { participationMap[p.conversation_id] = p; });

        const earliestRead = participations.reduce((earliest, p) => {
            const ts = p.last_read_at || '1970-01-01';
            return ts < earliest ? ts : earliest;
        }, '9999-12-31');

        const [convsResult, otherParticipantsResult, candidateMsgsResult] = await Promise.all([
            getSupabase()
                .from('social_conversations')
                .select('id, last_message_at, last_message_preview, is_group, is_request, request_sender_id')
                .in('id', conversationIds)
                .order('last_message_at', { ascending: false })
                .limit(500),
            getSupabase()
                .from('social_conversation_participants')
                .select('conversation_id, user_id')
                .in('conversation_id', conversationIds)
                .neq('user_id', userId),
            getSupabase()
                .from('social_messages')
                .select('conversation_id, created_at')
                .in('conversation_id', conversationIds)
                .neq('sender_id', userId)
                .eq('is_deleted', false)
                .gt('created_at', earliestRead)
                .limit(10000),
        ]);

        // Surface errors from any branch rather than silently returning partial data.
        if (convsResult.error) {
            // eslint-disable-next-line no-console
            console.warn('[get-conversations] conversations query error:', convsResult.error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
        if (otherParticipantsResult.error) {
            // eslint-disable-next-line no-console
            console.warn('[get-conversations] other-participants query error:', otherParticipantsResult.error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
        if (candidateMsgsResult.error) {
            // eslint-disable-next-line no-console
            console.warn('[get-conversations] unread-count query error:', candidateMsgsResult.error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        const conversations = convsResult.data || [];
        const allOtherParticipants = otherParticipantsResult.data || [];

        // Map conversation → "other" user (first we see per conversation).
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
            const { data: profiles, error: profErr } = await getSupabase()
                .from('profiles')
                .select('id, username, display_name, full_name, avatar_url')
                .in('id', [...otherUserIds]);
            if (profErr) {
                // eslint-disable-next-line no-console
                console.warn('[get-conversations] profiles query error:', profErr);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }
            (profiles || []).forEach((p) => { profilesMap[p.id] = p; });
        }

        // Per-conversation unread count against that conversation's own last_read_at.
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
                // Exclude message requests where user is recipient (not sender)
                if (conv.is_request && conv.request_sender_id && conv.request_sender_id !== userId) return null;
                return {
                    id: conv.id,
                    last_message_at: conv.last_message_at,
                    last_message_preview: conv.last_message_preview,
                    is_group: conv.is_group,
                    otherUser,
                    unreadCount: unreadCounts[conv.id] || 0,
                    last_read_at: participationMap[conv.id]?.last_read_at,
                    isRequest: conv.is_request || false,
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                return timeB - timeA;
            });

        return res.status(200).json({ success: true, conversations: validConversations });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        // eslint-disable-next-line no-console
        console.warn('[get-conversations]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
