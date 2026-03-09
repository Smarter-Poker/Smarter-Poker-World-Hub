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
import { useSupabase } from '../../providers/SupabaseProvider';
import { SocialService } from '../../services/SocialService';

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
                <img src="/ads/poker-book.jpg" alt="Ad" onError={(e) => e.target.src = 'https://picsum.photos/100/100'} />
                <div className="sponsored-text">
                    <span className="sponsored-title">Master GTO Poker</span>
                    <span className="sponsored-link">Gtotraining.com</span>
                </div>
            </div>
        </div>

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

    // Create SocialService instance
    const socialService = supabase ? new SocialService(supabase) : null;

    // Construct currentUser object for UI
    const currentUser = authUser ? {
        id: authUser.id,
        name: authProfile?.username || authUser.email,
        avatar: authProfile?.avatar_url || 'https://picsum.photos/100/100',
        online: true
    } : null;

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Mock Data for non-connected parts
    const [stories] = useState([
        { thumbnail: 'https://picsum.photos/200/350?1', user: { firstName: 'Mike' }, viewed: false },
        { thumbnail: 'https://picsum.photos/200/350?2', user: { firstName: 'Sarah' }, viewed: false },
        { thumbnail: 'https://picsum.photos/200/350?3', user: { firstName: 'Jen' }, viewed: true },
        { thumbnail: 'https://picsum.photos/200/350?4', user: { firstName: 'Tom' }, viewed: true },
    ]);

    const [reels] = useState([
        { thumbnail: 'https://picsum.photos/200/350?10', description: 'Insane All-In Moment!', viewCount: '12K' },
        { thumbnail: 'https://picsum.photos/200/350?11', description: 'Poker Vlog #42', viewCount: '5K' },
        { thumbnail: 'https://picsum.photos/200/350?12', description: 'How to Play A-Ks', viewCount: '25K' },
    ]);

    const onlineContacts = [
        { id: 101, name: 'John Shark', online: true, tier: 'shark' },
        { id: 102, name: 'Sarah GTO', online: true, tier: 'gto_master' },
        { id: 103, name: 'Mike Grinder', online: true, tier: 'grinder' },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // 🔄 DATA FETCHING
    // ─────────────────────────────────────────────────────────────────────────

    const loadFeed = useCallback(async () => {
        if (!socialService || !currentUser?.id) {
            // Fallback to mock data if service not available
            setPosts([
                {
                    id: 1,
                    content: "Just crushed it at the 2/5 NL tables! 🔥 That river bluff was chef's kiss 👨‍🍳",
                    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
                    engagement: { likeCount: 47, commentCount: 12, shareCount: 3 },
                    handData: {
                        stakes: '$2/$5 NL',
                        won: true,
                        amount: 1250,
                        heroCards: ['A♠', 'K♠'],
                        board: ['Q♠', 'J♠', '4♥', '8♦', '2♣']
                    },
                    author: { username: 'Mike Thompson', tier: 'SHARK', isVerified: true },
                    comments: [{ author: { username: 'Sarah G' }, content: 'Nice hand! That river was scary though 😅' }]
                }
            ]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const { posts: newPosts } = await socialService.getFeed({
                userId: currentUser.id,
                filter: 'recent'
            });
            setPosts(newPosts || []);
        } catch (error) {
            console.error("Failed to load feed", error);
            setPosts([]);
        } finally {
            setLoading(false);
        }
    }, [socialService, currentUser?.id]);

    useEffect(() => {
        loadFeed();
    }, [loadFeed]);

    // ─────────────────────────────────────────────────────────────────────────
    // ✋ INTERACTION HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    const handleLike = async (postId) => {
        if (!socialService || !currentUser) return;

        // Optimistic UI Update
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const isLiked = p.isLiked;
                return {
                    ...p,
                    isLiked: !isLiked,
                    engagement: {
                        ...p.engagement,
                        likeCount: isLiked ? (p.engagement?.likeCount || 0) - 1 : (p.engagement?.likeCount || 0) + 1
                    }
                };
            }
            return p;
        }));

        try {
            await socialService.toggleReaction(postId, currentUser.id, 'like');
        } catch (error) {
            console.error("Reaction failed");
            loadFeed();
        }
    };

    return (
        <div className="sp-feed-view-container">
            <FBLeftSidebar currentUser={currentUser} />

            <main className="sp-feed-center">
                <FBStoriesRow stories={stories} currentUser={currentUser} />

                <EnhancedPostCreator
                    user={currentUser}
                    inline={true}
                    onPostCreated={(newPost) => {
                        // Prepend new post to feed
                        setPosts(prev => [newPost, ...prev]);
                    }}
                />

                {/* Reels Section (Inserted into feed) */}
                <ReelsCarousel reels={reels} onViewAll={() => { }} currentUser={currentUser} />

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: SP_COLORS.textSecondary }}>
                        Loading feed...
                    </div>
                ) : (
                    posts.map(post => (
                        <SPPostCard
                            key={post.id}
                            post={post}
                            user={post.user || post.author} // Handle both data shapes
                            onLike={() => handleLike(post.id)}
                        />
                    ))
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
