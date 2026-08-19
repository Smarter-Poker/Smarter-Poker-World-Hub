/**
 * POST /api/messenger/start-conversation
 *
 * Gets or creates a 1-on-1 conversation between two users.
 * Runs fn_get_or_create_conversation via service role — bypasses the
 * missing GRANT EXECUTE on the authenticated role.
 *
 * NEW: If the two users are NOT friends, the conversation is marked
 * is_request=true so it appears in the recipient's Message Requests
 * instead of their main inbox (Facebook-style behavior).
 *
 * Body: { otherUserId: string }
 * Returns: { success: true, conversationId: string, isRequest?: boolean }
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';

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

/**
 * Check if two users are friends (accepted friendship in either direction).
 */
async function checkFriendship(supabase, userId, otherUserId) {
    try {
        const [f1, f2] = await Promise.all([
            supabase.from('friendships')
                .select('status')
                .eq('user_id', userId)
                .eq('friend_id', otherUserId)
                .eq('status', 'accepted')
                .maybeSingle(),
            supabase.from('friendships')
                .select('status')
                .eq('user_id', otherUserId)
                .eq('friend_id', userId)
                .eq('status', 'accepted')
                .maybeSingle(),
        ]);
        // A query ERROR is not evidence of "not friends". Returning false on
        // failure routes a message between established friends into the
        // recipient's Message Requests folder, where they most likely never
        // see it. Surface it instead of guessing, and let the caller decide.
        if (f1.error || f2.error) {
            const err = f1.error || f2.error;
            console.warn('[start-conversation] friendship lookup errored:', err?.message || err);
            return null; // unknown
        }
        return !!(f1.data || f2.data);
    } catch (e) {
        console.warn('[start-conversation] Friendship check failed:', e?.message || e);
        return null; // unknown — see above
    }
}

/**
 * Is this user allowed to send as this social page?
 *
 * Nothing checked this. contextEntityId was read from the body, string-coerced
 * and written straight onto the participant row, so any caller could stamp any
 * UUID -- including one that is not a page at all -- into
 * social_conversation_participants.context_entity_id. It does not expose
 * anyone else's inbox (the read filter is anchored to your own participant
 * row), but those columns exist to drive club scoping, and letting a client
 * write arbitrary values into them poisons everything built on top.
 */
async function resolveActingPage(supabase, userId, pageId) {
    const isUuid = typeof pageId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId);
    if (!isUuid) return null;

    const { data: page } = await supabase
        .from('social_pages')
        .select('id, owner_id, linked_entity_id, linked_entity_type')
        .eq('id', pageId)
        .maybeSingle();
    if (!page) return null;
    if (page.owner_id === userId) return page;

    if (page.linked_entity_type === 'club' && page.linked_entity_id) {
        const { data: membership } = await supabase
            .from('club_members')
            .select('role')
            .eq('club_id', page.linked_entity_id)
            .eq('user_id', userId)
            .maybeSingle();
        if (membership && ['owner', 'admin'].includes(membership.role)) return page;
    }
    return null;
}

/**
 * Has either side blocked the other?
 *
 * messenger_blocked is written and read by the client (useMessengerService),
 * and by nothing on the server. No route in pages/api/messenger/ consulted it,
 * so a blocked user could call this endpoint or send-message directly and their
 * messages were inserted and delivered. Blocking was decoration.
 */
