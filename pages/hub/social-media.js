/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌐 SMARTER.POKER SOCIAL HUB - SNGINE RECONSTRUCTION v3.0
 * /pages/hub/social-media.js
 * 
 * SOCIAL-ONLY REBUILD (No messaging module)
 * - Feed, Posts, Comments, Reactions
 * - User Search, Profile Discovery
 * - Zero seed data, Zero hardcoded contacts
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hpnqzvjknynwcpzzcdmo.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbnF6dmprbnnud2Nwenpjzg1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwMTQxNjYsImV4cCI6MjA2MjU5MDE2Nn0.yWbevMwO7h1mIFvqc0bDLX0bdyGB1tNB0h2bGDzzbrw';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 FACEBOOK-STYLE COLORS
// ═══════════════════════════════════════════════════════════════════════════
const FB = {
    blue: '#1877F2',
    blueHover: '#166FE5',
    bgMain: '#F0F2F5',
    bgCard: '#FFFFFF',
    textPrimary: '#050505',
    textSecondary: '#65676B',
    divider: '#CED0D4',
    green: '#42B72A',
    red: '#FA383E',
};

const styles = {
    page: {
        minHeight: '100vh',
        background: FB.bgMain,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    header: {
        background: FB.bgCard,
        padding: '8px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${FB.divider}`,
        position: 'sticky',
        top: 0,
        zIndex: 100,
    },
    logo: {
        fontSize: '24px',
        fontWeight: 700,
        color: FB.blue,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        textDecoration: 'none',
    },
    mainLayout: {
        display: 'grid',
        gridTemplateColumns: '280px 1fr 280px',
        maxWidth: '1200px',
        margin: '0 auto',
        gap: '16px',
        padding: '16px',
    },
    sidebar: {
        position: 'sticky',
        top: '80px',
        height: 'fit-content',
    },
    sidebarItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 12px',
        borderRadius: '8px',
        cursor: 'pointer',
        color: FB.textPrimary,
        fontWeight: 500,
        transition: 'background 0.2s',
    },
    feedContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
    },
    card: {
        background: FB.bgCard,
        borderRadius: '8px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        overflow: 'hidden',
    },
    postCreator: {
        padding: '16px',
    },
    postInput: {
        width: '100%',
        padding: '12px 16px',
        borderRadius: '20px',
        border: 'none',
        background: FB.bgMain,
        fontSize: '16px',
        resize: 'none',
        minHeight: '44px',
        outline: 'none',
    },
    postActions: {
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: `1px solid ${FB.divider}`,
        marginTop: '12px',
        paddingTop: '12px',
    },
    actionBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '8px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: FB.textSecondary,
        fontWeight: 500,
        fontSize: '14px',
    },
    postBtn: {
        padding: '8px 24px',
        borderRadius: '8px',
        border: 'none',
        background: FB.blue,
        color: 'white',
        fontWeight: 600,
        cursor: 'pointer',
    },
    postCard: {
        padding: '16px',
    },
    postHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
    },
    avatar: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: FB.blue,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 600,
        fontSize: '16px',
    },
    postContent: {
        fontSize: '15px',
        lineHeight: 1.5,
        color: FB.textPrimary,
        marginBottom: '12px',
    },
    postStats: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderTop: `1px solid ${FB.divider}`,
        borderBottom: `1px solid ${FB.divider}`,
        color: FB.textSecondary,
        fontSize: '14px',
    },
    postInteractions: {
        display: 'flex',
        justifyContent: 'space-around',
        padding: '4px 0',
    },
    interactionBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '4px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: FB.textSecondary,
        fontWeight: 500,
        fontSize: '14px',
        flex: 1,
        justifyContent: 'center',
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px 20px',
        color: FB.textSecondary,
    },
    searchBox: {
        display: 'flex',
        alignItems: 'center',
        background: FB.bgMain,
        borderRadius: '20px',
        padding: '8px 16px',
        flex: 1,
        maxWidth: '400px',
    },
    searchInput: {
        border: 'none',
        background: 'transparent',
        outline: 'none',
        fontSize: '14px',
        width: '100%',
        marginLeft: '8px',
    },
    userCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: `1px solid ${FB.divider}`,
        cursor: 'pointer',
    },
    rightSidebar: {
        position: 'sticky',
        top: '80px',
        height: 'fit-content',
    },
    rightCard: {
        background: FB.bgCard,
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 AVATAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function Avatar({ src, name, size = 40 }) {
    const initial = name?.[0]?.toUpperCase() || '?';
    return src ? (
        <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    ) : (
        <div style={{ ...styles.avatar, width: size, height: size, fontSize: size * 0.4 }}>{initial}</div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 POST CREATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function PostCreator({ user, onPost, isPosting }) {
    const [content, setContent] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!content.trim()) return;
        if (!user?.id) {
            setError('Please log in to post');
            return;
        }
        setError('');
        const success = await onPost(content);
        if (success) setContent('');
    };

    return (
        <div style={{ ...styles.card, ...styles.postCreator }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Avatar name={user?.name} src={user?.avatar} size={40} />
                <textarea
                    style={styles.postInput}
                    placeholder={user?.name ? `What's on your mind, ${user.name}?` : "What's on your mind?"}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={2}
                />
            </div>
            {error && <p style={{ color: FB.red, fontSize: '14px', margin: '8px 0 0 52px' }}>⚠️ {error}</p>}
            <div style={styles.postActions}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={styles.actionBtn}>📷 Photo</button>
                    <button style={styles.actionBtn}>🎥 Video</button>
                </div>
                <button
                    style={{ ...styles.postBtn, opacity: isPosting || !content.trim() ? 0.6 : 1 }}
                    onClick={handleSubmit}
                    disabled={isPosting || !content.trim()}
                >
                    {isPosting ? 'Posting...' : 'Post'}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📄 POST CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function PostCard({ post, currentUserId, onLike, onDelete }) {
    const [isLiked, setIsLiked] = useState(post.isLiked || false);
    const [likeCount, setLikeCount] = useState(post.likeCount || 0);

    const handleLike = async () => {
        const wasLiked = isLiked;
        setIsLiked(!wasLiked);
        setLikeCount(prev => wasLiked ? prev - 1 : prev + 1);
        try {
            await onLike(post.id);
        } catch {
            setIsLiked(wasLiked);
            setLikeCount(post.likeCount || 0);
        }
    };

    const canDelete = post.authorId === currentUserId;

    return (
        <div style={{ ...styles.card, ...styles.postCard }}>
            <div style={styles.postHeader}>
                <Avatar name={post.author?.name} src={post.author?.avatar} size={40} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: FB.textPrimary }}>
                        {post.author?.name || 'Anonymous'}
                        {post.author?.tier && (
                            <span style={{ fontSize: '12px', color: FB.blue, marginLeft: '8px' }}>
                                Lvl {post.author.tier}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '13px', color: FB.textSecondary }}>{post.timeAgo}</div>
                </div>
                {canDelete && (
                    <button
                        onClick={() => onDelete(post.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: FB.textSecondary }}
                        title="Delete post"
                    >
                        🗑️
                    </button>
                )}
            </div>
            <div style={styles.postContent}>{post.content}</div>
            {post.mediaUrls?.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                    {post.mediaUrls.map((url, i) => (
                        <img key={i} src={url} alt="" style={{ width: '100%', borderRadius: '8px', marginTop: '8px' }} />
                    ))}
                </div>
            )}
            <div style={styles.postStats}>
                <span>{likeCount > 0 ? `👍 ${likeCount}` : ''}</span>
                <span>{post.commentCount > 0 ? `${post.commentCount} comments` : ''}</span>
            </div>
            <div style={styles.postInteractions}>
                <button
                    style={{ ...styles.interactionBtn, color: isLiked ? FB.blue : FB.textSecondary }}
                    onClick={handleLike}
                >
                    👍 Like
                </button>
                <button style={styles.interactionBtn}>💬 Comment</button>
                <button style={styles.interactionBtn}>↗️ Share</button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 USER SEARCH RESULTS
// ═══════════════════════════════════════════════════════════════════════════
function UserSearchResults({ results, onViewProfile }) {
    if (!results || results.length === 0) return null;
    return (
        <div style={{ ...styles.card, marginTop: '16px' }}>
            <h4 style={{ padding: '12px 16px', margin: 0, borderBottom: `1px solid ${FB.divider}` }}>
                🔍 Search Results ({results.length})
            </h4>
            {results.map(user => (
                <div key={user.id} style={styles.userCard} onClick={() => onViewProfile?.(user)}>
                    <Avatar name={user.username} src={user.avatar} size={40} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>
                            {user.username}
                            {user.verified && <span style={{ color: FB.blue, marginLeft: '4px' }}>✓</span>}
                        </div>
                        {user.level && <div style={{ fontSize: '13px', color: FB.textSecondary }}>Level {user.level}</div>}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 RIGHT SIDEBAR - DISCOVERY (No fake contacts)
// ═══════════════════════════════════════════════════════════════════════════
function DiscoverySidebar({ suggestedUsers = [], onViewProfile }) {
    return (
        <aside style={styles.rightSidebar}>
            <div style={styles.rightCard}>
                <h4 style={{ margin: '0 0 12px 0', color: FB.textPrimary }}>Suggested Players</h4>
                {suggestedUsers.length === 0 ? (
                    <p style={{ color: FB.textSecondary, fontSize: '14px' }}>
                        No suggestions yet. Use search to find players!
                    </p>
                ) : (
                    suggestedUsers.slice(0, 5).map(user => (
                        <div
                            key={user.id}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', cursor: 'pointer' }}
                            onClick={() => onViewProfile?.(user)}
                        >
                            <Avatar name={user.username} src={user.avatar} size={36} />
                            <div>
                                <div style={{ fontWeight: 500, fontSize: '14px' }}>{user.username}</div>
                                {user.level && <div style={{ fontSize: '12px', color: FB.textSecondary }}>Level {user.level}</div>}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏠 MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function SocialMediaPage() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isPosting, setIsPosting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [suggestedUsers, setSuggestedUsers] = useState([]);
    const searchTimeoutRef = useRef(null);

    // ═══════════════════════════════════════════════════════════════════════
    // 🔐 AUTHENTICATION & INITIAL LOAD
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        async function init() {
            try {
                // Get current user
                const { data: { user } } = await supabase.auth.getUser();

                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('username, avatar_url, current_level')
                        .eq('id', user.id)
                        .single();

                    setCurrentUser({
                        id: user.id,
                        name: profile?.username || user.email?.split('@')[0] || 'Player',
                        avatar: profile?.avatar_url,
                        level: profile?.current_level || 1,
                    });
                }

                // Load feed
                await loadFeed();

                // Load suggested users (latest active)
                const { data: suggested } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, current_level')
                    .not('username', 'is', null)
                    .order('updated_at', { ascending: false })
                    .limit(10);

                if (suggested) {
                    setSuggestedUsers(suggested.map(u => ({
                        id: u.id,
                        username: u.username,
                        avatar: u.avatar_url,
                        level: u.current_level
                    })));
                }

            } catch (err) {
                console.error('Init error:', err);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // 📰 FEED LOADING
    // ═══════════════════════════════════════════════════════════════════════
    const loadFeed = async () => {
        try {
            // Try RPC first
            const { data: rpcData, error: rpcError } = await supabase.rpc('fn_get_social_feed_v2', {
                p_user_id: currentUser?.id || null,
                p_limit: 20,
                p_offset: 0,
                p_filter: 'recent'
            });

            if (!rpcError && rpcData?.length > 0) {
                setPosts(rpcData.map(formatPost));
                return;
            }
        } catch (e) {
            console.warn('RPC failed, using fallback:', e.message);
        }

        // Fallback: Direct query
        const { data, error } = await supabase
            .from('social_posts')
            .select(`
                id, content, content_type, media_urls, like_count, comment_count, created_at, author_id,
                author:profiles!author_id (username, avatar_url, current_level)
            `)
            .or('visibility.eq.public,visibility.is.null')
            .order('created_at', { ascending: false })
            .limit(20);

        if (!error && data) {
            setPosts(data.map(p => ({
                id: p.id,
                authorId: p.author_id,
                content: p.content,
                mediaUrls: p.media_urls || [],
                likeCount: p.like_count || 0,
                commentCount: p.comment_count || 0,
                timeAgo: getTimeAgo(p.created_at),
                isLiked: false,
                author: {
                    name: p.author?.username || 'Player',
                    avatar: p.author?.avatar_url,
                    tier: p.author?.current_level
                }
            })));
        }
    };

    const formatPost = (row) => ({
        id: row.post_id || row.id,
        authorId: row.author_id,
        content: row.content,
        mediaUrls: row.media_urls || [],
        likeCount: row.like_count || 0,
        commentCount: row.comment_count || 0,
        timeAgo: getTimeAgo(row.created_at),
        isLiked: row.is_liked || false,
        author: {
            name: row.author_username || 'Player',
            avatar: row.author_avatar,
            tier: row.author_level
        }
    });

    const getTimeAgo = (date) => {
        if (!date) return '';
        const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        return `${Math.floor(seconds / 86400)}d`;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ✍️ CREATE POST
    // ═══════════════════════════════════════════════════════════════════════
    const handleCreatePost = async (content) => {
        if (!currentUser?.id) return false;
        setIsPosting(true);

        try {
            // Try RPC first
            const { data: rpcData, error: rpcError } = await supabase.rpc('fn_create_social_post', {
                p_author_id: currentUser.id,
                p_content: content,
                p_content_type: 'text',
                p_media_urls: [],
                p_visibility: 'public',
                p_achievement_data: null
            });

            if (!rpcError && rpcData) {
                const newPost = {
                    id: rpcData.id,
                    authorId: currentUser.id,
                    content: content,
                    mediaUrls: [],
                    likeCount: 0,
                    commentCount: 0,
                    timeAgo: 'Just now',
                    isLiked: false,
                    author: {
                        name: currentUser.name,
                        avatar: currentUser.avatar,
                        tier: currentUser.level
                    }
                };
                setPosts(prev => [newPost, ...prev]);
                setIsPosting(false);
                return true;
            }

            // Fallback: Direct insert
            const { data, error } = await supabase
                .from('social_posts')
                .insert({
                    author_id: currentUser.id,
                    content: content,
                    content_type: 'text',
                    media_urls: [],
                    visibility: 'public'
                })
                .select()
                .single();

            if (error) throw error;

            setPosts(prev => [{
                id: data.id,
                authorId: currentUser.id,
                content: content,
                mediaUrls: [],
                likeCount: 0,
                commentCount: 0,
                timeAgo: 'Just now',
                isLiked: false,
                author: {
                    name: currentUser.name,
                    avatar: currentUser.avatar,
                    tier: currentUser.level
                }
            }, ...prev]);

            setIsPosting(false);
            return true;

        } catch (err) {
            console.error('Create post error:', err);
            setIsPosting(false);
            return false;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 👍 LIKE POST
    // ═══════════════════════════════════════════════════════════════════════
    const handleLike = async (postId) => {
        if (!currentUser?.id) return;

        const { data: existing } = await supabase
            .from('social_interactions')
            .select('id')
            .eq('post_id', postId)
            .eq('user_id', currentUser.id)
            .eq('interaction_type', 'like')
            .single();

        if (existing) {
            await supabase.from('social_interactions').delete().eq('id', existing.id);
        } else {
            await supabase.from('social_interactions').insert({
                post_id: postId,
                user_id: currentUser.id,
                interaction_type: 'like'
            });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 🗑️ DELETE POST
    // ═══════════════════════════════════════════════════════════════════════
    const handleDelete = async (postId) => {
        if (!currentUser?.id) return;
        if (!confirm('Delete this post?')) return;

        const { error } = await supabase.from('social_posts').delete().eq('id', postId);
        if (!error) {
            setPosts(prev => prev.filter(p => p.id !== postId));
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 🔍 USER SEARCH
    // ═══════════════════════════════════════════════════════════════════════
    const handleSearch = (query) => {
        setSearchQuery(query);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, username, avatar_url, current_level')
                .ilike('username', `%${query}%`)
                .limit(10);

            if (data) {
                setSearchResults(data.map(u => ({
                    id: u.id,
                    username: u.username,
                    avatar: u.avatar_url,
                    level: u.current_level
                })));
            }
        }, 300);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 🎨 RENDER
    // ═══════════════════════════════════════════════════════════════════════
    if (loading) {
        return (
            <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌐</div>
                    <p style={{ color: FB.textSecondary }}>Loading Social Hub...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Social Hub | Smarter.Poker</title>
                <meta name="description" content="Connect with poker players, share your wins, and build your network." />
            </Head>

            <div style={styles.page}>
                {/* Header */}
                <header style={styles.header}>
                    <Link href="/hub" style={styles.logo}>
                        ← Hub
                    </Link>
                    <div style={{ color: FB.red, fontWeight: 700, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔴 Social
                    </div>
                    <div style={styles.searchBox}>
                        <span>🔍</span>
                        <input
                            style={styles.searchInput}
                            placeholder="Search players..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {currentUser ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Avatar name={currentUser.name} src={currentUser.avatar} size={36} />
                                <span style={{ fontWeight: 500 }}>{currentUser.name}</span>
                            </div>
                        ) : (
                            <Link href="/login" style={{ color: FB.blue, fontWeight: 600, textDecoration: 'none' }}>
                                Log In
                            </Link>
                        )}
                    </div>
                </header>

                {/* Main Layout */}
                <div style={styles.mainLayout}>
                    {/* Left Sidebar */}
                    <nav style={styles.sidebar}>
                        {currentUser && (
                            <div style={styles.sidebarItem}>
                                <Avatar name={currentUser.name} src={currentUser.avatar} size={32} />
                                <span>{currentUser.name}</span>
                            </div>
                        )}
                        <div style={styles.sidebarItem}>👤 Profile</div>
                        <div style={styles.sidebarItem}>👥 Friends</div>
                        <div style={styles.sidebarItem}>🏆 Leaderboard</div>
                        <div style={styles.sidebarItem}>🎮 Tournaments</div>
                        <div style={styles.sidebarItem}>📚 GTO Training</div>
                    </nav>

                    {/* Main Feed */}
                    <main style={styles.feedContainer}>
                        {/* Search Results */}
                        <UserSearchResults results={searchResults} />

                        {/* Post Creator */}
                        {currentUser && (
                            <PostCreator user={currentUser} onPost={handleCreatePost} isPosting={isPosting} />
                        )}

                        {!currentUser && (
                            <div style={{ ...styles.card, padding: '20px', textAlign: 'center' }}>
                                <p style={{ color: FB.textSecondary, marginBottom: '12px' }}>
                                    Log in to create posts and interact with the community!
                                </p>
                                <Link href="/login" style={{ color: FB.blue, fontWeight: 600, textDecoration: 'none' }}>
                                    Log In →
                                </Link>
                            </div>
                        )}

                        {/* Posts Feed */}
                        {posts.length === 0 ? (
                            <div style={styles.emptyState}>
                                <div style={{ fontSize: '64px', marginBottom: '16px' }}>🌟</div>
                                <h2 style={{ color: FB.textPrimary, marginBottom: '8px' }}>No posts yet</h2>
                                <p>Be the first to share something with the community!</p>
                            </div>
                        ) : (
                            posts.map(post => (
                                <PostCard
                                    key={post.id}
                                    post={post}
                                    currentUserId={currentUser?.id}
                                    onLike={handleLike}
                                    onDelete={handleDelete}
                                />
                            ))
                        )}
                    </main>

                    {/* Right Sidebar - Discovery (NO FAKE CONTACTS) */}
                    <DiscoverySidebar suggestedUsers={suggestedUsers} />
                </div>
            </div>
        </>
    );
}
