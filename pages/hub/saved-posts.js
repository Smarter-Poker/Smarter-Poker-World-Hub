/**
 * 📌 SAVED POSTS PAGE
 * pages/hub/saved-posts.js
 * 
 * Dedicated page showing all posts the user has bookmarked/saved.
 * Reads from `social_interactions` where `interaction_type='bookmark'`
 * then fetches the corresponding posts.
 * 
 * SAFETY: This is a NEW page — no existing code is modified.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import PageTransition from '../../src/components/transitions/PageTransition';
import ArticleCard from '../../src/components/social/ArticleCard';
import HashtagRenderer from '../../src/components/social/HashtagRenderer';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../src/lib/authUtils';
import { busEmit } from '../../src/engine/EventBus';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', gold: '#FFB800',
};

const timeAgo = (date) => {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d ago`;
};

function SavedPostCard({ post, author, onUnsave, currentUserId }) {
    const [unsaving, setUnsaving] = useState(false);
    const [shareMsg, setShareMsg] = useState('');
    const isArticle = post.content_type === 'article' || post.content_type === 'link';

    const handleUnsave = async () => {
        setUnsaving(true);
        try {
            const { error: err_social_interactions_sxmtd } = await supabase
              .from('social_interactions')
              .delete()
                .eq('post_id', post.id)
                .eq('user_id', currentUserId)
                .eq('interaction_type', 'bookmark');
            if (err_social_interactions_sxmtd) console.warn('[Supabase] Silent mutation failed in social_interactions:', err_social_interactions_sxmtd.message);
            onUnsave?.(post.id);
        } catch (err) {
            console.warn('Unsave failed:', err);
        }
        setUnsaving(false);
    };

    const handleShare = async () => {
        const url = `${window.location.origin}/hub/user/${author?.username || ''}?post=${post.id}`;
        try {
            await navigator.clipboard.writeText(url);
            setShareMsg('Link Copied!');
            setTimeout(() => setShareMsg(''), 2000);
        } catch {
            setShareMsg('Copy Failed');
            setTimeout(() => setShareMsg(''), 2000);
        }
    };

    return (
        <div style={{
            background: C.card, borderRadius: 12, marginBottom: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden'
        }}>
            {/* Author header */}
            <div style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <img
                    src={author?.avatar_url || '/default-avatar.png'}
                    alt="avatar" loading="lazy"
                    style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div style={{ flex: 1 }}>
                    <Link href={`/hub/user/${author?.username}`} style={{ fontWeight: 600, fontSize: 14, color: C.text, textDecoration: 'none' }}>
                        {author?.full_name || author?.username || 'User'}
                    </Link>
                    <div style={{ fontSize: 12, color: C.textSec }}>
                        {timeAgo(post.created_at)}
                        {post.updated_at && post.updated_at !== post.created_at ? ' · Edited' : ''}
                    </div>
                </div>
                <button
                    onClick={handleUnsave}
                    disabled={unsaving}
                    style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: C.gold, fontSize: 20, padding: 8, opacity: unsaving ? 0.5 : 1
                    }}
                    title="Unsave Post"
                >🔖</button>
            </div>

            {/* Content */}
            {post.content && (
                <div style={{ padding: '0 12px 12px', fontSize: 15, color: C.text, lineHeight: 1.4 }}>
                    <HashtagRenderer text={post.content} />
                </div>
            )}

            {/* Media */}
            {isArticle ? (
                <ArticleCard
                    url={post.link_url}
                    title={post.link_title}
                    description={post.link_description}
                    image={post.link_image || post.media_urls?.[0]}
                    siteName={post.link_site_name}
                />
            ) : post.media_urls?.length > 0 && (
                <div>
                    {post.media_urls.length === 1 ? (
                        post.content_type === 'video' ? (
                            <video src={post.media_urls[0]} controls style={{ width: '100%', maxHeight: 400 }} />
                        ) : (
                            <img src={post.media_urls[0]} alt="" style={{ maxWidth: '100%', display: 'block' }} loading="lazy" />
                        )
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                            {post.media_urls.slice(0, 4).map((url, i) => (
                                <img key={i} src={url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} alt="" loading="lazy" />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex' }}>
                <Link
                    href={`/hub/user/${author?.username}?post=${post.id}`}
                    style={{
                        flex: 1, padding: 10, textAlign: 'center', color: C.textSec,
                        fontWeight: 500, fontSize: 13, textDecoration: 'none',
                        borderRight: `1px solid ${C.border}`
                    }}
                >View Post</Link>
                <button onClick={handleShare} style={{
                    flex: 1, padding: 10, border: 'none', background: 'transparent',
                    cursor: 'pointer', color: C.textSec, fontWeight: 500, fontSize: 13
                }}>{shareMsg || '↗️ Share'}</button>
            </div>
        </div>
    );
}

export default function SavedPostsPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [savedPosts, setSavedPosts] = useState([]);
    const [authorMap, setAuthorMap] = useState({});
    const [loading, setLoading] = useState(true);

    const loadSavedPosts = useCallback(async () => {
        try {
            const user = getAuthUser();
            if (!user) {
                setLoading(false);
                return;
            }
            setCurrentUser(user);

            // 1. Get bookmarked post IDs
            const { data: bookmarks, error: bmErr } = await supabase
                .from('social_interactions')
                .select('post_id, created_at')
                .eq('user_id', user.id)
                .eq('interaction_type', 'bookmark')
                .order('created_at', { ascending: false });

            if (bmErr || !bookmarks?.length) {
                setSavedPosts([]);
                setLoading(false);
                return;
            }

            const postIds = bookmarks.map(b => b.post_id);

            // 2. Fetch those posts
            const { data: posts, error: postErr } = await supabase
                .from('social_posts')
                .select('*')
                .in('id', postIds);

            if (postErr || !posts?.length) {
                setSavedPosts([]);
                setLoading(false);
                return;
            }

            // 3. Order posts by bookmark time (most recently saved first)
            const bookmarkOrder = {};
            bookmarks.forEach((b, i) => { bookmarkOrder[b.post_id] = i; });
            posts.sort((a, b) => (bookmarkOrder[a.id] ?? 999) - (bookmarkOrder[b.id] ?? 999));

            setSavedPosts(posts);

            // 4. Fetch author profiles
            const authorIds = [...new Set(posts.map(p => p.author_id).filter(Boolean))];
            if (authorIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', authorIds);

                if (profiles) {
                    const map = {};
                    profiles.forEach(p => { map[p.id] = p; });
                    setAuthorMap(map);
                }
            }
        } catch (err) {
            console.warn('Load saved posts error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadSavedPosts();
    }, [loadSavedPosts]);

    const handleUnsave = (postId) => {
        setSavedPosts(prev => prev.filter(p => p.id !== postId));
        // Notify other views that bookmark state changed
        try { busEmit.bookmarkChanged?.({ postId, bookmarked: false }); } catch { /* non-critical */ }
    };

    return (
        <>
            <SEOHead title="Saved Posts | Smarter.Poker" description="View your saved and bookmarked posts" />
            <UniversalHeader pageDepth={1} />
            <PageTransition>
                <div style={{ background: C.bg, minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', paddingTop: 72 }}>
                    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            marginBottom: 24
                        }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 12,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 24
                            }}>🔖</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Saved Posts</h1>
                                <div style={{ fontSize: 14, color: C.textSec }}>
                                    {savedPosts.length} {savedPosts.length === 1 ? 'item' : 'items'} saved
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        {loading ? (
                            <div>
                                {[1, 2, 3].map(i => (
                                    <div key={i} style={{
                                        height: 120, background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                                        backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                                        borderRadius: 8, marginBottom: 16
                                    }} />
                                ))}
                                <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
                            </div>
                        ) : !currentUser ? (
                            <div style={{
                                textAlign: 'center', padding: '60px 24px',
                                background: C.card, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>🔒</div>
                                <h3 style={{ margin: '0 0 8px', color: C.text, fontSize: 20 }}>Sign In Required</h3>
                                <p style={{ margin: 0, color: C.textSec, fontSize: 15 }}>
                                    Sign in to view your saved posts
                                </p>
                            </div>
                        ) : savedPosts.length === 0 ? (
                            <div style={{
                                textAlign: 'center', padding: '60px 24px',
                                background: C.card, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>🔖</div>
                                <h3 style={{ margin: '0 0 8px', color: C.text, fontSize: 20, fontWeight: 700 }}>No Saved Posts Yet</h3>
                                <p style={{ margin: '0 0 20px', color: C.textSec, fontSize: 15 }}>
                                    When you save posts from the feed, they will appear here
                                </p>
                                <Link
                                    href="/hub/social-media"
                                    style={{
                                        display: 'inline-block', padding: '10px 24px',
                                        background: C.blue, color: 'white', borderRadius: 8,
                                        textDecoration: 'none', fontWeight: 600, fontSize: 15
                                    }}
                                >Browse Feed</Link>
                            </div>
                        ) : (
                            savedPosts.map(post => (
                                <SavedPostCard
                                    key={post.id}
                                    post={post}
                                    author={authorMap[post.author_id]}
                                    onUnsave={handleUnsave}
                                    currentUserId={currentUser.id}
                                />
                            ))
                        )}
                    </div>
                </div>
                  <BottomNavBar />
    </PageTransition>
        </>
    );
}
