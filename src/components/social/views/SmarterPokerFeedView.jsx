/**
 * 🌐 smarter-poker-style NEWS FEED VIEW
 * src/components/social/views/SmarterPokerFeedView.jsx
 * 
 * Complete SmarterPoker-clone layout using the unified Shell
 * Connected to Real SocialService
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SPPostCard, FBStoriesRow, SP_COLORS, SPAvatar } from '../SmarterPokerStyleCard';
import { EnhancedPostCreator } from '../EnhancedPostCreator';
import { ReelsCarousel } from '../SmarterPokerReels';
import { FriendsList } from '../SmarterPokerFriends';
import { useSupabase } from '../../../providers/SupabaseProvider';
import { SocialService } from '../../../services/SocialService';
import { eventBus, EventType, busEmit } from '../../../engine/EventBus';
import TrendingPosts from '../TrendingPosts';
import FeedFilterTabs from '../FeedFilterTabs';
import GhostPostCard from '../GhostPostCard';
import UploadRecoveryBanner from '../UploadRecoveryBanner';

// ═══════════════════════════════════════════════════════════════════════════
// 📱 LEFT SIDEBAR (Shortcuts)
// ═══════════════════════════════════════════════════════════════════════════

const FBLeftSidebar = ({ currentUser }) => (
    <aside className="sp-sidebar-left">
        <div className="sidebar-item">
            <SPAvatar src={currentUser?.avatar} size={36} />
            <span>{currentUser?.name || 'You'}</span>
        </div>

        <div className="sidebar-item">
            <span className="sidebar-icon">👥</span>
            <span>Friends</span>
        </div>

        <div className="sidebar-item">
            <span className="sidebar-icon">♠️</span>
            <span>Clubs</span>
        </div>

        <div className="sidebar-item">
            <span className="sidebar-icon">📺</span>
            <span>Watch</span>
            <span className="new-badge">NEW</span>
        </div>

        <div className="sidebar-item">
            <span className="sidebar-icon">🏆</span>
            <span>Tournaments</span>
        </div>

        <div className="sidebar-item">
            <span className="sidebar-icon">🧠</span>
            <span>GTO Training</span>
        </div>

        <div className="sidebar-divider" />

        <h4 className="sidebar-heading">Your Shortcuts</h4>

        <div className="sidebar-item">
            <span className="sidebar-icon group">♠️</span>
            <span>MTT Strategy</span>
        </div>

        <style>{`
            .sp-sidebar-left {
                position: fixed;
                top: 56px;
                left: 0;
                width: 280px;
                height: calc(100vh - 56px);
                padding: 16px 8px;
                overflow-y: auto;
            }
            
            .sidebar-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px;
                border-radius: 8px;
                color: ${SP_COLORS.textPrimary};
                font-size: 15px;
                font-weight: 500;
                cursor: pointer;
            }

            .sidebar-item:hover {
                background: ${SP_COLORS.bgHover};
            }

            .sidebar-icon {
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                border-radius: 8px;
            }
            
            .sidebar-icon.group { background: ${SP_COLORS.bgMain}; }

            .new-badge {
                margin-left: auto;
                background: #E41E3F;
                color: white;
                font-size: 11px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 4px;
            }

            .sidebar-divider {
                height: 1px;
                background: ${SP_COLORS.divider};
                margin: 12px 8px;
            }

            .sidebar-heading {
                padding: 8px;
                color: ${SP_COLORS.textSecondary};
                font-size: 17px;
                font-weight: 600;
                margin: 0;
            }

            @media (max-width: 1100px) {
                .sp-sidebar-left { display: none; }
            }
        `}</style>
    </aside>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📱 RIGHT SIDEBAR (Contacts & Sponsored)
// ═══════════════════════════════════════════════════════════════════════════

const FBRightSidebar = ({ onlineContacts = [], onMessage }) => (
    <aside className="sp-sidebar-right">
        <div className="sidebar-section">
            <h4 className="section-heading">Sponsored</h4>
            <div className="sponsored-item">
                <img src="/ads/poker-book.jpg" alt="Ad" onError={(e) => e.target.style.display = 'none'} />
                <div className="sponsored-text">
                    <span className="sponsored-title">Master GTO Poker</span>
                    <span className="sponsored-link">Gtotraining.com</span>
                </div>
            </div>
        </div>

        <div className="sidebar-divider" />

        {/* Trending Posts Widget */}
        <TrendingPosts limit={5} />

        <div className="sidebar-divider" />

        <div className="sidebar-section">
            <div className="section-header">
                <h4 className="section-heading">Contacts</h4>
                <div className="section-actions">
                    <button>🔍</button>
                    <button>⋯</button>
                </div>
            </div>

            <FriendsList
                friends={onlineContacts}
                onMessage={onMessage}
            />
        </div>

        <style>{`
            .sp-sidebar-right {
                position: fixed;
                top: 56px;
                right: 0;
                width: 280px;
                height: calc(100vh - 56px);
                padding: 16px 8px;
                overflow-y: auto;
            }

            .sidebar-section { margin-bottom: 8px; }

            .section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-right: 8px;
            }

            .section-heading {
                padding: 8px;
                color: ${SP_COLORS.textSecondary};
                font-size: 17px;
                font-weight: 600;
                margin: 0;
            }
            
            .section-actions button {
                border: none;
                background: none;
                cursor: pointer;
                color: ${SP_COLORS.textSecondary};
            }

            .sponsored-item {
                display: flex;
                gap: 12px;
                padding: 8px;
                cursor: pointer;
                border-radius: 8px;
            }
            .sponsored-item:hover { background: ${SP_COLORS.bgHover}; }

            .sponsored-item img {
                width: 100px;
                height: 100px;
                border-radius: 8px;
                object-fit: cover;
            }

            .sponsored-text {
                display: flex;
                flex-direction: column;
                justify-content: center;
            }

            .sponsored-title { font-weight: 500; color: ${SP_COLORS.textPrimary}; }
            .sponsored-link { font-size: 13px; color: ${SP_COLORS.textSecondary}; }

            .sidebar-divider {
                height: 1px;
                background: ${SP_COLORS.divider};
                margin: 12px 8px;
            }

            @media (max-width: 1100px) {
                .sp-sidebar-right { display: none; }
            }
        `}</style>
    </aside>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📰 MAIN FEED VIEW
