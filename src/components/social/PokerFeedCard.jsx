/**
 * 🃏 POKER SOCIAL FEED CARD
 * src/app/social/components/PokerFeedCard.jsx
 * 
 * Facebook-style post card with poker DNA integration.
 * Shows user tier, hand analysis sharing, and poker reactions.
 */

import React, { useState } from 'react';
import { HeatMapBorder, GTOMasterGlow } from './HeatMapBorder';
import { PokerTierBadge, PokerReactionBar, PokerAchievementBadge } from './PokerReputationBadges';

// ═══════════════════════════════════════════════════════════════════════════
// 🃏 POST TYPES (Like Facebook's photo/video/live but poker-themed)
// ═══════════════════════════════════════════════════════════════════════════

const POST_TYPES = {
    status: { icon: '💭', label: 'Status Update' },
    hand_history: { icon: '🃏', label: 'Hand Analysis' },
    session_recap: { icon: '📊', label: 'Session Recap' },
    bad_beat: { icon: '💔', label: 'Bad Beat Story' },
    big_win: { icon: '🏆', label: 'Big Win' },
    question: { icon: '❓', label: 'Strategy Question' },
    gto_breakdown: { icon: '🧠', label: 'GTO Breakdown' },
    live_stream: { icon: '🔴', label: 'Live Session' }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🃏 POKER FEED CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const PokerFeedCard = ({
    post,
    user,
    onReact = () => { },
    onComment = () => { },
    onShare = () => { },
    onFollow = () => { },
    isFollowing = false
}) => {
    const [showComments, setShowComments] = useState(false);
    const [localReaction, setLocalReaction] = useState(post.userReaction || null);

    const handleReaction = (reactionType) => {
        const newReaction = localReaction === reactionType ? null : reactionType;
        setLocalReaction(newReaction);
        onReact(post.id, newReaction);
    };

    const postType = POST_TYPES[post.type] || POST_TYPES.status;
    const isGTOMaster = user.tier === 'gto_master';
    const recentEngagement = post.recentEngagement || 0;

    // Time formatting
    const formatTime = (timestamp) => {
        const now = new Date();
        const postTime = new Date(timestamp);
        const diffMs = now - postTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        return postTime.toLocaleDateString();
    };

    const CardContent = (
        <div className="poker-feed-card">
            {/* Header: User Info + Post Type */}
            <div className="card-header">
                <div className="user-section">
                    <div className="avatar-container">
                        <img
                            src={user.avatar || '/default-avatar.png'}
                            alt={user.displayName}
                            className="user-avatar"
                        />
                        {user.isOnline && <span className="online-indicator" />}
                    </div>
                    <div className="user-info">
                        <div className="user-name-row">
                            <span className="user-name">{user.displayName}</span>
                            <PokerTierBadge tier={user.tier} size="sm" showLabel={false} />
                            {user.isVerified && <span className="verified-badge">✓</span>}
                        </div>
                        <div className="post-meta">
                            <span className="post-time">{formatTime(post.createdAt)}</span>
                            <span className="meta-dot">•</span>
                            <span className="post-type-badge">
                                {postType.icon} {postType.label}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="header-actions">
                    {!isFollowing && user.id !== post.currentUserId && (
                        <button className="follow-btn" onClick={() => onFollow(user.id)}>
                            + Follow
                        </button>
                    )}
                    <button className="more-btn">⋯</button>
                </div>
            </div>

            {/* Post Content */}
            <div className="card-content">
                {post.text && <p className="post-text">{post.text}</p>}

                {/* Hand History Display */}
                {post.type === 'hand_history' && post.handData && (
                    <div className="hand-history-embed">
                        <div className="hand-header">
                            <span className="hand-stakes">{post.handData.stakes}</span>
                            <span className="hand-result" style={{
                                color: post.handData.won ? '#22C55E' : '#EF4444'
                            }}>
                                {post.handData.won ? '+' : '-'}${post.handData.amount}
                            </span>
                        </div>
                        <div className="hand-cards">
                            <div className="hero-cards">
                                {post.handData.heroCards?.map((card, i) => (
                                    <span key={i} className="card">{card}</span>
                                ))}
                            </div>
                            {post.handData.board && (
                                <div className="board-cards">
                                    {post.handData.board.map((card, i) => (
                                        <span key={i} className="card board">{card}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                        {post.handData.analysis && (
                            <p className="hand-analysis">{post.handData.analysis}</p>
                        )}
                    </div>
                )}

                {/* Session Recap */}
                {post.type === 'session_recap' && post.sessionData && (
                    <div className="session-recap-embed">
                        <div className="session-stats">
                            <div className="stat">
                                <span className="stat-value">{post.sessionData.duration}</span>
                                <span className="stat-label">Duration</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{post.sessionData.handsPlayed}</span>
                                <span className="stat-label">Hands</span>
                            </div>
                            <div className="stat">
                                <span
                                    className="stat-value"
                                    style={{
                                        color: post.sessionData.profitLoss >= 0 ? '#22C55E' : '#EF4444'
                                    }}
                                >
                                    {post.sessionData.profitLoss >= 0 ? '+' : ''}
                                    ${post.sessionData.profitLoss}
                                </span>
                                <span className="stat-label">P/L</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Image/Media */}
                {post.media && post.media.length > 0 && (
                    <div className={`post-media media-count-${Math.min(post.media.length, 4)}`}>
                        {post.media.slice(0, 4).map((media, i) => (
                            <div key={i} className="media-item">
                                <img src={media.url} alt="Post media" />
                                {i === 3 && post.media.length > 4 && (
                                    <div className="media-more">+{post.media.length - 4}</div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Engagement Stats */}
            <div className="engagement-stats">
                <div className="reaction-summary">
                    {post.topReactions?.slice(0, 3).map((r, i) => (
                        <span key={i} className="reaction-mini">{r.icon}</span>
                    ))}
                    {post.totalReactions > 0 && (
                        <span className="reaction-count">{post.totalReactions}</span>
                    )}
                </div>
                <div className="engagement-counts">
                    {post.commentCount > 0 && (
                        <span className="count-item">{post.commentCount} comments</span>
                    )}
                    {post.shareCount > 0 && (
                        <span className="count-item">{post.shareCount} shares</span>
                    )}
                </div>
            </div>

            {/* Poker Reactions */}
            <PokerReactionBar
                reactions={post.reactions}
                userReaction={localReaction}
                onReact={handleReaction}
            />

            {/* Action Buttons */}
            <div className="action-buttons">
                <button
                    className="action-btn"
                    onClick={() => setShowComments(!showComments)}
                >
                    💬 Comment
                </button>
                <button className="action-btn" onClick={() => onShare(post.id)}>
                    🔄 Share
                </button>
                {post.type === 'hand_history' && (
                    <button className="action-btn highlight">
                        🧠 Analyze GTO
                    </button>
                )}
            </div>

            {/* Comments Section */}
            {showComments && (
                <div className="comments-section">
                    <div className="comment-input">
                        <img src="/default-avatar.png" alt="You" className="comment-avatar" />
                        <input
                            type="text"
                            placeholder="Write a comment..."
                            className="comment-field"
                        />
                    </div>
                    {post.comments?.map((comment, i) => (
                        <div key={i} className="comment-item">
                            <img
                                src={comment.user.avatar}
                                alt={comment.user.name}
                                className="comment-avatar"
                            />
                            <div className="comment-content">
                                <div className="comment-header">
                                    <span className="comment-author">{comment.user.name}</span>
                                    <PokerTierBadge tier={comment.user.tier} size="sm" showLabel={false} />
                                </div>
                                <p className="comment-text">{comment.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .poker-feed-card {
                    background: rgba(18, 24, 38, 0.95);
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 16px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 16px;
                }

                .user-section {
                    display: flex;
                    gap: 12px;
                }

                .avatar-container {
                    position: relative;
                }

                .user-avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 2px solid rgba(255, 255, 255, 0.1);
                }

                .online-indicator {
                    position: absolute;
                    bottom: 2px;
                    right: 2px;
                    width: 12px;
                    height: 12px;
                    background: #22C55E;
                    border-radius: 50%;
                    border: 2px solid rgba(18, 24, 38, 0.95);
                }

                .user-name-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .user-name {
                    font-weight: 600;
                    color: white;
                    font-size: 1rem;
                }

                .verified-badge {
                    background: #3B82F6;
                    color: white;
                    font-size: 0.6rem;
                    padding: 2px 4px;
                    border-radius: 50%;
                }

                .post-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8rem;
                    color: rgba(255, 255, 255, 0.5);
                    margin-top: 4px;
                }

                .meta-dot {
                    opacity: 0.5;
                }

                .post-type-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 8px;
                    background: rgba(255, 107, 53, 0.2);
                    border-radius: 10px;
                    font-size: 0.7rem;
                    color: #FF6B35;
                }

                .header-actions {
                    display: flex;
                    gap: 8px;
                }

                .follow-btn {
                    padding: 6px 16px;
                    background: #3B82F6;
                    border: none;
                    border-radius: 20px;
                    color: white;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .follow-btn:hover {
                    background: #2563EB;
                    transform: scale(1.02);
                }

                .more-btn {
                    width: 36px;
                    height: 36px;
                    background: transparent;
                    border: none;
                    border-radius: 50%;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 1.2rem;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .more-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                }

                .post-text {
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 0.95rem;
                    line-height: 1.6;
                    margin-bottom: 16px;
                }

                /* Hand History Embed */
                .hand-history-embed {
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 16px;
                    border: 1px solid rgba(255, 107, 53, 0.3);
                }

                .hand-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    font-weight: 600;
                }

                .hand-stakes {
                    color: rgba(255, 255, 255, 0.7);
                }

                .hand-result {
                    font-size: 1.2rem;
                }

                .hand-cards {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 12px;
                }

                .hero-cards, .board-cards {
                    display: flex;
                    gap: 4px;
                }

                .card {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 56px;
                    background: white;
                    border-radius: 6px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: black;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                }

                .card.board {
                    width: 36px;
                    height: 50px;
                    font-size: 1rem;
                }

                .hand-analysis {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.85rem;
                    font-style: italic;
                }

                /* Session Recap */
                .session-recap-embed {
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 16px;
                }

                .session-stats {
                    display: flex;
                    justify-content: space-around;
                }

                .stat {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                }

                .stat-value {
                    font-size: 1.4rem;
                    font-weight: 700;
                    color: white;
                }

                .stat-label {
                    font-size: 0.7rem;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                }

                /* Media Grid */
                .post-media {
                    display: grid;
                    gap: 4px;
                    margin-bottom: 16px;
                    border-radius: 12px;
                    overflow: hidden;
                }

                .media-count-1 { grid-template-columns: 1fr; }
                .media-count-2 { grid-template-columns: 1fr 1fr; }
                .media-count-3 { grid-template-columns: 2fr 1fr; }
                .media-count-4 { grid-template-columns: 1fr 1fr; }

                .media-item {
                    position: relative;
                    aspect-ratio: 16/9;
                }

                .media-item img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .media-more {
                    position: absolute;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: white;
                }

                /* Engagement Stats */
                .engagement-stats {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    margin-bottom: 8px;
                }

                .reaction-summary {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .reaction-mini {
                    font-size: 1rem;
                }

                .reaction-count, .count-item {
                    font-size: 0.85rem;
                    color: rgba(255, 255, 255, 0.5);
                }

                .engagement-counts {
                    display: flex;
                    gap: 16px;
                }

                /* Action Buttons */
                .action-buttons {
                    display: flex;
                    gap: 8px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .action-btn {
                    flex: 1;
                    padding: 10px;
                    background: transparent;
                    border: none;
                    border-radius: 8px;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .action-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }

                .action-btn.highlight {
                    color: #FF6B35;
                }

                .action-btn.highlight:hover {
                    background: rgba(255, 107, 53, 0.2);
                }

                /* Comments */
                .comments-section {
                    padding-top: 16px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .comment-input {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 16px;
                }

                .comment-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                }

                .comment-field {
                    flex: 1;
                    padding: 10px 16px;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    border-radius: 20px;
                    color: white;
                    font-size: 0.9rem;
                }

                .comment-field::placeholder {
                    color: rgba(255, 255, 255, 0.4);
                }

                .comment-item {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 12px;
                }

                .comment-content {
                    background: rgba(255, 255, 255, 0.05);
                    padding: 10px 14px;
                    border-radius: 12px;
                }

                .comment-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 4px;
                }

                .comment-author {
                    font-weight: 600;
                    font-size: 0.85rem;
                    color: white;
                }

                .comment-text {
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 0.9rem;
                    margin: 0;
                }
            `}</style>
        </div>
    );

    // Wrap with heat map and GTO master effects
    return (
        <HeatMapBorder recentEngagement={recentEngagement}>
            {isGTOMaster ? (
                <GTOMasterGlow isGTOMaster={true}>
                    {CardContent}
                </GTOMasterGlow>
            ) : CardContent}
        </HeatMapBorder>
    );
};

export default PokerFeedCard;
