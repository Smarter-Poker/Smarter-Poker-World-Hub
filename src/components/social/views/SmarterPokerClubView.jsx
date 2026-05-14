/**
 * 🎰 smarter-poker-style GROUP/CLUB VIEW
 * src/app/social/views/SmarterPokerClubView.jsx
 * 
 * Club page with Discussion, Events, Members, and Poker Leaderboards
 * Connected to SocialService
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CreatePostBox, SPPostCard, SPAvatar, SP_COLORS } from '../SmarterPokerStyleCard';
import { PokerTierBadge } from '../PokerReputationBadges';
import { useSupabase } from '../../../providers/SupabaseProvider';
import { SocialService } from '../../../services/SocialService';
import { busEmit, eventBus, EventType } from '../../../engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// 🏆 CLUB LEADERBOARD COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const ClubLeaderboardRow = ({ rank, user, stats }) => (
    <div className={`leaderboard-row rank-${rank}`}>
        <div className="rank-cell">
            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
        </div>

        <div className="user-cell">
            <SPAvatar src={user.avatar} size={40} />
            <div className="user-info">
                <span className="user-name">{user.name}</span>
                <PokerTierBadge tier={user.tier} size="xs" showLabel={false} />
            </div>
        </div>

        <div className="stat-cell primary">
            ${stats.profit?.toLocaleString()}
        </div>

        <div className="stat-cell">
            <span className={`winrate ${stats.bb100 >= 0 ? 'pos' : 'neg'}`}>
                {stats.bb100} bb/100
            </span>
        </div>

        <div className="stat-cell secondary">
            {stats.hands?.toLocaleString()} hands
        </div>

        <style>{`
            .leaderboard-row {
                display: grid;
                grid-template-columns: 48px 2fr 1fr 1fr 1fr;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid ${SP_COLORS.divider};
            }

            .leaderboard-row:hover {
                background: ${SP_COLORS.bgHover};
            }

            .rank-cell {
                font-weight: 700;
                font-size: 16px;
                color: ${SP_COLORS.textSecondary};
            }

            .rank-1 .rank-cell { font-size: 24px; }

            .user-cell {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .user-name {
                display: block;
                font-weight: 600;
                color: ${SP_COLORS.textPrimary};
                font-size: 15px;
            }

            .stat-cell {
                font-size: 15px;
                color: ${SP_COLORS.textPrimary};
                text-align: right;
            }

            .stat-cell.primary {
                font-weight: 700;
                color: #22C55E;
            }

            .stat-cell.secondary {
                color: ${SP_COLORS.textSecondary};
                font-size: 13px;
            }

            .winrate.pos { color: #22C55E; }
            .winrate.neg { color: #EF4444; }
        `}</style>
    </div>
);

const ClubLeaderboard = ({ data = [] }) => (
    <div className="club-leaderboard">
        <div className="lb-header">
            <h3>Weekly Grinders</h3>
            <div className="lb-filters">
                <button className="active">This Week</button>
                <button>All Time</button>
            </div>
        </div>

        <div className="lb-columns">
            <span>Rank</span>
            <span>Player</span>
            <span className="align-right">Profit</span>
            <span className="align-right">BB/100</span>
            <span className="align-right">Volume</span>
        </div>

        <div className="lb-list">
            {data.map((entry, i) => (
                <ClubLeaderboardRow
                    key={i}
                    rank={i + 1}
                    user={entry.user}
                    stats={entry.stats}
                />
            ))}
        </div>

        <style>{`
            .club-leaderboard {
                background: ${SP_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                margin-bottom: 24px;
            }

            .lb-header {
                padding: 16px;
                border-bottom: 1px solid ${SP_COLORS.divider};
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .lb-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
                color: ${SP_COLORS.textPrimary};
            }

            .lb-filters button {
                border: none;
                background: none;
                padding: 8px 12px;
                font-weight: 600;
                color: ${SP_COLORS.textSecondary};
                cursor: pointer;
                border-radius: 6px;
            }

            .lb-filters button.active {
                background: ${SP_COLORS.bgMain};
                color: ${SP_COLORS.blue};
            }

            .lb-columns {
                display: grid;
                grid-template-columns: 48px 2fr 1fr 1fr 1fr;
                padding: 8px 16px;
                background: ${SP_COLORS.bgMain};
                font-size: 12px;
                font-weight: 600;
                color: ${SP_COLORS.textSecondary};
                text-transform: uppercase;
            }
            
            .align-right { text-align: right; }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📅 EVENT CARD
// ═══════════════════════════════════════════════════════════════════════════

const ClubEventCard = ({ event }) => (
    <div className="event-card">
        <div className="event-date">
            <span className="month">{event.month}</span>
            <span className="day">{event.day}</span>
        </div>

        <div className="event-details">
            <h4 className="event-title">{event.title}</h4>
            <span className="event-time">{event.time}</span>
            <span className="event-location">{event.location}</span>
            <div className="event-attendees">
                {event.attendeesCount} going · {event.interestedCount} interested
            </div>
        </div>

        <div className="event-actions">
            <button className="btn-interest">★ Interested</button>
            <button className="btn-share">↗️</button>
        </div>

        <style>{`
            .event-card {
                display: flex;
                gap: 16px;
                padding: 16px;
                background: ${SP_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                margin-bottom: 12px;
            }

            .event-date {
                display: flex;
                flex-direction: column;
                align-items: center;
                background: ${SP_COLORS.bgWhite};
                padding: 8px;
                border-radius: 8px;
                box-shadow: 0 0 0 1px ${SP_COLORS.divider};
                width: 60px;
                height: 60px;
            }

            .month {
                color: #E41E3F;
                font-weight: 700;
                font-size: 13px;
                text-transform: uppercase;
            }

            .day {
                font-size: 24px;
                font-weight: 700;
                color: ${SP_COLORS.textPrimary};
            }

            .event-details {
                flex: 1;
            }

            .event-title {
                margin: 0 0 4px;
                font-size: 17px;
                color: ${SP_COLORS.textPrimary};
            }

            .event-time, .event-location {
                display: block;
                font-size: 14px;
                color: ${SP_COLORS.textSecondary};
                margin-bottom: 2px;
            }

            .event-attendees {
                font-size: 13px;
                color: ${SP_COLORS.textSecondary};
                margin-top: 4px;
            }

            .event-actions {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .btn-interest {
                padding: 8px 16px;
                background: ${SP_COLORS.bgMain};
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }

            .btn-interest:hover { background: ${SP_COLORS.bgHover}; }
            
            .btn-share {
                padding: 8px;
                background: ${SP_COLORS.bgMain};
                border: none;
                border-radius: 6px;
                cursor: pointer;
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🃏 CLUB HEADER
// ═══════════════════════════════════════════════════════════════════════════

const ClubHeader = ({ club, isMember = false }) => (
    <div className="club-header">
        <div className="club-cover">
            <img src={club.coverPhoto || ''} alt="" style={{ background: '#2d2d2d' }} />
        </div>

        <div className="club-info-container">
            <h1 className="club-name">{club.name}</h1>
            <div className="club-meta">
                <span>🔒 Private Group</span>
                <span>·</span>
                <span>{club.membersCount?.toLocaleString()} members</span>
                <span>·</span>
                <span className="club-level">{club.level || 'Diamond Club'} 💎</span>
            </div>

            <div className="member-avatars">
                {club.topMembers?.slice(0, 8).map((m, i) => (
                    <SPAvatar key={i} src={m.avatar} size={32} />
                ))}
            </div>

            <div className="club-actions">
                <button className={`btn-join ${isMember ? 'joined' : ''}`}>
                    {isMember ? '✓ Joined' : '+ Join Group'}
                </button>
                <button className="btn-invite">+ Invite</button>
                <button className="btn-dots">⋯</button>
            </div>
        </div>

        <nav className="club-nav">
            <a href="#discussion" className="active">Discussion</a>
            <a href="#leaderboard">Leaderboard</a>
            <a href="#featured">Featured</a>
            <a href="#events">Events</a>
            <a href="#media">Media</a>
            <a href="#files">Files</a>
        </nav>

        <style>{`
            .club-header {
                background: ${SP_COLORS.bgWhite};
                margin-bottom: 16px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            .club-cover {
                height: 350px;
                overflow: hidden;
                border-radius: 0 0 8px 8px;
            }

            .club-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .club-info-container {
                padding: 24px 32px;
                max-width: 1100px;
                margin: 0 auto;
            }

            .club-name {
                font-size: 32px;
                font-weight: 800;
                color: ${SP_COLORS.textPrimary};
                margin: 0 0 8px;
            }

            .club-meta {
                display: flex;
                gap: 8px;
                font-size: 15px;
                color: ${SP_COLORS.textSecondary};
                margin-bottom: 16px;
                align-items: center;
            }

            .club-level {
                color: #FFD700;
                font-weight: 600;
                background: rgba(255, 215, 0, 0.1);
                padding: 2px 8px;
                border-radius: 12px;
            }

            .member-avatars {
                display: flex;
                margin-bottom: 24px;
            }
            .member-avatars > div {
                margin-left: -8px;
                border: 2px solid ${SP_COLORS.bgWhite};
            }
            .member-avatars > div:first-child { margin-left: 0; }

            .club-actions {
                display: flex;
                gap: 8px;
            }

            .btn-join {
                padding: 0 32px;
                height: 36px;
                background: ${SP_COLORS.blue};
                color: white;
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }

            .btn-join.joined {
                background: ${SP_COLORS.bgMain};
                color: ${SP_COLORS.textPrimary};
            }

            .btn-invite {
                padding: 0 16px;
                height: 36px;
                background: ${SP_COLORS.blueLight};
                color: ${SP_COLORS.blue};
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }

            .btn-dots {
                width: 36px;
                height: 36px;
                background: ${SP_COLORS.bgMain};
                border: none;
                border-radius: 6px;
                cursor: pointer;
            }

            .club-nav {
                display: flex;
                gap: 4px;
                padding: 0 32px;
                border-top: 1px solid ${SP_COLORS.divider};
                max-width: 1100px;
                margin: 0 auto;
            }

            .club-nav a {
                padding: 16px;
                color: ${SP_COLORS.textSecondary};
                text-decoration: none;
                font-weight: 600;
                font-size: 15px;
                position: relative;
            }

            .club-nav a:hover {
                background: ${SP_COLORS.bgHover};
                border-radius: 6px 6px 0 0;
            }

            .club-nav a.active {
                color: ${SP_COLORS.blue};
            }

            .club-nav a.active::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: ${SP_COLORS.blue};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🎰 MAIN CLUB VIEW
// ═══════════════════════════════════════════════════════════════════════════

export const SmarterPokerClubView = ({ onNavigate }) => {
    // Hooks
    const { user: authUser, profile: authProfile, supabase } = useSupabase();
    const socialService = useMemo(() => supabase ? new SocialService(supabase) : null, [supabase]);

    // Construct currentUser object for UI
    const currentUser = authUser ? {
        id: authUser.id,
        name: authProfile?.username || authUser.email,
        avatar: authProfile?.avatar_url || null,
        online: true
    } : null;

    const [loading, setLoading] = useState(true);
    const [club, setClub] = useState({
        name: "Las Vegas $5/$10 Grinders",
        membersCount: 0,
        level: "Diamond Club",
        coverPhoto: null,
        topMembers: []
    });
    const [posts, setPosts] = useState([]);

    const leaderboard = [];

    const events = [];

    // Show real posts only — no mock welcome post
    const displayPosts = posts;

    // Fetch real club data from Supabase
    const loadClubData = useCallback(async () => {
        if (!socialService) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const clubs = await socialService.getClubs();
            if (clubs?.length > 0) {
                setClub(prev => ({ ...prev, ...clubs[0], membersCount: clubs[0].membersCount || clubs[0].member_count || 0 }));
            }
            const { posts: fetched } = await socialService.getFeed({ userId: authUser?.id, limit: 10 });
            if (fetched?.length > 0) setPosts(fetched);
        } catch (err) {
            console.warn('ClubView data fetch failed:', err.message);
        } finally {
            setLoading(false);
        }
    }, [socialService]);

    useEffect(() => {
        loadClubData();
    }, [loadClubData]);

    // EventBus: delayed fallback refresh — subscribeFeed handles real-time INSERTs,
    // so this is a safety net in case Realtime is delayed or disconnected
    useEffect(() => {
        let debounceTimer = null;
        const unsub1 = eventBus.on(EventType.SOCIAL_POST_CREATED, () => {
            // Debounce: clear any pending timer before setting a new one
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadClubData();
                debounceTimer = null;
            }, 3000);
        });
        const unsub1_refresh = eventBus.on(EventType.SOCIAL_FEED_REFRESHED, () => {
            // Debounce: clear any pending timer before setting a new one
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadClubData();
                debounceTimer = null;
            }, 3000);
        });
        const unsub2 = eventBus.on(EventType.SOCIAL_COMMENT_ADDED, (event) => {
            const { postId } = event?.payload || {};
            if (postId) {
                setPosts(prev => prev.map(p => {
                    if (p.id === postId) {
                        return { ...p, engagement: { ...p.engagement, commentCount: (p.engagement?.commentCount || 0) + 1 } };
                    }
                    return p;
                }));
            }
        });
        const unsub3 = eventBus.on(EventType.SOCIAL_POST_LIKED, (event) => {
            const { postId, userId, added } = event?.payload || {};
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
        return () => {
            unsub1(); unsub2(); unsub3();
            unsub1_refresh(); unsub2(); unsub3();
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    }, [loadClubData, currentUser?.id]);

    // Supabase real-time subscription for new club posts
    useEffect(() => {
        if (!socialService) return;
        const unsubscribe = socialService.subscribeFeed(
            (newPost) => {
                setPosts(prev => {
                    if (prev.some(p => p.id === newPost.id)) return prev;
                    return [newPost, ...prev];
                });
            },
            (updatedPost) => {
                setPosts(prev => prev.map(p => p.id === updatedPost.id ? { ...p, ...updatedPost } : p));
            }
        );
        return () => { if (unsubscribe) unsubscribe(); };
    }, [socialService]);

    // Like handler — persists to Supabase
    const handleLike = async (postId, reactionType = 'like') => {
        if (!socialService || !currentUser) return;
        setPosts(prev => prev.map(p => {
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
            const { added, type } = await socialService.toggleReaction(postId, currentUser.id, reactionType);
            // Only emit bus event when like_count changes (added=true/false). Skip swaps (added=null).
            if (added !== null && added !== undefined) {
                busEmit.socialPostLiked(postId, currentUser.id, { added, reactionType: type });
            }
        } catch (error) {
            console.warn('Reaction failed:', error);
            // Authoritative state resynchronization on failure
            try {
                const [{ data: postData }, { data: likeData }] = await Promise.all([
                    supabase.from('social_posts').select('like_count').eq('id', postId).maybeSingle(),
                    supabase.from('social_likes').select('reaction_type').eq('post_id', postId).eq('user_id', currentUser.id)
                ]);
                
                setPosts(prev => prev.map(p => {
                    if (p.id !== postId) return p;
                    return {
                        ...p,
                        isLiked: likeData?.length > 0,
                        reactionType: likeData?.[0]?.reaction_type || 'like',
                        engagement: {
                            ...p.engagement,
                            likeCount: postData?.like_count || 0
                        }
                    };
                }));
            } catch (resyncError) {
                console.warn('Resync failed:', resyncError);
                loadClubData(); // Fallback to full reload if single-item resync fails
            }
            throw error;
        }
    };

    // Comment + Delete handlers
    const handleComment = async (postId, text) => {
        if (!socialService || !currentUser) return;
        try {
            await socialService.createComment({ postId, authorId: currentUser.id, content: text });
        } catch (error) {
            console.warn('Comment failed:', error);
        }
    };

    const handleLoadComments = async (postId) => {
        if (!socialService) return [];
        try {
            return await socialService.getComments(postId);
        } catch (error) {
            console.warn('Load comments failed:', error);
            return [];
        }
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
        <div className="club-page">
            <ClubHeader club={club} isMember={true} />

            <div className="club-content">
                {/* Left Rail (Main Content) */}
                <div className="club-main">
                    <CreatePostBox user={currentUser} placeholder="Write Something..." />

                    {leaderboard.length > 0 ? (
                        <ClubLeaderboard data={leaderboard} />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '32px 16px', background: '#fff', borderRadius: 8, marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                            <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>🏆</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1e21' }}>No Leaderboard Data Yet</div>
                            <div style={{ fontSize: 13, color: '#65676B', marginTop: 4 }}>Play games to appear on the leaderboard</div>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ padding: 20 }}>
                            {[1,2].map(i => (
                                <div key={i} style={{
                                    height: 120, background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                                    backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
                                    borderRadius: 8, marginBottom: 16
                                }} />
                            ))}
                            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
                        </div>
                    ) : (
                        displayPosts.map(post => (
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
                </div>

                {/* Right Rail (Sidebar) */}
                <div className="club-sidebar">
                    <div className="sidebar-card">
                        <h3>About</h3>
                        <p>Official Community For Las Vegas $5/$10 NLH Players. Share Hands, Discuss Strategy, And Organize Home Games.</p>
                        <div className="security-check">
                            <span>🔒</span> Private · Only members can see who's in the group and what they post.
                        </div>
                    </div>

                    <div className="sidebar-card">
                        <h3>Upcoming Events</h3>
                        {events.length > 0 ? events.map((e, i) => (
                            <ClubEventCard key={i} event={e} />
                        )) : (
                            <div style={{ textAlign: 'center', padding: '20px 12px', color: '#65676B', fontSize: 14 }}>
                                No Upcoming Events
                            </div>
                        )}
                        {events.length > 0 && <button className="btn-see-all">See All</button>}
                    </div>
                </div>
            </div>

            <style>{`
                .club-content {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 0 16px;
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    gap: 16px;
                }

                .club-sidebar {
                    position: sticky;
                    top: 72px;
                    height: fit-content;
                }

                .sidebar-card {
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                .sidebar-card h3 {
                    margin: 0 0 12px;
                    font-size: 17px;
                    font-weight: 600;
                    color: ${SP_COLORS.textPrimary};
                }

                .sidebar-card p {
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
                    line-height: 1.4;
                    margin-bottom: 12px;
                }

                .security-check {
                    display: flex;
                    gap: 8px;
                    font-size: 13px;
                    color: ${SP_COLORS.textSecondary};
                }

                .btn-see-all {
                    width: 100%;
                    padding: 8px;
                    background: ${SP_COLORS.bgMain};
                    border: none;
                    border-radius: 6px;
                    font-weight: 600;
                    cursor: pointer;
                    color: ${SP_COLORS.textPrimary};
                }

                @media (max-width: 900px) {
                    .club-content { grid-template-columns: 1fr; }
                    .club-sidebar { order: -1; }
                }
            `}</style>
        </div>
    );
};

export default SmarterPokerClubView;
