/**
 * 💬 SharedPostCard — Rich post embed rendered inside Messenger bubbles
 * src/components/social/SharedPostCard.jsx
 *
 * Renders when a message has media_metadata.shared_post_id set.
 * V2: Uses rich preview fields from media_metadata for instant rendering.
 * Falls back to a Supabase fetch only when rich fields are absent (legacy messages).
 */
import React, { useState, useEffect } from 'react';

let _supabase = null;
function getSB() {
    if (_supabase) return _supabase;
    if (typeof window === 'undefined') return null;
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    return _supabase;
}

export default function SharedPostCard({ postId, mediaMetadata, isOwn }) {
    // Use rich preview fields from media_metadata when available (zero latency)
    const richTitle   = mediaMetadata?.preview_title || null;
    const richDesc    = mediaMetadata?.preview_description || null;
    const richImage   = mediaMetadata?.preview_image || null;
    const richAuthor  = mediaMetadata?.author_name || null;
    const richAvatar  = mediaMetadata?.author_avatar || null;
    const richUrl     = mediaMetadata?.preview_url || (postId ? `/hub/post/${postId}` : null);
    const hasRichData = !!(richTitle || richDesc || richImage);

    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(!hasRichData); // skip loading if we have rich data

    useEffect(() => {
        if (!postId || hasRichData) return; // skip DB fetch if rich preview is available
        let cancelled = false;
        // Check sessionStorage cache first
        const cacheKey = `sp-shared-post-${postId}`;
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.ts < 300000) {
                    setPost(parsed.data);
                    setLoading(false);
                    return;
                }
            }
        } catch (_) {}

        const sb = getSB();
        if (!sb) { setLoading(false); return; }

        sb.from('social_posts')
            .select('id, content, media_urls, author_id, created_at')
            .eq('id', postId)
            .maybeSingle()
            .then(async ({ data: postData }) => {
                if (cancelled || !postData) { setLoading(false); return; }
                let author = null;
                if (postData.author_id) {
                    const { data: prof } = await sb
                        .from('profiles')
                        .select('username, display_name, avatar_url')
                        .eq('id', postData.author_id)
                        .maybeSingle();
                    author = prof;
                }
                const full = { ...postData, author };
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify({ data: full, ts: Date.now() }));
                } catch (_) {}
                if (!cancelled) { setPost(full); setLoading(false); }
            })
            .catch(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [postId, hasRichData]);

    const bg      = isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)';
    const border  = isOwn ? 'rgba(255,255,255,0.2)'  : 'rgba(0,0,0,0.1)';
    const textColor = isOwn ? '#fff'                 : '#050505';
    const subColor  = isOwn ? 'rgba(255,255,255,0.65)' : '#65676B';

    // ── Loading skeleton (only shown on legacy messages without rich fields)
    if (loading) {
        return (
            <div style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 10,
                background: bg, border: `1px solid ${border}`,
                fontSize: 12, color: subColor, fontStyle: 'italic',
            }}>Loading post preview...</div>
        );
    }

    // ── Determine which data source to use ──────────────────────────────
    const authorName  = richAuthor  || post?.author?.display_name || post?.author?.username || 'Player';
    const authorAvatar = richAvatar || post?.author?.avatar_url || null;
    const initials    = authorName.charAt(0).toUpperCase();
    const snippet     = richDesc    || (post?.content || '').slice(0, 160);
    const thumb       = richImage   || (post?.media_urls || [])[0];
    const postUrl     = richUrl     || (post?.id ? `/hub/post/${post.id}` : null);

    if (!postUrl) return null;

    return (
        <a
            href={postUrl}
            style={{ display: 'block', textDecoration: 'none', marginTop: 8 }}
            onClick={e => { e.preventDefault(); window.top.location.href = postUrl; }}
        >
            <div style={{
                border: `1px solid ${border}`, borderRadius: 12,
                overflow: 'hidden', background: bg,
                transition: 'opacity 0.15s',
            }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
                {/* Author row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 4px' }}>
                    {authorAvatar ? (
                        <img
                            src={authorAvatar}
                            alt={authorName}
                            style={{ width: 24, height: 24, minWidth: 24, minHeight: 24, aspectRatio: '1 / 1', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        />
                    ) : (
                        <div style={{
                            width: 24, height: 24, borderRadius: '50%', background: '#1877F2',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                        }}>{initials}</div>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 700, color: textColor }}>{authorName}</span>
                    <span style={{ fontSize: 10, color: subColor, marginLeft: 'auto' }}>Smarter.Poker</span>
                </div>

                {/* Thumbnail */}
                {thumb && (
                    <div style={{ width: '100%', maxHeight: 140, overflow: 'hidden' }}>
                        <img src={thumb} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                    </div>
                )}

                {/* Snippet */}
                {snippet && (
                    <div style={{ padding: '6px 10px 4px', fontSize: 12, color: textColor, lineHeight: 1.4 }}>
                        {snippet}{snippet.length >= 160 ? '…' : ''}
                    </div>
                )}

                {/* CTA */}
                <div style={{
                    padding: '6px 10px 8px',
                    fontSize: 11, fontWeight: 600, color: '#1877F2',
                }}>View Post →</div>
            </div>
        </a>
    );
}