// ═══════════════════════════════════════════════════════════════════════════

export const SmarterPokerFeedView = ({ onNavigate, onOpenChat }) => {
    // Hooks
    const { user: authUser, profile: authProfile, supabase } = useSupabase();

    // Create SocialService instance (memoized to prevent new instance every render)
    const socialService = React.useMemo(() => supabase ? new SocialService(supabase) : null, [supabase]);

    // Construct currentUser object for UI
    const currentUser = authUser ? {
        id: authUser.id,
        name: authProfile?.full_name || authProfile?.username || authUser.email,
        avatar: authProfile?.avatar_url || null,
        online: true
    } : null;

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [feedFilter, setFeedFilter] = useState('recent');

    // Mock Data for non-connected parts
    const [stories] = useState([]);

    const [reels] = useState([]);

    const onlineContacts = [];

    // ─────────────────────────────────────────────────────────────────────────
    // 🔄 DATA FETCHING
    // ─────────────────────────────────────────────────────────────────────────

    const loadFeed = useCallback(async () => {
        if (!socialService || !currentUser?.id) {
            // No service or user — show empty state, not mock data
            setPosts([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const { posts: newPosts } = await socialService.getFeed({
                userId: currentUser.id,
                filter: feedFilter
            });
            setPosts(newPosts || []);
        } catch (error) {
            console.warn("Failed to load feed", error);
            setPosts([]);
        } finally {
            setLoading(false);
        }
    }, [socialService, currentUser?.id, feedFilter]);

    useEffect(() => {
        loadFeed();
    }, [loadFeed]);

    // Listen for new posts from other components via EventBus
    // Delayed fallback: subscribeFeed handles real-time INSERTs instantly,
    // so this is a safety net in case Realtime is delayed or disconnected
    useEffect(() => {
        let debounceTimer = null;
        const unsub = eventBus.on(EventType.SOCIAL_POST_CREATED, () => {
        const unsub_refresh = eventBus.on(EventType.SOCIAL_FEED_REFRESHED, () => {
            // Debounce: clear any pending timer before setting a new one
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadFeed();
                debounceTimer = null;
            }, 3000);
        });
        return () => {
            if (unsub) unsub();
            if (unsub) unsub_refresh();
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    }, [loadFeed]);

    // Real-time Supabase subscription for new posts
    useEffect(() => {
        if (!socialService) return;
        const unsubscribe = socialService.subscribeFeed(
            (newPost) => {
                // Prepend new post from real-time INSERT
                setPosts(prev => {
                    if (prev.some(p => p.id === newPost.id)) return prev;
                    return [newPost, ...prev];
                });
            },
            (updatedPost) => {
                // Update existing post from real-time UPDATE
                setPosts(prev => prev.map(p => p.id === updatedPost.id ? { ...p, ...updatedPost } : p));
            }
        );
        return () => { if (unsubscribe) unsubscribe(); };
    }, [socialService]);

    // Listen for comment events to update comment counts
    useEffect(() => {
        const unsub = eventBus.on(EventType.SOCIAL_COMMENT_ADDED, (event) => {
            const { postId } = event?.payload || {};
            if (postId) {
                setPosts(prev => prev.map(p => {
                    if (p.id === postId) {
                        return {
                            ...p,
                            engagement: {
                                ...p.engagement,
                                commentCount: (p.engagement?.commentCount || 0) + 1
                            }
                        };
                    }
                    return p;
                }));
            }
        });
        return () => { if (unsub) unsub(); };
    }, []);

    // Listen for reaction events from OTHER components/users (Cross-Component Sync)
    // NOTE: Skip events from the current user — handleLike already did the optimistic update.
    // Processing it again would double-count the like.
    useEffect(() => {
        const unsub = eventBus.on(EventType.SOCIAL_POST_LIKED, (event) => {
            const { postId, userId, added, reactionType } = event?.payload || {};
            if (!postId || userId === currentUser?.id) return; // Skip self — already handled optimistically
            
            setPosts(prev => prev.map(p => {
                if (p.id === postId) {
                    let newLikeCount = p.engagement?.likeCount || 0;
                    if (added) newLikeCount += 1;
                    else newLikeCount = Math.max(0, newLikeCount - 1);

                    return {
                        ...p,
                        engagement: { ...p.engagement, likeCount: newLikeCount }
                    };
                }
                return p;
            }));
        });
        return () => { if (unsub) unsub(); };
    }, [currentUser?.id]);

    // ─────────────────────────────────────────────────────────────────────────
    // ✋ INTERACTION HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    const handleLike = async (postId, reactionType = 'like') => {
        if (!socialService || !currentUser) return;

        // Optimistic UI Update
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const isLiked = p.isLiked;
                const isSwap = isLiked && reactionType !== (p.reactionType || 'like');

                if (isSwap) {
                    // Swap: keep liked, just change type. Count stays same.
                    return { ...p, reactionType };
                }
                // Toggle: flip liked state
                return {
                    ...p,
                    isLiked: !isLiked,
                    reactionType: !isLiked ? reactionType : p.reactionType,
                    engagement: {
                        ...p.engagement,
                        likeCount: isLiked ? (p.engagement?.likeCount || 0) - 1 : (p.engagement?.likeCount || 0) + 1
                    }
                };
            }
            return p;
        }));

        try {
            const { added, type } = await socialService.toggleReaction(postId, currentUser.id, reactionType);
            // Only emit bus event when like_count changes (added=true/false). Skip swaps (added=null).
            if (added !== null && added !== undefined) {
                busEmit.socialPostLiked(postId, currentUser.id, { added, reactionType: type });
            }
        } catch (error) {
            console.warn('Reaction failed:', error);
            // Revert optimistic update
            loadFeed();
        }
    };

    const handleComment = async (postId, text) => {
        if (!socialService || !currentUser) return;
        await socialService.createComment({ postId, authorId: currentUser.id, content: text });
        // Note: SocialService.createComment already emits SOCIAL_COMMENT_ADDED internally
    };

    const handleLoadComments = async (postId) => {
        if (!socialService) return [];
        return await socialService.getComments(postId);
    };

    const handleDeletePost = async (postId) => {
        if (!socialService) return;
        try {
            await socialService.deletePost(postId);
            setPosts(prev => prev.filter(p => p.id !== postId));
        } catch (err) {
            console.warn('Delete failed:', err);
        }
    };

    return (
        <div className="sp-feed-view-container">
            <FBLeftSidebar currentUser={currentUser} />

            <main className="sp-feed-center">
                <FBStoriesRow stories={stories} currentUser={currentUser} />

                <FeedFilterTabs
                    activeFilter={feedFilter}
                    onFilterChange={(f) => { setFeedFilter(f); }}
                />

                <EnhancedPostCreator
                    user={currentUser}
                    inline={true}
                    onPostCreated={(newPost) => {
                        // Dedup: WS subscribeFeed may have already prepended this post
                        setPosts(prev => {
                            if (prev.some(p => p.id === newPost?.id)) return prev;
                            return [newPost, ...prev];
                        });
                    }}
                />

                {/* Upload Recovery — shows if a previous upload was interrupted */}
                <UploadRecoveryBanner />

                {/* Ghost Post — optimistic uploading placeholder */}
                <GhostPostCard user={currentUser} />

                {/* Reels Section (Inserted into feed) */}
                <ReelsCarousel reels={reels} onViewAll={() => { }} currentUser={currentUser} />

                {loading ? (
                    <div style={{ padding: '0 4px' }}>
                        {[1,2,3].map(i => (
                            <div key={i} style={{
                                height: 140, background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                                backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                                borderRadius: 8, marginBottom: 16
                            }} />
                        ))}
                        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
                    </div>
                ) : (
                    posts.map(post => (
                        <SPPostCard
                            key={post.id}
                            post={post}
                            user={post.user || post.author}
                            onLike={handleLike}
                            onSubmitComment={handleComment}
                            onLoadComments={handleLoadComments}
                            onDeletePost={handleDeletePost}
                            currentUserId={currentUser?.id}
                        />
                    ))
                )}

                {/* Empty state when no posts after loading */}
                {!loading && posts.length === 0 && (
                    <div style={{
                        textAlign: 'center', padding: '48px 24px',
                        background: SP_COLORS.bgWhite, borderRadius: 8,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginTop: 16
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📝</div>
                        <h3 style={{ margin: '0 0 8px', color: SP_COLORS.textPrimary, fontSize: 20, fontWeight: 700 }}>No Posts Yet</h3>
                        <p style={{ margin: 0, color: SP_COLORS.textSecondary, fontSize: 15 }}>Be the first to share something with the community</p>
                    </div>
                )}
            </main>

            <FBRightSidebar onlineContacts={onlineContacts} onMessage={onOpenChat} />

            <style>{`
                .sp-feed-view-container {
                    display: flex;
                    justify-content: center;
                }
                .sp-feed-center {
                    max-width: 680px;
                    width: 100%;
                    padding: 24px 16px;
                }

                @media (min-width: 1100px) {
                    .sp-feed-center {
                        margin-left: 280px;
                        margin-right: 280px;
                        max-width: 680px;
                    }
                }
            `}</style>
        </div>
    );
};

export default SmarterPokerFeedView;