async function isBlockedEitherWay(supabase, userId, otherUserId) {
    const { data, error } = await supabase
        .from('messenger_blocked')
        .select('blocker_id, blocked_id')
        .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`)
        .limit(1);
    if (error) {
        console.warn('[start-conversation] block lookup errored:', error.message);
        return false; // fail open on a lookup error rather than blocking everyone
    }
    return Array.isArray(data) && data.length > 0;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Authentication required' });

        const { otherUserId } = req.body;
        if (!otherUserId) return res.status(400).json({ success: false, error: 'otherUserId required' });
        if (otherUserId === user.id) return res.status(400).json({ success: false, error: 'Cannot start conversation with yourself' });

        const supabase = getSupabase();

        // Blocking is enforced here, not only in the client's local state.
        if (await isBlockedEitherWay(supabase, user.id, otherUserId)) {
            return res.status(403).json({ success: false, error: 'Cannot start a conversation with this user' });
        }

        // Check friendship status upfront — determines if this is a request or
        // direct message. null means the lookup failed; treat unknown as
        // friends-so-deliver rather than silently burying a real friend's
        // message in Requests.
        const friendship = await checkFriendship(supabase, user.id, otherUserId);
        const areFriends = friendship === null ? true : friendship;

        // Try RPC first (works with service role).
        // CRITICAL: param names are p_user_id / p_other_user_id (verified via
        // pg_get_functiondef). The previous call sent user1_id / user2_id which
        // PostgREST could not bind, returning PGRST202. That silently dropped
        // every call to the (broken) inline path below — and any partial-insert
        // failure there left conversations with only ONE participant row,
        // which is what caused KingFish's Johnny conversation to vanish.
        // Identity context: when the initiator acts AS a club page, contextEntityId
        // is that page id. Recorded only on the initiator participant row so the
        // conversation lands in the club inbox for them and the personal inbox for
        // the recipient. null = personal conversation (default).
        const rawCtx = req.body && req.body.contextEntityId;
        const requestedCtx = rawCtx && String(rawCtx).length > 0 ? String(rawCtx) : null;
        // Verified, not trusted. An unverifiable claim degrades to a personal
        // conversation rather than failing the request, so a stale client still
        // gets a working thread.
        const actingPage = requestedCtx ? await resolveActingPage(supabase, user.id, requestedCtx) : null;
        if (requestedCtx && !actingPage) {
            console.warn('[start-conversation] rejected unverified acting page', requestedCtx, 'for user', user.id);
        }
        const contextEntityId = actingPage ? actingPage.id : null;
        const contextEntityType = contextEntityId ? (req.body.contextEntityType || 'club') : null;
        const { data: rpcResult, error: rpcErr } = await supabase.rpc('fn_get_or_create_conversation', {
            p_user_id: user.id,
            p_other_user_id: otherUserId,
            p_context_entity_id: contextEntityId,
            p_context_entity_type: contextEntityType,
        });

        if (!rpcErr) {
            // The RPC returns jsonb { success, conversation_id, created }.
            // Treating the whole jsonb as a UUID (the previous bug) gave the
            // client an object instead of an ID and broke the navigation.
            if (rpcResult && rpcResult.success && rpcResult.conversation_id) {
                const convId = rpcResult.conversation_id;

                // If newly created AND not friends, mark as message request
                if (rpcResult.created === true && !areFriends) {
                    const { error: err_social_conversations_lmogj } = await supabase.from('social_conversations').update({ is_request: true, request_sender_id: user.id })
                        .eq('id', convId);
                    if (err_social_conversations_lmogj) console.warn('[Supabase] Silent mutation failed in social_conversations:', err_social_conversations_lmogj.message);
                }

                let isRequest = !areFriends && rpcResult.created === true;

                if (!rpcResult.created) {
                    // Existing conversation — check its current request status
                    const { data: convRow } = await supabase
                        .from('social_conversations')
                        .select('is_request, request_sender_id')
                        .eq('id', convId)
                        .maybeSingle();

                    if (convRow?.is_request) {
                        if (areFriends) {
                            // Users became friends — auto-clear request status
                            const { error: err_social_conversations_kwdkc } = await supabase.from('social_conversations').update({ is_request: false })
                                .eq('id', convId);
                            if (err_social_conversations_kwdkc) console.warn('[Supabase] Silent mutation failed in social_conversations:', err_social_conversations_kwdkc.message);
                        } else if (convRow.request_sender_id && convRow.request_sender_id !== user.id) {
                            // Current user is the RECIPIENT of the request and is actively messaging back
                            // Auto-accept: they're explicitly choosing to engage
                            const { error: err_social_conversations_958bi } = await supabase.from('social_conversations').update({ is_request: false })
                                .eq('id', convId);
                            if (err_social_conversations_958bi) console.warn('[Supabase] Silent mutation failed in social_conversations:', err_social_conversations_958bi.message);
                        } else {
                            // Current user is the sender — request still pending
                            isRequest = true;
                        }
                    }
                }

                return res.status(200).json({
                    success: true,
                    conversationId: convId,
                    created: rpcResult.created === true,
                    isRequest,
                });
            }
            // RPC returned but signaled failure — surface it.
            console.warn('[start-conversation] RPC returned non-success:', rpcResult);
            return res.status(500).json({ success: false, error: rpcResult?.error || 'RPC failed' });
        }

        // RPC errored — only fall back if it doesn't exist. Other errors must
        // surface so we don't paper over real bugs.
        const code = String(rpcErr.code || '');
        const msg = String(rpcErr.message || '');
        const rpcMissing = code === 'PGRST202' || /function .* does not exist/i.test(msg) || /could not find the function/i.test(msg);
        if (!rpcMissing) {
            console.warn('[start-conversation] RPC error (not falling back):', rpcErr);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        console.warn('[start-conversation] RPC not deployed; using inline fallback:', msg);

        // Find existing direct conversation IN THE SAME IDENTITY CONTEXT.
        // Without the context predicate this path could not match a club-mode
        // thread, and the reuse branch below was skipped outright whenever a
        // context was set — so every "message this user" click in club mode
        // minted a brand-new conversation and the club inbox filled with empty
        // duplicates of the same thread. Mirrors the RPC, which matches on
        // context_entity_id IS NOT DISTINCT FROM.
        let existingQuery = supabase
            .from('social_conversation_participants')
            .select('conversation_id, social_conversations!inner(id, is_group)')
            .eq('user_id', user.id)
            .eq('social_conversations.is_group', false);
        existingQuery = contextEntityId
            ? existingQuery.eq('context_entity_id', contextEntityId)
            : existingQuery.is('context_entity_id', null);
        // Cap at 500 — users with >500 convs may hit duplicate but this path is only
        // active when fn_get_or_create_conversation RPC isn't deployed (migration pending).
        const { data: existing } = await existingQuery.limit(500);

        const myConvIds = (existing || []).map(p => p.conversation_id);

        let foundId = null;
        if (myConvIds.length > 0) {
            // Check if otherUser is in any of the same conversations
            const { data: shared } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id')
                .eq('user_id', otherUserId)
                .in('conversation_id', myConvIds)
                .limit(1);

            foundId = shared?.[0]?.conversation_id || null;
        }

        // Reuse is now safe in BOTH modes: the candidate set above is already
        // filtered to this identity context, so a club-context request can only
        // ever match a club-context thread.
        if (foundId) {
            // Existing conversation — check its current request status
            const { data: convRow } = await supabase
                .from('social_conversations')
                .select('is_request, request_sender_id')
                .eq('id', foundId)
                .maybeSingle();

            let isRequest = false;
            if (convRow?.is_request) {
                if (areFriends) {
                    // Users became friends — auto-clear request status
                    const { error: err_social_conversations_802vo } = await supabase.from('social_conversations').update({ is_request: false })
                        .eq('id', foundId);
                    if (err_social_conversations_802vo) console.warn('[Supabase] Silent mutation failed in social_conversations:', err_social_conversations_802vo.message);
                } else if (convRow.request_sender_id && convRow.request_sender_id !== user.id) {
                    // Current user is the RECIPIENT and is actively messaging back — auto-accept
                    const { error: err_social_conversations_5d56s } = await supabase.from('social_conversations').update({ is_request: false })
                        .eq('id', foundId);
                    if (err_social_conversations_5d56s) console.warn('[Supabase] Silent mutation failed in social_conversations:', err_social_conversations_5d56s.message);
                } else {
                    // Current user is the sender — request still pending
                    isRequest = true;
                }
            }
            return res.status(200).json({ success: true, conversationId: foundId, created: false, isRequest });
        }

        // Create new conversation — set is_request based on friendship status
        const { data: newConv, error: createErr } = await supabase
            .from('social_conversations')
            .insert({
                is_group: false,
                is_request: !areFriends,
                request_sender_id: !areFriends ? user.id : null,
                context_entity_id: contextEntityId,
                context_entity_type: contextEntityType,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .select('id')
            .maybeSingle();

        if (createErr || !newConv) {
            console.warn('[start-conversation] Failed to create conversation:', createErr);
            return res.status(500).json({ success: false, error: 'Failed to create conversation' });
        }

        // CRITICAL: insert BOTH participants and check the result. The previous
        // code never inspected the insert error, so any partial failure (RLS,
        // unique-constraint race, transient outage) left exactly one participant
        // row in place — which is the asymmetric-row bug we just had to manually
        // repair on Dan's KingFish account.
        const { error: partErr, data: partData } = await supabase
            .from('social_conversation_participants')
            .insert([
                { conversation_id: newConv.id, user_id: user.id, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString(), context_entity_id: contextEntityId, context_entity_type: contextEntityType },
                { conversation_id: newConv.id, user_id: otherUserId, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString(), context_entity_id: null, context_entity_type: null },
            ])
            .select('user_id');

        if (partErr || !partData || partData.length !== 2) {
            // Roll back the conversation row so we don't leave an orphan parent.
            try {
                const { error: delErr } = await supabase.from('social_conversations').delete().eq('id', newConv.id);
                if (delErr) throw new Error(delErr.message);
            } catch (rbErr) {
                console.warn('[start-conversation] Conversation rollback failed:', rbErr?.message || rbErr);
            }
            console.warn('[start-conversation] Participant insert failed:', partErr, 'inserted:', partData?.length);
            return res.status(500).json({ success: false, error: 'Failed to add participants' });
        }

        return res.status(200).json({
            success: true,
            conversationId: newConv.id,
            created: true,
            isRequest: !areFriends,
        });
    } catch (err) {
        console.error('[start-conversation] Error:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

