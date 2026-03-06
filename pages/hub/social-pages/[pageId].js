/**
 * Social Page Detail View - Full page with feed, followers, about, and content management
 * Supports venue, group, community, and brand pages
 */
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import SkeletonLight from '../../../src/components/ui/SkeletonLight';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', red: '#FA383E',
};

const timeAgo = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    const days = Math.floor(s / 86400);
    if (days < 30) return `${days}d ago`;
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function Avatar({ src, name, size = 40 }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            background: src ? `url(${src}) center/cover` : C.blue,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: size * 0.4,
        }}>
            {!src && (name || '?')[0].toUpperCase()}
        </div>
    );
}

function PostCard({ post, user, onLike, onComment }) {
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);

    const fetchComments = async () => {
        if (comments.length > 0) { setShowComments(!showComments); return; }
        setLoadingComments(true);
        try {
            const res = await fetch(`/api/social/pages/engage?post_id=${post.id}`);
            const json = await res.json();
            if (json.success) setComments(json.data || []);
        } catch (e) { console.error("[[pageId].js]", e); }
        setLoadingComments(false);
        setShowComments(true);
    };

    const submitComment = async () => {
        if (!commentText.trim() || !user) return;
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/engage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    action: 'comment', post_id: post.id,
                    user_id: user.id, content: commentText.trim(),
                }),
            });
            const json = await res.json();
            if (json.success) {
                setComments(prev => [...prev, json.data]);
                setCommentText('');
                onComment(post.id);
            }
        } catch (e) { console.error("[[pageId].js]", e); }
    };

    return (
        <div style={{
            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
            marginBottom: 12, overflow: 'hidden',
        }}>
            {/* Author */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                <Avatar src={post.author?.avatar_url} name={post.author?.full_name || post.author?.username} size={40} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                        {post.author?.full_name || post.author?.username || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec }}>
                        {timeAgo(post.created_at)}
                        {post.is_pinned && <span style={{ marginLeft: 8, color: C.blue, fontWeight: 600 }}>Pinned</span>}
                    </div>
                </div>
            </div>

            {/* Content */}
            {post.content && (
                <div style={{ padding: '0 16px 12px', fontSize: 14, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {post.content}
                </div>
            )}

            {/* Media */}
            {post.media_urls && post.media_urls.length > 0 && (
                <div style={{ padding: '0 0 0' }}>
                    {post.media_urls.slice(0, 4).map((url, i) => (
                        <img key={i} src={url} alt="" style={{
                            maxWidth: '100%', display: 'block', margin: '0 auto',
                            marginBottom: post.media_urls.length  loading="lazy"> 1 ? 2 : 0
                        }} />
                    ))}
                </div>
            )}

            {/* Stats */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px', fontSize: 13, color: C.textSec,
            }}>
                <span>{post.like_count || 0} likes</span>
                <span>{post.comment_count || 0} comments</span>
            </div>

            {/* Action Buttons */}
            <div style={{
                display: 'flex', borderTop: `1px solid ${C.border}`,
                borderBottom: showComments ? `1px solid ${C.border}` : 'none',
            }}>
                {[
                    { label: post.user_liked ? 'Liked' : 'Like', action: () => onLike(post.id), active: post.user_liked },
                    { label: 'Comment', action: fetchComments },
                    {
                        label: 'Share', action: () => {
                            const url = window.location.href;
                            if (navigator.share) {
                                navigator.share({ title: post.content?.slice(0, 60) || 'Post', url }).catch(() => { });
                            } else {
                                navigator.clipboard.writeText(url).then(() => alert('Link copied!')).catch(() => { });
                            }
                        }
                    },
                ].map((btn, i) => (
                    <button key={i} onClick={btn.action} style={{
                        flex: 1, padding: '10px 0', border: 'none', background: 'none',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        color: btn.active ? C.blue : C.textSec,
                        borderRight: i < 2 ? `1px solid ${C.border}` : 'none',
                    }}>
                        {btn.label}
                    </button>
                ))}
            </div>

            {/* Comments */}
            {showComments && (
                <div style={{ padding: '8px 16px 12px' }}>
                    {loadingComments ? (
                        <p style={{ fontSize: 13, color: C.textSec, textAlign: 'center' }}>Loading...</p>
                    ) : (
                        <>
                            {comments.map(c => (
                                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                    <Avatar src={c.author?.avatar_url} name={c.author?.full_name} size={28} />
                                    <div style={{
                                        background: C.bg, borderRadius: 12, padding: '8px 12px', flex: 1,
                                    }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                                            {c.author?.full_name || c.author?.username || 'Unknown'}
                                        </div>
                                        <div style={{ fontSize: 13, color: C.text }}>{c.content}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{timeAgo(c.created_at)}</div>
                                    </div>
                                </div>
                            ))}
                            {user && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <Avatar src={user.user_metadata?.avatar_url} name={user.user_metadata?.full_name || user.email} size={28} />
                                    <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                                        <input
                                            type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && submitComment()}
                                            placeholder="Write A Comment..."
                                            style={{
                                                flex: 1, padding: '8px 12px', borderRadius: 20,
                                                border: `1px solid ${C.border}`, fontSize: 13,
                                                fontFamily: 'inherit', outline: 'none', background: C.bg,
                                            }}
                                        />
                                        <button onClick={submitComment} disabled={!commentText.trim()} style={{
                                            padding: '6px 12px', borderRadius: 20, border: 'none',
                                            background: commentText.trim() ? C.blue : '#E4E6EB',
                                            color: commentText.trim() ? '#fff' : C.textSec,
                                            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                        }}>
                                            Post
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function SocialPageDetail() {
    const router = useRouter();
    if (!router.isReady) return null;
    const { pageId } = router.query;
    const [user, setUser] = useState(null);
    const [page, setPage] = useState(null);
    const [posts, setPosts] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('posts');
    const [isFollowing, setIsFollowing] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [newPost, setNewPost] = useState('');
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        const u = getAuthUser();
        if (u) setUser(u);
    }, []);

    const fetchPage = useCallback(async (signal) => {
        if (!pageId) return;
        setLoading(true);
        try {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId);
            const userParam = user?.id ? `&user_id=${user.id}` : '';

            let json;
            if (isUUID) {
                const res = await fetch(`/api/social/pages?id=${pageId}${userParam}`, { signal });
                json = await res.json();
            } else {
                const res = await fetch(`/api/social/pages?slug=${pageId}${userParam}`, { signal });
                json = await res.json();
            }

            if (json.success && json.data) {
                setPage(json.data);
                setIsFollowing(json.data.is_following || false);
                if (json.data.owner_id === user?.id) setUserRole('owner');
            }
        } catch (e) {
            if (e.name !== 'AbortError') console.error('Failed to fetch page:', e);
        }
        setLoading(false);
    }, [pageId, user]);

    const fetchPosts = useCallback(async (signal) => {
        if (!page?.id) return;
        try {
            const params = new URLSearchParams({ page_id: page.id, limit: '30' });
            if (user?.id) params.set('user_id', user.id);
            const res = await fetch(`/api/social/pages/posts?${params}`, { signal });
            const json = await res.json();
            if (json.success) setPosts(json.data || []);
        } catch (e) { console.error("[[pageId].js]", e); }
    }, [page, user]);

    const fetchFollowers = useCallback(async () => {
        if (!page?.id) return;
        try {
            const reqParam = user?.id ? `&requester_id=${user.id}` : '';
            const res = await fetch(`/api/social/pages/follow?page_id=${page.id}${reqParam}`);
            const json = await res.json();
            if (json.success) setFollowers(json.data || []);
        } catch (e) { console.error("[[pageId].js]", e); }
    }, [page, user]);

    useEffect(() => {
        const controller = new AbortController();
        fetchPage(controller.signal);
        return () => controller.abort();
    }, [fetchPage]);
    useEffect(() => {
        if (!page) return;
        const controller = new AbortController();
        fetchPosts(controller.signal);
        return () => controller.abort();
    }, [fetchPosts, page]);
    useEffect(() => { if (page && activeTab === 'members') fetchFollowers(); }, [fetchFollowers, page, activeTab]);

    const handleFollow = async () => {
        if (!user) { router.push('/auth/login'); return; }
        const newState = !isFollowing;
        setIsFollowing(newState);
        setPage(prev => prev ? {
            ...prev,
            follower_count: newState ? (prev.follower_count || 0) + 1 : Math.max(0, (prev.follower_count || 1) - 1)
        } : prev);

        try {
            const token = getAccessToken();
            await fetch('/api/social/pages/follow', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    page_id: page.id, user_id: user.id,
                    action: newState ? 'follow' : 'unfollow',
                }),
            });
        } catch (e) { console.error("[[pageId].js]", e); }
    };

    const handlePost = async () => {
        if (!newPost.trim() || !user || !page) return;
        setPosting(true);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/pages/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    page_id: page.id, author_id: user.id,
                    content: newPost.trim(), content_type: 'text',
                }),
            });
            const json = await res.json();
            if (json.success) {
                setNewPost('');
                fetchPosts();
            }
        } catch (e) { console.error("[[pageId].js]", e); }
        setPosting(false);
    };

    const handleLike = async (postId) => {
        if (!user) return;
        setPosts(prev => prev.map(p =>
            p.id === postId ? {
                ...p,
                user_liked: !p.user_liked,
                like_count: p.user_liked ? Math.max(0, (p.like_count || 1) - 1) : (p.like_count || 0) + 1
            } : p
        ));

        try {
            const token = getAccessToken();
            await fetch('/api/social/pages/engage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action: 'like', post_id: postId, user_id: user.id }),
            });
        } catch (e) { console.error("[[pageId].js]", e); }
    };

    const handleCommentAdded = (postId) => {
        setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p
        ));
    };

    if (loading) {
        return (
            <>
                <UniversalHeader />
                <div style={{ minHeight: '100vh', background: C.bg, padding: '76px 16px 80px', fontFamily: "var(--font-inter), -apple-system, sans-serif", maxWidth: 700, margin: '0 auto' }}>
                    <SkeletonLight variant="profile" />
                    <SkeletonLight variant="feed" rows={2} />
                </div>
            </>
        );
    }

    if (!page) {
        return (
            <>
                <UniversalHeader />
                <div style={{
                    minHeight: '100vh', background: C.bg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', paddingTop: 60,
                    fontFamily: "var(--font-inter), -apple-system, sans-serif" ,
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Page Not Found</h2>
                        <p style={{ color: C.textSec }}>This Page May Have Been Removed Or The Link Is Incorrect.</p>
                        <button onClick={() => router.push('/hub/social-pages')} style={{
                            marginTop: 16, padding: '10px 24px', background: C.blue, border: 'none',
                            borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        }}>
                            Browse Pages
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const typeColors = { venue: C.blue, group: C.green, community: '#8b5cf6', brand: '#F5A623' };
    const pageColor = typeColors[page.page_type || 'venue'] || C.blue;

    return (
        <>
            <SEOHead
                title="Social Page"
                description="View A Community Page On Smarter.Poker."
                noindex={true}
            />
            <UniversalHeader />

            <div style={{
                minHeight: '100vh', background: C.bg, paddingBottom: 72,
                fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif" ,
            }}>
                {/* Cover */}
                <div style={{
                    height: 200, background: page.cover_url
                        ? `url(${page.cover_url}) center/cover` : `linear-gradient(135deg, ${pageColor}, #8b5cf6)`,
                    paddingTop: 56,
                }} />

                {/* Page Info Header */}
                <div style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px' }}>
                        {/* Avatar and name */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: -40 }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: 16, border: `4px solid ${C.card}`,
                                background: page.avatar_url ? `url(${page.avatar_url}) center/cover` : pageColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 800, fontSize: 28, flexShrink: 0,
                            }}>
                                {!page.avatar_url && page.name[0].toUpperCase()}
                            </div>
                            <div style={{ paddingBottom: 8, flex: 1 }}>
                                <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {page.name}
                                    {page.is_verified && (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill={C.blue}>
                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                        </svg>
                                    )}
                                </h1>
                                <p style={{ fontSize: 14, color: C.textSec, margin: '2px 0 0' }}>
                                    {(page.page_type || 'page').charAt(0).toUpperCase() + (page.page_type || 'page').slice(1)}
                                    {page.category && page.category !== 'general' && ` - ${page.category}`}
                                    {' '} - {page.follower_count || 0} followers
                                </p>
                            </div>
                        </div>

                        {/* Description */}
                        {page.description && (
                            <p style={{ fontSize: 14, color: C.textSec, margin: '12px 0 0', lineHeight: 1.5 }}>
                                {page.description}
                            </p>
                        )}

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
                            <button onClick={handleFollow} style={{
                                padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 14,
                                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                background: isFollowing ? '#E4E6EB' : C.blue,
                                color: isFollowing ? C.text : '#fff',
                            }}>
                                {isFollowing ? 'Following' : 'Follow'}
                            </button>
                            {userRole === 'owner' && (
                                <button onClick={() => router.push(`/hub/social-pages/${pageId}/manage`)} style={{
                                    padding: '8px 20px', borderRadius: 8, border: 'none',
                                    background: '#E4E6EB', color: C.text, fontSize: 14,
                                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    Manage Page
                                </button>
                            )}
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${C.border}` }}>
                            {['posts', 'about', 'members'].map(t => (
                                <button key={t} onClick={() => setActiveTab(t)} style={{
                                    padding: '12px 16px', border: 'none', background: 'none',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    color: activeTab === t ? C.blue : C.textSec,
                                    borderBottom: `3px solid ${activeTab === t ? C.blue : 'transparent'}`,
                                    textTransform: 'capitalize',
                                }}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
                        {/* Main Content */}
                        <div style={{ minWidth: 0 }}>
                            {activeTab === 'posts' && (
                                <>
                                    {/* Create Post */}
                                    {user && (isFollowing || userRole === 'owner') && (
                                        <div style={{
                                            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                                            padding: 16, marginBottom: 16,
                                        }}>
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <Avatar
                                                    src={user.user_metadata?.avatar_url}
                                                    name={user.user_metadata?.full_name || user.email}
                                                    size={40}
                                                />
                                                <textarea
                                                    value={newPost}
                                                    onChange={e => setNewPost(e.target.value)}
                                                    placeholder={`Write something to ${page.name}...`}
                                                    style={{
                                                        flex: 1, padding: '10px 12px', borderRadius: 12,
                                                        border: `1px solid ${C.border}`, fontSize: 14,
                                                        fontFamily: 'inherit', outline: 'none', resize: 'none',
                                                        minHeight: 60, background: C.bg,
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                                <button onClick={handlePost} disabled={!newPost.trim() || posting} style={{
                                                    padding: '8px 20px', borderRadius: 8, border: 'none',
                                                    background: newPost.trim() && !posting ? C.blue : '#E4E6EB',
                                                    color: newPost.trim() && !posting ? '#fff' : C.textSec,
                                                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                }}>
                                                    {posting ? 'Posting...' : 'Post'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Posts Feed */}
                                    {posts.length === 0 ? (
                                        <div style={{
                                            textAlign: 'center', padding: '40px 20px', background: C.card,
                                            borderRadius: 12, border: `1px solid ${C.border}`,
                                        }}>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: C.text }}>No Posts Yet</p>
                                            <p style={{ fontSize: 13, color: C.textSec }}>Be The First To Share Something!</p>
                                        </div>
                                    ) : (
                                        posts.map(post => (
                                            <PostCard
                                                key={post.id}
                                                post={post}
                                                user={user}
                                                onLike={handleLike}
                                                onComment={handleCommentAdded}
                                            />
                                        ))
                                    )}
                                </>
                            )}

                            {activeTab === 'about' && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20,
                                }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>About</h2>

                                    {page.description && (
                                        <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 16 }}>
                                            {page.description}
                                        </p>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {page.location_city && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                                                </svg>
                                                <span style={{ fontSize: 14, color: C.text }}>{page.location_city}, {page.location_state}</span>
                                            </div>
                                        )}
                                        {page.website && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                                                </svg>
                                                <a href={page.website} target="_blank" rel="noopener noreferrer"
                                                    style={{ fontSize: 14, color: C.blue, textDecoration: 'none' }}>
                                                    {page.website.replace(/^https?:\/\//, '')}
                                                </a>
                                            </div>
                                        )}
                                        {page.contact_email && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                    <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,7 12,13 2,7" />
                                                </svg>
                                                <span style={{ fontSize: 14, color: C.text }}>{page.contact_email}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                                                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
                                                <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                            <span style={{ fontSize: 14, color: C.textSec }}>
                                                Created {new Date(page.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'members' && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20,
                                }}>
                                    <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>
                                        Members ({page.follower_count || 0})
                                    </h2>

                                    {followers.length === 0 ? (
                                        <p style={{ fontSize: 14, color: C.textSec, textAlign: 'center', padding: 20 }}>
                                            No members yet
                                        </p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {followers.map(f => (
                                                <div key={f.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                                                    borderBottom: `1px solid ${C.bg}`,
                                                }}>
                                                    <Avatar src={f.profile?.avatar_url} name={f.profile?.full_name || f.profile?.username} size={40} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                                                            {f.profile?.full_name || f.profile?.username || 'Unknown'}
                                                        </div>
                                                        <div style={{ fontSize: 12, color: C.textSec, textTransform: 'capitalize' }}>
                                                            {f.role} - Joined {timeAgo(f.created_at)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div style={{ position: 'sticky', top: 72 }}>
                            {/* Quick Info Card */}
                            <div style={{
                                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12,
                            }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>Page Info</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <div style={{ textAlign: 'center', padding: 8, background: C.bg, borderRadius: 8 }}>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{page.follower_count || 0}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Followers</div>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: 8, background: C.bg, borderRadius: 8 }}>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{page.post_count || 0}</div>
                                        <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Posts</div>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Members */}
                            {followers.length > 0 && (
                                <div style={{
                                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16,
                                }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>Recent Members</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {followers.slice(0, 10).map(f => (
                                            <Avatar key={f.id} src={f.profile?.avatar_url} name={f.profile?.full_name} size={36} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @media (max-width: 768px) {
                    div[style*="grid-template-columns: 1fr 320px"] {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </>
    );
}
