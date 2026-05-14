/**
 * 👤 smarter-poker-style PROFILE PAGE
 * src/app/social/views/SmarterPokerProfileView.jsx
 * 
 * Complete profile page with cover photo, about, friends, photos, poker stats
 * Connected to SocialService
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { SPAvatar, SP_COLORS, SPPostCard } from '../SmarterPokerStyleCard';
import { PokerTierBadge } from '../PokerReputationBadges';
import { useSupabase } from '../../../providers/SupabaseProvider';
import { SocialService } from '../../../services/SocialService';
import { busEmit, eventBus, EventType } from '../../../engine/EventBus';

// Dynamic imports for social modules (browser-only)
const LiveSessionToggle = dynamic(() => import('../LiveSessionToggle'), { ssr: false });
const LiveActivityFeed = dynamic(() => import('../LiveActivityFeed'), { ssr: false });
const ViralGrowthModule = dynamic(() => import('../ViralGrowthModule'), { ssr: false });
const CrewDashboard = dynamic(() => import('../CrewDashboard'), { ssr: false });

// ═══════════════════════════════════════════════════════════════════════════
// 📷 COVER PHOTO & PROFILE HEADER
// ═══════════════════════════════════════════════════════════════════════════

const CameraIcon = ({ size = 20, fill = 'currentColor' }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
        <path d="M4 6h4l1.5-2h5L16 6h4c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2zm8 11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0-8c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
    </svg>
);

const ProfileHeader = ({ user, isOwnProfile, onEditProfile, onAddFriend, onMessage, isFriend }) => (
    <div className="profile-header">
        {/* Cover Photo */}
        <div className="cover-photo">
            <img src={user.coverPhoto || ''} alt="" style={{ background: '#2d2d2d', objectPosition: user.coverPosition || '50% 50%' }} />
            {isOwnProfile && (
                <button className="edit-cover-btn">
                    <CameraIcon size={18} /> Edit cover photo
                </button>
            )}
        </div>

        {/* Profile Info */}
        <div className="profile-info-container">
            <div className="profile-avatar-section">
                <div className="profile-avatar-wrapper">
                    <SPAvatar src={user.avatar} size={168} />
                    {isOwnProfile && (
                        <button className="edit-avatar-btn">
                            <CameraIcon fill="#050505" />
                        </button>
                    )}
                </div>
            </div>

            <div className="profile-details">
                <div className="profile-name-row">
                    <h1 className="profile-name">{user.name}</h1>
                    {user.tier && (
                        <PokerTierBadge tier={user.tier} size="md" />
                    )}
                    {user.isVerified && <span className="verified-badge">✓</span>}
                </div>

                <p className="profile-friends-count">
                    {user.friendsCount?.toLocaleString()} friends
                    {user.mutualFriends > 0 && ` · ${user.mutualFriends} mutual`}
                </p>

                {/* Friend Avatars */}
                <div className="friend-avatars">
                    {user.topFriends?.slice(0, 8).map((friend, i) => (
                        <SPAvatar key={i} src={friend.avatar} size={32} />
                    ))}
                </div>
            </div>

            <div className="profile-actions">
                {isOwnProfile ? (
                    <>
                        <button className="btn-primary" onClick={onEditProfile}>
                            ✏️ Edit profile
                        </button>
                        <button className="btn-secondary">
                            📷 Add to story
                        </button>
                    </>
                ) : (
                    <>
                        {isFriend ? (
                            <button className="btn-secondary" onClick={() => onAddFriend?.(user)}>
                                ✓ Friends
                            </button>
                        ) : (
                            <button className="btn-primary" onClick={() => onAddFriend?.(user)}>
                                👤 Add Friend
                            </button>
                        )}
                        <button className="btn-primary" onClick={() => onMessage?.(user)}>
                            💬 Message
                        </button>
                    </>
                )}
            </div>
        </div>

        {/* Divider */}
        <div className="profile-divider" />

        {/* Navigation Tabs */}
        <nav className="profile-nav">
            <a href="#posts" className="nav-tab active">Posts</a>
            <a href="#about" className="nav-tab">About</a>
            <a href="#friends" className="nav-tab">Friends</a>
            <a href="#photos" className="nav-tab">Photos</a>
            <a href="#videos" className="nav-tab">Videos</a>
            <a href="#poker" className="nav-tab">
                🃏 Poker Stats
            </a>
            <a href="#more" className="nav-tab">More ▾</a>
        </nav>

        <style>{`
            .profile-header {
                background: ${SP_COLORS.bgWhite};
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            .cover-photo {
                height: 200px;
                position: relative;
                border-radius: 0 0 8px 8px;
                overflow: hidden;
                background: linear-gradient(135deg, #667eea, #764ba2);
            }

            .cover-photo img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                object-position: var(--cover-position, 50% 50%);
            }

            .edit-cover-btn {
                position: absolute;
                bottom: 16px;
                right: 16px;
                padding: 8px 16px;
                background: ${SP_COLORS.bgWhite};
                border: none;
                border-radius: 6px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .profile-info-container {
                display: flex;
                align-items: flex-end;
                padding: 0 24px;
                margin-top: -32px;
                position: relative;
            }

            .profile-avatar-section {
                flex-shrink: 0;
                margin-top: -84px;
            }

            .profile-avatar-wrapper {
                position: relative;
            }

            .profile-avatar-wrapper > div {
                border: 6px solid ${SP_COLORS.bgWhite} !important;
            }

            .edit-avatar-btn {
                position: absolute;
                bottom: 8px;
                right: 8px;
                width: 36px;
                height: 36px;
                background: #E4E6EB;
                border: 2px solid ${SP_COLORS.bgWhite};
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #050505;
                transition: background 0.2s;
                z-index: 2;
            }

            .edit-avatar-btn:hover {
                background: #D8DADF;
            }

            .profile-details {
                flex: 1;
                padding: 16px 24px;
            }

            .profile-name-row {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .profile-name {
                font-size: 32px;
                font-weight: 700;
                color: ${SP_COLORS.textPrimary};
                margin: 0;
            }

            .verified-badge {
                width: 24px;
                height: 24px;
                background: ${SP_COLORS.blue};
                color: white;
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
            }

            .profile-friends-count {
                color: ${SP_COLORS.textSecondary};
                font-size: 17px;
                margin: 4px 0 8px;
            }

            .friend-avatars {
                display: flex;
            }

            .friend-avatars > div {
                margin-left: -8px;
                border: 2px solid ${SP_COLORS.bgWhite};
            }

            .friend-avatars > div:first-child {
                margin-left: 0;
            }

            .profile-actions {
                display: flex;
                gap: 8px;
                padding-bottom: 16px;
            }

            .btn-primary {
                width: 140px;
                justify-content: center;
                box-sizing: border-box;
                padding: 10px 20px;
                background: ${SP_COLORS.blue};
                border: 1px solid transparent;
                border-radius: 20px;
                color: white;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .btn-primary:hover {
                background: ${SP_COLORS.blueHover};
            }

            .btn-secondary {
                width: 140px;
                justify-content: center;
                box-sizing: border-box;
                padding: 10px 20px;
                background: ${SP_COLORS.bgMain};
                border: 1px solid transparent;
                border-radius: 20px;
                color: ${SP_COLORS.textPrimary};
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .btn-secondary:hover {
                background: ${SP_COLORS.bgHover};
            }

            .profile-divider {
                height: 1px;
                background: ${SP_COLORS.divider};
                margin: 0 24px;
            }

            .profile-nav {
                display: flex;
                padding: 0 16px;
            }

            .nav-tab {
                padding: 16px 16px;
                color: ${SP_COLORS.textSecondary};
                text-decoration: none;
                font-size: 15px;
                font-weight: 600;
                border-bottom: 3px solid transparent;
                margin-bottom: -1px;
            }

            .nav-tab:hover {
                background: ${SP_COLORS.bgHover};
                border-radius: 6px 6px 0 0;
            }

            .nav-tab.active {
                color: ${SP_COLORS.blue};
                border-bottom-color: ${SP_COLORS.blue};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📊 POKER STATS CARD
// ═══════════════════════════════════════════════════════════════════════════

const PokerStatsCard = ({ stats }) => (
    <div className="poker-stats-card">
        <div className="card-header">
            <h3>🃏 Poker Statistics</h3>
        </div>

        <div className="stats-grid">
            <div className="stat-item">
                <span className="stat-label">Lifetime Profit</span>
                <span className={`stat-value ${stats.lifetimeProfit >= 0 ? 'positive' : 'negative'}`}>
                    {stats.lifetimeProfit >= 0 ? '+' : ''}${stats.lifetimeProfit?.toLocaleString()}
                </span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Hands Played</span>
                <span className="stat-value">{stats.handsPlayed?.toLocaleString()}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Win Rate</span>
                <span className={`stat-value ${stats.winRate >= 50 ? 'positive' : 'negative'}`}>
                    {stats.winRate}%
                </span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Best Hand</span>
                <span className="stat-value">{stats.bestHand || 'Royal Flush'}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Biggest Pot</span>
                <span className="stat-value positive">+${stats.biggestPot?.toLocaleString()}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Current Streak</span>
                <span className="stat-value">{stats.streak} days 🔥</span>
            </div>
        </div>

        <div className="mastery-section">
            <h4>GTO Mastery</h4>
            <div className="mastery-bar">
                <div
                    className="mastery-fill"
                    style={{ width: `${stats.gtoMastery || 0}%` }}
                />
            </div>
            <span className="mastery-percent">{stats.gtoMastery || 0}% / 85% required</span>
        </div>

        <style>{`
            .poker-stats-card {
                background: ${SP_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            .card-header {
                padding: 16px;
                border-bottom: 1px solid ${SP_COLORS.divider};
            }

            .card-header h3 {
                font-size: 20px;
                font-weight: 700;
                margin: 0;
                color: ${SP_COLORS.textPrimary};
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 16px;
                padding: 16px;
            }

            .stat-item {
                text-align: center;
                padding: 12px;
                background: ${SP_COLORS.bgMain};
                border-radius: 8px;
            }

            .stat-label {
                display: block;
                font-size: 13px;
                color: ${SP_COLORS.textSecondary};
                margin-bottom: 4px;
            }

            .stat-value {
                font-size: 20px;
                font-weight: 700;
                color: ${SP_COLORS.textPrimary};
            }

            .stat-value.positive { color: #22C55E; }
            .stat-value.negative { color: #EF4444; }

            .mastery-section {
                padding: 16px;
                border-top: 1px solid ${SP_COLORS.divider};
            }

            .mastery-section h4 {
                font-size: 15px;
                font-weight: 600;
                margin: 0 0 12px;
                color: ${SP_COLORS.textPrimary};
            }

            .mastery-bar {
                height: 12px;
                background: ${SP_COLORS.bgMain};
                border-radius: 6px;
                overflow: hidden;
            }

            .mastery-fill {
                height: 100%;
                background: linear-gradient(90deg, #FF6B35, #FFD700);
                border-radius: 6px;
                transition: width 0.5s ease;
            }

            .mastery-percent {
                display: block;
                margin-top: 8px;
                font-size: 13px;
                color: ${SP_COLORS.textSecondary};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// ℹ️ ABOUT CARD
// ═══════════════════════════════════════════════════════════════════════════

const AboutCard = ({ user }) => (
    <div className="about-card">
        <div className="card-header">
            <h3>Intro</h3>
        </div>

        <div className="about-content">
            {user.bio && (
                <p className="bio">{user.bio}</p>
            )}

            <div className="about-items">
                {user.location && (
                    <div className="about-item">
                        <span className="item-icon">📍</span>
                        <span>Lives In <strong>{user.location}</strong></span>
                    </div>
                )}
                {user.favoriteGame && (
                    <div className="about-item">
                        <span className="item-icon">🃏</span>
                        <span>Plays <strong>{user.favoriteGame}</strong></span>
                    </div>
                )}
                {user.stakes && (
                    <div className="about-item">
                        <span className="item-icon">💰</span>
                        <span>Grinds <strong>{user.stakes}</strong></span>
                    </div>
                )}
                {user.club && (
                    <div className="about-item">
                        <span className="item-icon">🏠</span>
                        <span>Member Of <strong>{user.club}</strong></span>
                    </div>
                )}
                <div className="about-item">
                    <span className="item-icon">📅</span>
                    <span>Joined {user.joinDate || 'January 2026'}</span>
                </div>
            </div>
        </div>

        <style>{`
            .about-card {
                background: ${SP_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                margin-bottom: 16px;
            }

            .card-header {
                padding: 16px;
                border-bottom: 1px solid ${SP_COLORS.divider};
            }

            .card-header h3 {
                font-size: 20px;
                font-weight: 700;
                margin: 0;
            }

            .about-content {
                padding: 16px;
            }

            .bio {
                font-size: 15px;
                color: ${SP_COLORS.textPrimary};
                text-align: center;
                margin: 0 0 16px;
            }

            .about-items {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .about-item {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 15px;
                color: ${SP_COLORS.textPrimary};
            }

            .item-icon {
                font-size: 20px;
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 👤 PROFILE VIEW
// ═══════════════════════════════════════════════════════════════════════════

export const SmarterPokerProfileView = ({ onNavigate, onOpenChat }) => {
    const { user: authUser, profile: authProfile, supabase } = useSupabase();
    const socialService = useMemo(() => supabase ? new SocialService(supabase) : null, [supabase]);
    const [postsLoading, setPostsLoading] = useState(true);

    // Determine profile subject (default to current user)
    // In future, pull userId from URL params
    const isOwnProfile = true;

    // Construct Profile User Object — merge real auth data with defaults
    const user = {
        name: authProfile?.full_name || authProfile?.username || authUser?.email || 'Unknown User',
        avatar: authProfile?.avatar_url || null,
        coverPhoto: authProfile?.cover_url || null,
        coverPosition: authProfile?.cover_photo_position || '50% 50%',
        bio: authProfile?.bio || 'Poker enthusiast',
        location: authProfile?.location || '',
        favoriteGame: authProfile?.favorite_game || 'NLHE',
        stakes: authProfile?.stakes || '',
        club: authProfile?.club_name || '',
        friendsCount: 0,
        mutualFriends: 0,
        isVerified: authProfile?.is_verified || false,
        tier: authProfile?.tier_id || 'active_reg',
        topFriends: [],
        lifetimeProfit: 0,
        handsPlayed: 0
    };

    const [photos] = useState([]);

    const [isFriend, setIsFriend] = useState(false);
    const [userPosts, setUserPosts] = useState([]);

    // Check if the logged-in user is following this profile
    const checkFollowing = useCallback(async () => {
        if (!socialService || !authUser?.id) return;
        try {
            // Use the profile user ID (or fallback to authUser)
            const targetId = user?.id || authUser.id;
            if (targetId === authUser.id) return; // Can't follow self
            const following = await socialService.isFollowing(authUser.id, targetId);
            setIsFriend(following);
        } catch (err) {
            console.warn('isFollowing check failed:', err.message);
        }
    }, [socialService, authUser?.id, user?.id]);

    useEffect(() => {
        checkFollowing();
    }, [checkFollowing]);

    // Fetch user's posts from Supabase
    const fetchPosts = useCallback(async () => {
        if (!socialService || !authUser?.id) {
            setPostsLoading(false);
            return;
        }
        try {
            setPostsLoading(true);
            const { posts: fetched } = await socialService.getFeed({ userId: authUser.id, limit: 10 });
            if (fetched?.length > 0) setUserPosts(fetched);
        } catch (err) {
            console.warn('Failed to fetch profile posts:', err.message);
        } finally {
            setPostsLoading(false);
        }
    }, [socialService, authUser?.id]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // EventBus: refresh own posts when a new post is created (debounced)
    useEffect(() => {
        let debounceTimer = null;
        const unsub = eventBus.on(EventType.SOCIAL_POST_CREATED, () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchPosts();
                debounceTimer = null;
            }, 3000);
        });
        const unsub_refresh = eventBus.on(EventType.SOCIAL_FEED_REFRESHED, () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchPosts();
                debounceTimer = null;
            }, 3000);
        });
        return () => {
            if (unsub) unsub();
            if (unsub) unsub_refresh();
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    }, [fetchPosts]);

    // Listen for comment events to update comment counts
    useEffect(() => {
        const unsub = eventBus.on(EventType.SOCIAL_COMMENT_ADDED, (event) => {
            const { postId } = event?.payload || {};
            if (postId) {
                setUserPosts(prev => prev.map(p => {
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
    useEffect(() => {
        const unsub = eventBus.on(EventType.SOCIAL_POST_LIKED, (event) => {
            const { postId, userId, added } = event?.payload || {};
            if (!postId || userId === authUser?.id) return; // Skip self — already handled optimistically
            
            setUserPosts(prev => prev.map(p => {
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
    }, [authUser?.id]);

    // Supabase Realtime: subscribeFeed for live post updates
    useEffect(() => {
        if (!socialService) return;
        const unsubscribe = socialService.subscribeFeed(
            (newPost) => {
                setUserPosts(prev => {
                    if (prev.some(p => p.id === newPost.id)) return prev;
                    return [newPost, ...prev];
                });
            },
            (updatedPost) => {
                setUserPosts(prev => prev.map(p => p.id === updatedPost.id ? { ...p, ...updatedPost } : p));
            }
        );
        return () => { if (unsubscribe) unsubscribe(); };
    }, [socialService]);

    const handleToggleFriend = async (targetUser) => {
        // Optimistic UI update
        const wasFriend = isFriend;
        setIsFriend(!wasFriend);

        try {
            if (socialService && authUser?.id) {
                if (wasFriend) {
                    await socialService.unfollowUser(authUser.id, targetUser?.id);
                } else {
                    await socialService.followUser(authUser.id, targetUser?.id);
                    busEmit.friendRequestSent(targetUser?.id || 'unknown');
                }
            }
        } catch (error) {
            console.warn('[App] Handled exception:', error?.message || error);
            // Revert optimistic update by refetching authoritative state
            checkFollowing();
        }
    };

    // Like handler — persists to Supabase
    const handleLike = async (postId, reactionType = 'like') => {
        if (!socialService || !authUser?.id) return;
        setUserPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const isLiked = p.isLiked;
                const isSwap = isLiked && reactionType !== (p.reactionType || 'like');

                if (isSwap) {
                    return { ...p, reactionType };
                }
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
            const { added, type } = await socialService.toggleReaction(postId, authUser.id, reactionType);
            // Only emit bus event when like_count changes (added=true/false). Skip swaps (added=null).
            if (added !== null && added !== undefined) {
                busEmit.socialPostLiked(postId, authUser.id, { added, reactionType: type });
            }
        } catch (error) {
            console.warn('Reaction failed:', error);
            // Authoritative state resynchronization on failure
            try {
                const [{ data: postData }, { data: likeData }] = await Promise.all([
                    supabase.from('social_posts').select('like_count').eq('id', postId).single(),
                    supabase.from('social_likes').select('reaction_type').eq('post_id', postId).eq('user_id', authUser.id)
                ]);
                
                setUserPosts(prev => prev.map(p => {
                    if (p.id !== postId) return p;
                    return {
                        ...p,
                        isLiked: likeData?.some(r => r.reaction_type === 'like') || false,
                        reactionType: likeData?.[0]?.reaction_type || 'like',
                        engagement: {
                            ...p.engagement,
                            likeCount: postData?.like_count || 0
                        }
                    };
                }));
            } catch (resyncError) {
                console.warn('Resync failed:', resyncError);
                fetchPosts(); // Fallback to full reload if single-item resync fails
            }
        }
    };

    // Comment + Delete handlers
    const handleComment = async (postId, text) => {
        if (!socialService || !authUser?.id) return;
        await socialService.createComment({ postId, authorId: authUser.id, content: text });
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
            setUserPosts(prev => prev.filter(p => p.id !== postId));
        } catch (err) {
            console.warn('Delete failed:', err);
        }
    };

    // Show real posts only — no mock welcome post
    const posts = userPosts;

    const pokerStats = {
        lifetimeProfit: user.lifetimeProfit || 0,
        handsPlayed: user.handsPlayed || 0,
        winRate: user.winRate || 0,
        bestHand: user.bestHand || '—',
        biggestPot: user.biggestPot || 0,
        streak: user.streak || 0,
        gtoMastery: user.gtoMastery || 0
    };

    return (
        <div className="profile-page">
            <ProfileHeader
                user={user}
                isOwnProfile={isOwnProfile}
                onMessage={onOpenChat}
                onAddFriend={handleToggleFriend}
                isFriend={isFriend}
            />

            <div className="profile-content">
                {/* Left Column */}
                <div className="profile-left">
                    {/* Live Session Toggle (own profile only) */}
                    {isOwnProfile && authUser && (
                        <LiveSessionToggle currentUser={authUser} />
                    )}

                    <AboutCard user={user} />

                    {/* Live Activity Feed — friends currently playing */}
                    {authUser && (
                        <LiveActivityFeed currentUser={authUser} />
                    )}

                    {/* Viral Growth / Referral Module */}
                    {isOwnProfile && authUser && (
                        <ViralGrowthModule currentUser={authUser} />
                    )}

                    {/* Crew Dashboard */}
                    {isOwnProfile && authUser && (
                        <CrewDashboard currentUser={authUser} />
                    )}

                    {/* Photos Preview */}
                    <div className="photos-card">
                        <div className="card-header">
                            <h3>Photos</h3>
                            <a href="#photos">See All Photos</a>
                        </div>
                        <div className="photos-grid">
                            {photos.slice(0, 9).map((photo, i) => (
                                <img key={i} src={photo.url || photo} alt="" />
                            ))}
                        </div>
                    </div>

                    {/* Friends Preview */}
                    <div className="friends-card">
                        <div className="card-header">
                            <h3>Friends</h3>
                            <a href="#friends">See All Friends</a>
                        </div>
                        <span className="friends-count">{user.friendsCount} friends</span>
                        <div className="friends-grid">
                            {user.topFriends?.slice(0, 9).map((friend, i) => (
                                <div key={i} className="friend-preview">
                                    <img src={friend.avatar} alt={friend.name} />
                                    <span>{friend.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column (Posts) */}
                <div className="profile-right">
                    <PokerStatsCard stats={pokerStats} />

                    <div className="posts-section">
                        <div className="posts-header">
                            <h3>Posts</h3>
                            <div className="posts-filters">
                                <button className="filter-btn active">List View</button>
                                <button className="filter-btn">Grid View</button>
                            </div>
                        </div>

                        {postsLoading ? (
                            <div style={{ padding: '0 4px' }}>
                                {[1,2,3].map(i => (
                                    <div key={i} style={{
                                        height: 140, background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                                        backgroundSize: '200% 100%', animation: 'profileShimmer 1.5s infinite',
                                        borderRadius: 8, marginBottom: 16
                                    }} />
                                ))}
                                <style>{`@keyframes profileShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
                            </div>
                        ) : (
                            posts.map((post, i) => (
                                <SPPostCard
                                    key={post.id || i}
                                    post={post}
                                    user={user}
                                    onLike={handleLike}
                                    onSubmitComment={handleComment}
                                    onLoadComments={handleLoadComments}
                                    onDeletePost={handleDeletePost}
                                    currentUserId={authUser?.id}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .profile-page {
                    background: ${SP_COLORS.bgMain};
                    min-height: 100vh;
                }

                .profile-content {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 16px;
                    display: grid;
                    grid-template-columns: 360px 1fr;
                    gap: 16px;
                }

                .profile-left {
                    position: sticky;
                    top: 72px;
                    height: fit-content;
                }

                .photos-card,
                .friends-card {
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    margin-bottom: 16px;
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                }

                .card-header h3 {
                    font-size: 20px;
                    font-weight: 700;
                    margin: 0;
                }

                .card-header a {
                    color: ${SP_COLORS.blue};
                    text-decoration: none;
                    font-size: 15px;
                }

                .photos-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 4px;
                    padding: 0 16px 16px;
                }

                .photos-grid img {
                    width: 100%;
                    aspect-ratio: 1;
                    object-fit: cover;
                    border-radius: 8px;
                }

                .friends-count {
                    display: block;
                    padding: 0 16px 8px;
                    color: ${SP_COLORS.textSecondary};
                    font-size: 15px;
                }

                .friends-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8px;
                    padding: 0 16px 16px;
                }

                .friend-preview {
                    text-align: center;
                }

                .friend-preview img {
                    width: 100%;
                    aspect-ratio: 1;
                    object-fit: cover;
                    border-radius: 8px;
                }

                .friend-preview span {
                    display: block;
                    font-size: 13px;
                    font-weight: 500;
                    margin-top: 4px;
                    color: ${SP_COLORS.textPrimary};
                }

                .posts-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: ${SP_COLORS.bgWhite};
                    padding: 16px;
                    border-radius: 8px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    margin-bottom: 16px;
                }

                .posts-header h3 {
                    font-size: 20px;
                    font-weight: 700;
                    margin: 0;
                }

                .posts-filters {
                    display: flex;
                    gap: 8px;
                }

                .filter-btn {
                    padding: 8px 16px;
                    background: ${SP_COLORS.bgMain};
                    border: none;
                    border-radius: 6px;
                    font-size: 15px;
                    font-weight: 500;
                    cursor: pointer;
                }

                .filter-btn.active {
                    background: ${SP_COLORS.blueLight};
                    color: ${SP_COLORS.blue};
                }

                @media (max-width: 900px) {
                    .profile-content {
                        grid-template-columns: 1fr;
                    }

                    .profile-left {
                        position: static;
                    }
                }
            `}</style>
        </div>
    );
};

export default SmarterPokerProfileView;
