/**
 * 📤 SHARE POST MODAL — V2
 * src/components/social/SharePostModal.jsx
 *
 * Two-tab share experience:
 *   1. "Share To Feed" — Quote-post: write your own commentary, then post to your feed
 *   2. "Send To Friend" — Pick friends from your list and send via Messenger
 *
 * Props:
 *   post           — The post object being shared
 *   authorUsername  — Username of the original author
 *   currentUser    — { id, username, avatar_url }
 *   onClose        — Close the modal
 *   onShared       — Callback after a successful share (platform: 'feed' | 'messenger' | 'copy' | etc.)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { busEmit } from '../../engine/EventBus';
import { supabase } from '../../lib/supabase';
import { getAccessToken, getAuthUser } from '../../lib/authUtils';
import toast from '../../stores/toastStore';
import { SharedAvatar as Avatar } from './SharedAvatar';
import confetti from 'canvas-confetti';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#22C55E', blueLight: '#E7F3FF',
};

const EXTERNAL_PLATFORMS = [
    {
        id: 'copy', label: 'Copy Link', icon: '🔗', color: '#65676B',
        action: (url) => navigator.clipboard?.writeText(url)
    },
    {
        id: 'twitter', label: 'X (Twitter)', icon: '𝕏', color: '#000000',
        action: (url, text) => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
    },
    {
        id: 'whatsapp', label: 'WhatsApp', icon: '📱', color: '#25D366',
        action: (url, text) => window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank')
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// RICH SHARE PAYLOAD BUILDER
// Packages full post metadata so messenger recipients see a rich preview card
// ═══════════════════════════════════════════════════════════════════════════
function buildRichSharePayload(post, postUrl, senderMessage) {
    const author = post?.author || {};
    const authorName = author.name || author.full_name || author.username || 'Player';
    const mediaUrls = post?.mediaUrls || post?.media_urls || [];
    const previewImage = mediaUrls[0] || post?.link_image || post?.thumbnail_url || null;
    const snippet = (post?.content || '').slice(0, 280);

    return {
        // The plain-text message body shown in the thread
        text: senderMessage
            ? `${senderMessage}\n\n${postUrl}`
            : `Check out this post on Smarter.Poker\n\n${postUrl}`,
        // Rich metadata — rendered as a preview card in the chat
        media_metadata: {
            shared_post_id:     post?.id || null,
            shared_from:        'share_modal',
            // Rich preview fields
            preview_type:       'post',
            preview_url:        postUrl,
            preview_title:      `${authorName} on Smarter.Poker`,
            preview_description: snippet || null,
            preview_image:      previewImage,
            preview_site_name:  'Smarter.Poker',
            // Author info
            author_name:        authorName,
            author_avatar:      author.avatar_url || author.avatar || null,
            author_username:    author.username || null,
            // Content type
            content_type:       post?.content_type || post?.contentType || 'text',
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ORIGINAL POST PREVIEW (embedded card shown in both tabs)
// ═══════════════════════════════════════════════════════════════════════════
function OriginalPostPreview({ post, authorUsername }) {
    const authorName = post?.author?.name || post?.author?.username || authorUsername || 'Player';
    const authorAvatar = post?.author?.avatar || post?.author?.avatar_url || null;
    const snippet = (post?.content || '').slice(0, 200);
    const hasMedia = post?.mediaUrls?.length > 0 || post?.media_urls?.length > 0;
    const firstMedia = (post?.mediaUrls || post?.media_urls || [])[0];

    return (
        <div style={{
            border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
            background: C.bg, margin: '0 0 12px'
        }}>
            {/* Author row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px' }}>
                <Avatar src={authorAvatar} name={authorName} size={28} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{authorName}</span>
            </div>
            {/* Content snippet */}
            {snippet && (
                <div style={{ padding: '0 12px 8px', fontSize: 13, color: C.textSec, lineHeight: 1.4 }}>
                    {snippet}{snippet.length >= 200 ? '...' : ''}
                </div>
            )}
            {/* Media thumbnail */}
            {hasMedia && firstMedia && (
                <div style={{ width: '100%', maxHeight: 160, overflow: 'hidden' }}>
                    <img src={firstMedia} alt="" style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1: SHARE TO FEED
// ═══════════════════════════════════════════════════════════════════════════
function ShareToFeedTab({ post, authorUsername, currentUser, onClose, onShared }) {
    const [commentary, setCommentary] = useState('');
    const [posting, setPosting] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleShareToFeed = async () => {
        if (posting) return;
        if (!currentUser?.id) { toast.error('Please log in to share'); return; }
        setPosting(true);
        try {
            const token = getAccessToken();
            if (!token) throw new Error('Not authenticated');

            const res = await fetch('/api/social/share-to-feed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    original_post_id: post?.id,
                    commentary: commentary.trim(),
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Share failed');

            if (json.already_shared) {
                toast.error('You already shared this post');
                onClose();
                return;
            }

            // Success animation
            confetti({
                particleCount: 100, spread: 70, origin: { y: 0.6 },
                colors: ['#1877F2', '#22C55E', '#FFFFFF'],
            });

            toast.success('Shared to your feed!');
            busEmit.dataMutated?.('social_posts');
            onShared?.('feed');
            setTimeout(onClose, 800);
        } catch (err) {
            console.warn('[ShareToFeed] Error:', err);
            toast.error(err.message || 'Could not share to feed');
        }
        setPosting(false);
    };

    return (
        <div>
            {/* Composer area */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                <Avatar src={currentUser?.avatar_url} name={currentUser?.username} size={36} />
                <textarea
                    ref={inputRef}
                    value={commentary}
                    onChange={e => setCommentary(e.target.value)}
                    placeholder="Say Something About This Post..."
                    maxLength={2000}
                    style={{
                        flex: 1, minHeight: 80, resize: 'vertical', border: `1px solid ${C.border}`,
                        borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit',
                        color: C.text, background: C.bg, outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = C.blue}
                    onBlur={e => e.target.style.borderColor = C.border}
                />
            </div>

            {/* Preview of original post */}
            <OriginalPostPreview post={post} authorUsername={authorUsername} />

            {/* Share button */}
            <button
                onClick={handleShareToFeed}
                disabled={posting}
                style={{
                    width: '100%', padding: '12px 0', border: 'none', borderRadius: 8,
                    background: posting ? '#aaa' : C.blue, color: '#fff', fontSize: 15,
                    fontWeight: 600, cursor: posting ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s',
                }}
            >
                {posting ? 'Sharing...' : 'Share Now'}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: SEND TO FRIEND (via Messenger)
// ═══════════════════════════════════════════════════════════════════════════
function SendToFriendTab({ post, authorUsername, currentUser, onClose, onShared }) {
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');

    // Load friends list
    useEffect(() => {
        if (!currentUser?.id) return;
        let cancelled = false;
        (async () => {
            const cacheKey = `sp-friends-share-${currentUser.id}`;
            try {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const { data, ts } = JSON.parse(cached);
                    if (Date.now() - ts < 300000) { // 5 min cache
                        if (!cancelled) {
                            setFriends(data);
                            setLoading(false);
                        }
                        return;
                    }
                }
            } catch (_) {}

            try {
                const token = getAccessToken();
                const res = await fetch('/api/friends?action=list', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const json = await res.json();
                if (!cancelled && json.success) {
                    let fList = json.data?.friends || [];
                    try {
                        const recents = JSON.parse(localStorage.getItem(`recent_shares_${currentUser.id}`) || '[]');
                        if (recents.length > 0) {
                            fList.sort((a, b) => {
                                const idxA = recents.indexOf(a.id);
                                const idxB = recents.indexOf(b.id);
                                if (idxA === -1 && idxB === -1) return 0;
                                if (idxA === -1) return 1;
                                if (idxB === -1) return -1;
                                return idxA - idxB;
                            });
                        }
                    } catch (_) {}
                    setFriends(fList);
                    try {
                        sessionStorage.setItem(cacheKey, JSON.stringify({ data: fList, ts: Date.now() }));
                    } catch (_) {}
                }
            } catch (e) { console.warn('[SendToFriend] Load friends error:', e); }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [currentUser?.id]);

    const filtered = friends.filter(f => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (f.username || '').toLowerCase().includes(q) ||
               (f.display_name || '').toLowerCase().includes(q);
    });

    const toggleFriend = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleSend = async () => {
        if (selected.size === 0) { toast.error('Select at least one friend'); return; }
        if (!currentUser?.id) return;
        setSending(true);

        const token = getAccessToken();
        if (!token) { setSending(false); toast.error('Please sign in to share'); return; }

        const postUrl = `${window.location.origin}/hub/post/${post?.id}`;
        let successCount = 0;
        for (const friendId of selected) {
            try {
                // 1. Get or create direct conversation via RPC (social_* tables)
                // CRITICAL: the param names are p_user_id / p_other_user_id and must
                // match the SQL signature exactly, because PostgREST binds RPC
                // arguments BY NAME. The previous user1_id / user2_id call matched no
                // overload and returned PGRST202, so the RPC never ran and sharing a
                // post to a friend's DM silently failed for every friend.
                const { data: convResult, error: convErr } = await supabase.rpc('fn_get_or_create_conversation', {
                    p_user_id: currentUser.id,
                    p_other_user_id: friendId,
                });
                if (convErr) throw convErr;
                // The RPC returns jsonb { success, conversation_id, created } — not a
                // bare UUID. Treating the whole jsonb as a UUID (the previous bug) made
                // convId a truthy object, so the guard below passed and a malformed
                // conversationId flowed downstream. Fix mirrors
                // pages/api/messenger/start-conversation.js and
                // pages/api/club-arena/approve-cashout.js.
                if (!convResult?.success || !convResult?.conversation_id) {
                    throw new Error('Failed to get or create conversation');
                }
                const convId = convResult.conversation_id;

                // 2. Send via authenticated API (handles social_messages + participant verify + rate limit)
                const richPayload = buildRichSharePayload(post, postUrl, message.trim());
                const sendRes = await fetch('/api/messenger/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        conversationId: convId,
                        content: richPayload.text,
                        message_type: 'shared_post',
                        media_metadata: richPayload.media_metadata,
                    }),
                });
                if (!sendRes.ok) throw new Error(`Send failed: ${sendRes.status}`);

                successCount++;
            } catch (err) {
                console.warn('[SendToFriend] Error sending to friend:', friendId, err);
            }
        }

        if (successCount > 0) {
            // Update recent shares cache for optimized sorting later
            try {
                const cacheKey = `recent_shares_${currentUser.id}`;
                let recents = JSON.parse(localStorage.getItem(cacheKey) || '[]');
                recents = [...selected, ...recents.filter(id => !selected.has(id))].slice(0, 50);
                localStorage.setItem(cacheKey, JSON.stringify(recents));
            } catch (_) {}

            toast.success(`Sent to ${successCount} friend${successCount > 1 ? 's' : ''}!`);
            // Increment share count + trigger streak reward
            try {
                const token = getAccessToken();
                if (token) {
                    fetch('/api/social/share-count', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ post_id: post?.id, destination: 'messenger' }),
                    })
                    .then(r => r.json())
                    .then(data => {
                        if (data?.streak?.diamonds_awarded > 0) {
                            const streakDay = data.streak.streak_length;
                            toast.success(`💎 +${data.streak.diamonds_awarded} Diamond${data.streak.diamonds_awarded > 1 ? 's' : ''} — ${streakDay}-Day Share Streak!`);
                        }
                    })
                    .catch(() => {});
                }
            } catch (_) {}
            onShared?.('messenger');
            onClose();
        } else {
            toast.error('Could not send to any friends');
        }
        setSending(false);
    };

    return (
        <div>
            {/* Optional message */}
            <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Add A Message (Optional)..."
                style={{
                    width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`,
                    borderRadius: 8, fontSize: 14, marginBottom: 10, background: C.bg,
                    color: C.text, outline: 'none', boxSizing: 'border-box',
                }}
            />

            {/* Search friends */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search Friends..."
                    style={{
                        width: '100%', padding: '10px 12px 10px 36px', border: `1px solid ${C.border}`,
                        borderRadius: 8, fontSize: 14, background: C.bg,
                        color: C.text, outline: 'none', boxSizing: 'border-box',
                    }}
                />
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: C.textSec }}>🔍</span>
            </div>

            {/* Selected chips */}
            {selected.size > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {[...selected].map(id => {
                        const f = friends.find(fr => fr.id === id);
                        return (
                            <span key={id} onClick={() => toggleFriend(id)} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', background: C.blueLight, color: C.blue,
                                borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                                {f?.display_name || f?.username || 'Friend'} ✕
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Friends list */}
            <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 12 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: C.textSec, fontSize: 13 }}>Loading friends...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: C.textSec, fontSize: 13 }}>
                        {friends.length === 0 ? 'No friends yet. Add friends to share directly!' : 'No friends match your search.'}
                    </div>
                ) : (
                    filtered.map(f => {
                        const isSelected = selected.has(f.id);
                        return (
                            <button
                                key={f.id}
                                onClick={() => toggleFriend(f.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                    padding: '8px 12px', border: 'none', borderRadius: 8,
                                    background: isSelected ? C.blueLight : 'transparent',
                                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.bg; }}
                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <Avatar src={f.avatar_url} name={f.display_name || f.username} size={36} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                                        {f.display_name || f.username || 'Player'}
                                    </div>
                                    {f.username && f.display_name && (
                                        <div style={{ fontSize: 12, color: C.textSec }}>@{f.username}</div>
                                    )}
                                </div>
                                <div style={{
                                    width: 22, height: 22, borderRadius: '50%',
                                    border: `2px solid ${isSelected ? C.blue : C.border}`,
                                    background: isSelected ? C.blue : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                                }}>
                                    {isSelected ? '✓' : ''}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Send button */}
            <button
                onClick={handleSend}
                disabled={sending || selected.size === 0}
                style={{
                    width: '100%', padding: '12px 0', border: 'none', borderRadius: 8,
                    background: (sending || selected.size === 0) ? '#ccc' : C.blue,
                    color: '#fff', fontSize: 15, fontWeight: 600,
                    cursor: (sending || selected.size === 0) ? 'not-allowed' : 'pointer',
                }}
            >
                {sending ? 'Sending...' : `Send${selected.size > 0 ? ` To ${selected.size} Friend${selected.size > 1 ? 's' : ''}` : ''}`}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3: GROUPS / CLUBS
// ═══════════════════════════════════════════════════════════════════════════
function GroupsTab({ post, onClose }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(new Set());
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const fetchGroups = async () => {
            // Use synchronous getAuthUser — no banned auth.getSession()
            const currentUser = getAuthUser();
            if (!currentUser) { if (!cancelled) setLoading(false); return; }

            const cacheKey = `sp-groups-${currentUser.id}`;
            try {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Date.now() - parsed.ts < 60000) {
                        if (!cancelled) {
                            setGroups(parsed.data);
                            setLoading(false);
                        }
                        return;
                    }
                }
            } catch (_) {}

            try {
                // Fetch group conversations from social_* tables
                const sb = supabase;
                const { data, error } = await sb
                    .from('social_conversation_participants')
                    .select('conversation_id, social_conversations!inner(id, is_group, group_name)')
                    .eq('user_id', currentUser.id)
                    .eq('social_conversations.is_group', true);

                if (!error && data) {
                    const parsedGroups = data.map(d => ({
                        id: d.conversation_id,
                        name: d.social_conversations.group_name || 'Unnamed Group',
                        avatar_url: null,
                        type: 'group'
                    }));
                    if (!cancelled) {
                        setGroups(parsedGroups);
                        try {
                            sessionStorage.setItem(cacheKey, JSON.stringify({ data: parsedGroups, ts: Date.now() }));
                        } catch (_) {}
                    }
                }
            } catch (err) {
                console.warn('[GroupsTab] error fetching groups:', err);
            }
            if (!cancelled) setLoading(false);
        };
        fetchGroups();
        return () => { cancelled = true; };
    }, []);

    const handleSend = async () => {
        if (selected.size === 0) return;
        setSending(true);

        const token = getAccessToken();
        if (!token) { setSending(false); return; }

        const postUrl = `${window.location.origin}/hub/post/${post?.id}`;
        let successCount = 0;
        for (const groupId of selected) {
            try {
                // Send to group conversation via authenticated API (social_messages)
                const richPayload2 = buildRichSharePayload(post, postUrl, message.trim());
                const sendRes = await fetch('/api/messenger/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        conversationId: groupId,
                        content: richPayload2.text,
                        message_type: 'shared_post',
                        media_metadata: { ...richPayload2.media_metadata, shared_from: 'share_modal_group' },
                    }),
                });
                if (!sendRes.ok) throw new Error(`Group send failed: ${sendRes.status}`);

                successCount++;
            } catch (err) {
                console.warn(`[GroupsTab] error sending to ${groupId}:`, err);
            }
        }

        if (successCount > 0) {
            try {
                fetch('/api/social/share-count', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    body: JSON.stringify({ 
                        post_id: post.id,
                        destination: 'messenger_group',
                        success_count: successCount
                    })
                }).catch(() => {});
            } catch (_) {}

            setTimeout(() => { onClose(); }, 500);
        } else {
            setSending(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', padding: '12px 16px', gap: 12, borderBottom: `1px solid ${C.border}` }}>
                <Avatar src={null} size={40} />
                <textarea
                    placeholder="Say something about this in your group..."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    style={{
                        flex: 1, height: 60, border: 'none', background: 'transparent',
                        color: C.text, fontSize: 15, resize: 'none', outline: 'none'
                    }}
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }} className="hide-scroll">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: C.textSec, fontSize: 13 }}>Loading groups...</div>
                ) : groups.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
                        <div style={{ fontSize: 14 }}>You are not in any groups or clubs yet.</div>
                    </div>
                ) : (
                    groups.map(group => {
                        const isSelected = selected.has(group.id);
                        return (
                            <div
                                key={group.id}
                                onClick={() => {
                                    const next = new Set(selected);
                                    if (isSelected) next.delete(group.id);
                                    else next.add(group.id);
                                    setSelected(next);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 12,
                                    cursor: 'pointer', transition: 'background 0.15s',
                                    background: isSelected ? 'rgba(45, 136, 255, 0.08)' : 'transparent'
                                }}
                                onMouseEnter={e => !isSelected && (e.currentTarget.style.background = C.hover)}
                                onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                            >
                                <div style={{ position: 'relative' }}>
                                    <Avatar src={group.avatar_url} size={44} name={group.name} />
                                    <div style={{
                                        position: 'absolute', bottom: -2, right: -2, width: 16, height: 16,
                                        borderRadius: '50%', background: group.type === 'announcement' ? '#FF9800' : '#4CAF50',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 9, border: `2px solid ${C.bg}`
                                    }}>
                                        {group.type === 'announcement' ? '📢' : '👥'}
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{group.name}</div>
                                    <div style={{ fontSize: 13, color: C.textSec }}>
                                        {group.type === 'announcement' ? 'Announcement Channel' : 'Group Chat'}
                                    </div>
                                </div>
                                <div style={{
                                    width: 24, height: 24, borderRadius: '50%', border: `2px solid ${isSelected ? C.primary : C.border}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isSelected ? C.primary : 'transparent'
                                }}>
                                    {isSelected && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <button
                disabled={selected.size === 0 || sending}
                onClick={handleSend}
                style={{
                    margin: '12px 16px', padding: '12px', borderRadius: 8,
                    background: selected.size > 0 ? C.primary : C.hover,
                    color: selected.size > 0 ? '#fff' : C.textSec,
                    border: 'none', fontSize: 15, fontWeight: 600, cursor: selected.size > 0 ? 'pointer' : 'default',
                    transition: 'all 0.2s', opacity: sending ? 0.7 : 1
                }}
            >
                {sending ? 'Sending...' : `Send${selected.size > 0 ? ` To ${selected.size} Group${selected.size > 1 ? 's' : ''}` : ''}`}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4: WHO SHARED
// ═══════════════════════════════════════════════════════════════════════════
function WhoSharedTab({ post }) {
    const [data, setData] = useState({ sharers: [], streak: null, loading: true });

    useEffect(() => {
        if (!post?.id) return;
        let active = true;
        fetch(`/api/social/who-shared?post_id=${post.id}`)
            .then(res => res.json())
            .then(res => {
                if (active && res.success) setData({ sharers: res.sharers || [], streak: res.streak, loading: false });
            }).catch(() => { if (active) setData(p => ({ ...p, loading: false })); });
        return () => { active = false; };
    }, [post?.id]);

    if (data.loading) return <div style={{ padding: 20, textAlign: 'center', color: C.textSec, fontSize: 13 }}>Loading...</div>;

    return (
        <div>
            {data.streak?.is_active && (
                <div style={{ background: 'linear-gradient(135deg, #1877F2 0%, #22C55E 100%)', borderRadius: 10, padding: '12px 16px', color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 24 }}>🔥</div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{data.streak.streak_days} Day Share Streak!</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>You're on fire keeping the community active.</div>
                    </div>
                </div>
            )}
            
            <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 12 }}>
                {data.sharers.length > 0 ? 'Recently shared by' : 'No shares yet'}
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {data.sharers.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.bg, padding: '4px 8px 4px 4px', borderRadius: 20 }}>
                        <Avatar src={u.avatar_url} name={u.display_name || u.username} size={24} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{u.username}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════════════════════
export default function SharePostModal({ post, authorUsername, currentUser, onClose, onShared }) {
    const [tab, setTab] = useState('feed'); // 'feed' | 'messenger' | 'external'
    const [copied, setCopied] = useState(false);
    const modalRef = useRef(null);

    const postUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/hub/post/${post?.id || ''}`
        : '';
    const shareText = post?.content?.slice(0, 120) || 'Check out this post on Smarter.Poker';

    // Swipe-to-dismiss gesture state
    const [touchY, setTouchY] = useState(null);
    const [dragY, setDragY] = useState(0);

    const handleTouchStart = (e) => setTouchY(e.touches[0].clientY);
    const handleTouchMove = (e) => {
        if (touchY === null) return;
        const diff = e.touches[0].clientY - touchY;
        if (diff > 0) setDragY(diff);
    };
    const handleTouchEnd = () => {
        if (dragY > 100) onClose();
        else setDragY(0);
        setTouchY(null);
    };

    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleExternalShare = async (platform) => {
        try {
            await platform.action(postUrl, shareText);
            if (platform.id === 'copy') {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                toast.success('Link copied!');
            }
            // Increment share count
            try {
                const token = getAccessToken();
                if (token) {
                    fetch('/api/social/share-count', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ post_id: post?.id, destination: 'external', platform: platform.id }),
                    }).catch(() => {});
                }
            } catch (_) {}
            onShared?.(platform.id);
        } catch (err) {
            console.warn('Share error:', err);
        }
    };

    const TABS = [
        { id: 'feed', label: 'Feed', icon: '📝' },
        { id: 'messenger', label: 'Friend', icon: '💬' },
        { id: 'groups', label: 'Groups', icon: '👥' },
        { id: 'who', label: 'Stats', icon: '📊' },
        { id: 'external', label: 'More', icon: '🔗' },
    ];

    return (
        <div
            ref={modalRef}
            onClick={handleBackdrop}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
                zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                padding: '0', animation: 'shareFadeIn 0.2s ease',
            }}
        >
            <div 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    background: C.card, width: '100%', maxWidth: 520,
                    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', animation: 'shareSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    overflow: 'hidden', borderTopLeftRadius: 20, borderTopRightRadius: 20,
                    transform: dragY > 0 ? `translateY(${dragY}px)` : 'none',
                    transition: dragY === 0 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
                }}
            >
                {/* Swipe Handle Indicator */}
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
                    <div style={{ width: 40, height: 5, borderRadius: 3, background: C.border }} />
                </div>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`,
                }}>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>Share Post</h3>
                    <button
                        onClick={onClose}
                        aria-label="Close share modal"
                        style={{
                            width: 32, height: 32, borderRadius: '50%', border: 'none',
                            background: C.bg, cursor: 'pointer', fontSize: 16, color: C.textSec,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >✕</button>
                </div>

                {/* Tab bar */}
                <div style={{
                    display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bg,
                }}>
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            style={{
                                flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer',
                                background: 'transparent', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                                color: tab === t.id ? C.blue : C.textSec,
                                borderBottom: tab === t.id ? `3px solid ${C.blue}` : '3px solid transparent',
                                transition: 'all 0.2s', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 4,
                            }}
                        >
                            <span style={{ fontSize: 15 }}>{t.icon}</span> {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                    {tab === 'feed' && (
                        <ShareToFeedTab
                            post={post}
                            authorUsername={authorUsername}
                            currentUser={currentUser}
                            onClose={onClose}
                            onShared={onShared}
                        />
                    )}

                    {tab === 'messenger' && (
                        <SendToFriendTab
                            post={post}
                            authorUsername={authorUsername}
                            currentUser={currentUser}
                            onClose={onClose}
                            onShared={onShared}
                        />
                    )}

                    {tab === 'groups' && <GroupsTab post={post} onClose={onClose} />}
                    {tab === 'who' && <WhoSharedTab post={post} />}

                    {tab === 'external' && (
                        <div>
                            {/* URL Preview */}
                            <div style={{
                                padding: '10px 14px', background: C.bg, borderRadius: 10,
                                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                            }}>
                                <span style={{ fontSize: 16 }}>🔗</span>
                                <div style={{
                                    flex: 1, fontSize: 13, color: C.textSec, overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{postUrl}</div>
                                {copied && (
                                    <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Copied!</span>
                                )}
                            </div>

                            {/* External share buttons */}
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                {EXTERNAL_PLATFORMS.map(platform => (
                                    <button
                                        key={platform.id}
                                        onClick={() => handleExternalShare(platform)}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                                            gap: 6, padding: '12px 16px', background: 'none', border: 'none',
                                            cursor: 'pointer', borderRadius: 12, transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '50%',
                                            background: platform.color + '15',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 20, fontWeight: 800, color: platform.color,
                                            border: `2px solid ${platform.color}22`,
                                        }}>
                                            {platform.icon}
                                        </div>
                                        <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{platform.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes shareFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes shareScaleIn {
                    from { opacity: 0; transform: scale(0.92); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
