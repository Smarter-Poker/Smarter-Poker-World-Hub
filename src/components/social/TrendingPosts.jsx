/**
 * 🔥 TRENDING POSTS WIDGET
 * src/components/social/TrendingPosts.jsx
 * 
 * Sidebar widget showing most-engaged posts from the last 24 hours.
 * Queries social_posts ordered by (like_count + comment_count + share_count).
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const C = {
    card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', bg: '#F0F2F5',
};

export default function TrendingPosts({ limit = 5 }) {
    const [trending, setTrending] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTrending = async () => {
            try {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

                const { data, error } = await supabase
                    .from('social_posts')
                    .select('id, content, author_id, like_count, comment_count, share_count, created_at, content_type')
                    .gte('created_at', oneDayAgo)
                    .eq('is_deleted', false)
                    .or('visibility.eq.public,visibility.is.null')
                    .order('like_count', { ascending: false })
                    .limit(limit);

                if (!error && data) {
                    // Fetch author profiles
                    const authorIds = [...new Set(data.map(p => p.author_id).filter(Boolean))];
                    let authorMap = {};
                    if (authorIds.length > 0) {
                        const { data: profiles } = await supabase
                            .from('profiles')
                            .select('id, username, full_name, avatar_url')
                            .in('id', authorIds);
                        if (profiles) {
                            profiles.forEach(p => { authorMap[p.id] = p; });
                        }
                    }

                    setTrending(data.map(p => ({
                        ...p,
                        author: authorMap[p.author_id] || null,
                        engagement: (p.like_count || 0) + (p.comment_count || 0) + (p.share_count || 0)
                    })).sort((a, b) => b.engagement - a.engagement));
                }
            } catch (err) {
                console.warn('Trending fetch error:', err);
            }
            setLoading(false);
        };

        fetchTrending();
    }, [limit]);

    if (loading) {
        return (
            <div style={{ background: C.card, borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🔥</span> Trending
                </div>
                {[1, 2, 3].map(i => (
                    <div key={i} style={{
                        height: 48, background: C.bg, borderRadius: 6, marginBottom: 8,
                        animation: 'trendShimmer 1.5s infinite',
                        backgroundImage: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                        backgroundSize: '200% 100%'
                    }} />
                ))}
                <style>{`@keyframes trendShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            </div>
        );
    }

    if (trending.length === 0) return null; // Don't show if no trending posts

    return (
        <div style={{
            background: C.card, borderRadius: 8, padding: 16, marginBottom: 16,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
        }}>
            <div style={{
                fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8
            }}>
                <span>🔥</span> Trending Now
            </div>

            {trending.map((post, i) => (
                <a
                    key={post.id}
                    href={`/hub/user/${post.author?.username || ''}?post=${post.id}`}
                    style={{
                        display: 'flex', gap: 10, padding: '10px 8px', borderRadius: 8,
                        textDecoration: 'none', color: C.text, transition: 'background 0.15s',
                        cursor: 'pointer', alignItems: 'flex-start'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{
                        fontSize: 18, fontWeight: 800, color: C.blue, minWidth: 24, textAlign: 'center',
                        lineHeight: '24px'
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}>
                            {post.content?.slice(0, 80) || (post.content_type === 'video' ? 'Video Post' : 'Post')}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>
                            {post.author?.full_name || post.author?.username || 'User'} · {post.engagement} engagements
                        </div>
                    </div>
                </a>
            ))}
        </div>
    );
}
