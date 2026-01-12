/**
 * 🌐 FACEBOOK-STYLE FEED CARD
 * src/app/social/components/FacebookStyleCard.jsx
 * 
 * Light, bright, familiar Facebook UI with poker integration
 */

import React, { useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 FACEBOOK COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════════════

export const FB_COLORS = {
    blue: '#1877F2',
    blueHover: '#166FE5',
    blueLight: '#E7F3FF',
    bgMain: '#F0F2F5',
    bgWhite: '#FFFFFF',
    bgHover: '#F2F2F2',
    textPrimary: '#050505',
    textSecondary: '#65676B',
    divider: '#E4E6EB',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
    // Poker accents (subtle)
    pokerOrange: '#FF6B35',
    pokerGreen: '#22C55E',
    pokerGold: '#FFD700'
};

// ═══════════════════════════════════════════════════════════════════════════
// 👤 USER AVATAR
// ═══════════════════════════════════════════════════════════════════════════

export const FBAvatar = ({ src, name, size = 40, online = false }) => (
    <div className="fb-avatar-container" style={{ position: 'relative', width: size, height: size }}>
        <img
            src={src || '/default-avatar.png'}
            alt={name}
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                objectFit: 'cover'
            }}
        />
        {online && (
            <span style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                background: '#31A24C',
                border: '2px solid white',
                borderRadius: '50%'
            }} />
        )}
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📝 CREATE POST BOX
// ═══════════════════════════════════════════════════════════════════════════

export const CreatePostBox = ({ user, onPost }) => (
    <div className="fb-create-post">
        <div className="fb-create-post-header">
            <FBAvatar src={user?.avatar} name={user?.name} size={40} />
            <button className="fb-create-input">
                What's on your mind, {user?.firstName || 'there'}?
            </button>
        </div>
        <div className="fb-create-divider" />
        <div className="fb-create-actions">
            <button className="fb-create-btn live">
                <span className="icon">🔴</span> Live Session
            </button>
            <button className="fb-create-btn photo">
                <span className="icon">📷</span> Photo/Video
            </button>
            <button className="fb-create-btn hand">
                <span className="icon">🃏</span> Share Hand
            </button>
        </div>

        <style>{`
            .fb-create-post {
                background: ${FB_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: ${FB_COLORS.shadow};
                margin-bottom: 16px;
                padding: 12px 16px;
            }

            .fb-create-post-header {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .fb-create-input {
                flex: 1;
                background: ${FB_COLORS.bgMain};
                border: none;
                border-radius: 20px;
                padding: 10px 16px;
                font-size: 17px;
                color: ${FB_COLORS.textSecondary};
                text-align: left;
                cursor: pointer;
            }

            .fb-create-input:hover {
                background: ${FB_COLORS.bgHover};
            }

            .fb-create-divider {
                height: 1px;
                background: ${FB_COLORS.divider};
                margin: 12px 0;
            }

            .fb-create-actions {
                display: flex;
                justify-content: space-around;
            }

            .fb-create-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
                background: transparent;
                border: none;
                border-radius: 6px;
                font-size: 15px;
                font-weight: 600;
                color: ${FB_COLORS.textSecondary};
                cursor: pointer;
            }

            .fb-create-btn:hover {
                background: ${FB_COLORS.bgHover};
            }

            .fb-create-btn.live .icon { color: #F02849; }
            .fb-create-btn.photo .icon { color: #45BD62; }
            .fb-create-btn.hand .icon { color: ${FB_COLORS.pokerOrange}; }

            .fb-create-btn .icon {
                font-size: 20px;
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📰 POST CARD
// ═══════════════════════════════════════════════════════════════════════════

export const FBPostCard = ({
    post,
    user,
    onLike,
    onComment,
    onShare
}) => {
    const [liked, setLiked] = useState(post.userLiked || false);
    const [showComments, setShowComments] = useState(false);

    const formatTime = (timestamp) => {
        const now = new Date();
        const postTime = new Date(timestamp);
        const diffMs = now - postTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        return postTime.toLocaleDateString();
    };

    const handleLike = () => {
        setLiked(!liked);
        onLike?.(post.id, !liked);
    };

    return (
        <div className="fb-post">
            {/* Header */}
            <div className="fb-post-header">
                <FBAvatar src={user?.avatar} name={user?.name} size={40} online={user?.online} />
                <div className="fb-post-meta">
                    <div className="fb-post-author">
                        <span className="fb-post-name">{user?.name}</span>
                        {user?.isShark && <span className="badge-shark">🦈 Shark</span>}
                        {user?.isGTO && <span className="badge-gto">👑 GTO</span>}
                    </div>
                    <div className="fb-post-time">
                        {formatTime(post.createdAt)} · 🌐
                    </div>
                </div>
                <button className="fb-post-more">⋯</button>
            </div>

            {/* Content */}
            <div className="fb-post-content">
                {post.text && <p className="fb-post-text">{post.text}</p>}

                {/* Hand History (Poker-specific) */}
                {post.handData && (
                    <div className="fb-hand-embed">
                        <div className="fb-hand-header">
                            <span className="stakes">{post.handData.stakes}</span>
                            <span className={`result ${post.handData.won ? 'win' : 'loss'}`}>
                                {post.handData.won ? '+' : '-'}${post.handData.amount}
                            </span>
                        </div>
                        <div className="fb-hand-cards">
                            {post.handData.heroCards?.map((card, i) => (
                                <span key={i} className={`playing-card ${card.includes('♥') || card.includes('♦') ? 'red' : 'black'}`}>
                                    {card}
                                </span>
                            ))}
                            {post.handData.board && (
                                <>
                                    <span className="board-label">Board:</span>
                                    {post.handData.board.map((card, i) => (
                                        <span key={i} className={`playing-card board ${card.includes('♥') || card.includes('♦') ? 'red' : 'black'}`}>
                                            {card}
                                        </span>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Media */}
                {post.media && (
                    <div className="fb-post-media">
                        <img src={post.media} alt="Post" />
                    </div>
                )}
            </div>

            {/* Reactions Count */}
            <div className="fb-post-reactions">
                <div className="reaction-icons">
                    <span className="reaction-emoji">👍</span>
                    <span className="reaction-emoji">❤️</span>
                    <span className="reaction-emoji">🔥</span>
                </div>
                <span className="reaction-count">{post.likeCount || 0}</span>
                <div className="comment-share-count">
                    {post.commentCount > 0 && <span>{post.commentCount} comments</span>}
                    {post.shareCount > 0 && <span>{post.shareCount} shares</span>}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="fb-post-actions">
                <button
                    className={`fb-action-btn ${liked ? 'liked' : ''}`}
                    onClick={handleLike}
                >
                    <span className="icon">{liked ? '👍' : '👍'}</span>
                    <span>Like</span>
                </button>
                <button
                    className="fb-action-btn"
                    onClick={() => setShowComments(!showComments)}
                >
                    <span className="icon">💬</span>
                    <span>Comment</span>
                </button>
                <button
                    className="fb-action-btn"
                    onClick={() => onShare?.(post.id)}
                >
                    <span className="icon">↗️</span>
                    <span>Share</span>
                </button>
            </div>

            {/* Comments */}
            {showComments && (
                <div className="fb-comments">
                    <div className="fb-comment-input">
                        <FBAvatar size={32} />
                        <input type="text" placeholder="Write a comment..." />
                    </div>
                    {post.comments?.map((comment, i) => (
                        <div key={i} className="fb-comment">
                            <FBAvatar src={comment.user?.avatar} size={32} />
                            <div className="fb-comment-content">
                                <span className="fb-comment-author">{comment.user?.name}</span>
                                <span className="fb-comment-text">{comment.text}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .fb-post {
                    background: ${FB_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: ${FB_COLORS.shadow};
                    margin-bottom: 16px;
                    overflow: hidden;
                }

                .fb-post-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                }

                .fb-post-meta {
                    flex: 1;
                }

                .fb-post-author {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .fb-post-name {
                    font-weight: 600;
                    font-size: 15px;
                    color: ${FB_COLORS.textPrimary};
                    cursor: pointer;
                }

                .fb-post-name:hover {
                    text-decoration: underline;
                }

                .badge-shark, .badge-gto {
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-weight: 600;
                }

                .badge-shark {
                    background: ${FB_COLORS.blueLight};
                    color: ${FB_COLORS.blue};
                }

                .badge-gto {
                    background: linear-gradient(135deg, ${FB_COLORS.pokerGold}, #FEF08A);
                    color: #92400E;
                }

                .fb-post-time {
                    font-size: 13px;
                    color: ${FB_COLORS.textSecondary};
                }

                .fb-post-more {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    font-size: 16px;
                    color: ${FB_COLORS.textSecondary};
                    cursor: pointer;
                }

                .fb-post-more:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .fb-post-content {
                    padding: 0 16px 12px;
                }

                .fb-post-text {
                    font-size: 15px;
                    line-height: 1.34;
                    color: ${FB_COLORS.textPrimary};
                    margin: 0 0 12px;
                }

                /* Hand Embed */
                .fb-hand-embed {
                    background: ${FB_COLORS.bgMain};
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 12px;
                }

                .fb-hand-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-weight: 600;
                }

                .stakes { color: ${FB_COLORS.textSecondary}; }
                .result.win { color: ${FB_COLORS.pokerGreen}; }
                .result.loss { color: #EF4444; }

                .fb-hand-cards {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    flex-wrap: wrap;
                }

                .playing-card {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 28px;
                    height: 38px;
                    padding: 0 4px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    font-weight: 700;
                }

                .playing-card.red { color: #DC2626; }
                .playing-card.black { color: #111; }
                .playing-card.board { 
                    background: #f5f5f5;
                    min-width: 24px;
                    height: 32px;
                    font-size: 11px;
                }

                .board-label {
                    font-size: 12px;
                    color: ${FB_COLORS.textSecondary};
                    margin-left: 8px;
                }

                /* Media */
                .fb-post-media img {
                    width: 100%;
                    max-height: 600px;
                    object-fit: cover;
                }

                /* Reactions */
                .fb-post-reactions {
                    display: flex;
                    align-items: center;
                    padding: 10px 16px;
                    border-bottom: 1px solid ${FB_COLORS.divider};
                }

                .reaction-icons {
                    display: flex;
                    margin-right: 4px;
                }

                .reaction-emoji {
                    font-size: 16px;
                    margin-left: -4px;
                }

                .reaction-emoji:first-child {
                    margin-left: 0;
                }

                .reaction-count {
                    font-size: 15px;
                    color: ${FB_COLORS.textSecondary};
                    margin-right: auto;
                }

                .comment-share-count {
                    display: flex;
                    gap: 16px;
                    font-size: 15px;
                    color: ${FB_COLORS.textSecondary};
                }

                /* Actions */
                .fb-post-actions {
                    display: flex;
                    padding: 4px 8px;
                }

                .fb-action-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 10px 0;
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    color: ${FB_COLORS.textSecondary};
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .fb-action-btn:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .fb-action-btn.liked {
                    color: ${FB_COLORS.blue};
                }

                .fb-action-btn .icon {
                    font-size: 18px;
                }

                /* Comments */
                .fb-comments {
                    padding: 8px 16px 16px;
                    background: ${FB_COLORS.bgMain};
                }

                .fb-comment-input {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 12px;
                }

                .fb-comment-input input {
                    flex: 1;
                    background: ${FB_COLORS.bgWhite};
                    border: none;
                    border-radius: 20px;
                    padding: 8px 16px;
                    font-size: 15px;
                }

                .fb-comment {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 8px;
                }

                .fb-comment-content {
                    background: ${FB_COLORS.bgWhite};
                    padding: 8px 12px;
                    border-radius: 18px;
                }

                .fb-comment-author {
                    font-weight: 600;
                    font-size: 13px;
                    color: ${FB_COLORS.textPrimary};
                    margin-right: 4px;
                }

                .fb-comment-text {
                    font-size: 15px;
                    color: ${FB_COLORS.textPrimary};
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📖 STORIES ROW
// ═══════════════════════════════════════════════════════════════════════════

export const FBStoriesRow = ({ stories = [], currentUser }) => {
    return (
        <div className="fb-stories">
            {/* Create Story */}
            <div className="fb-story create">
                <div className="story-bg">
                    <img src={currentUser?.avatar || '/default-avatar.png'} alt="" />
                </div>
                <div className="create-btn">+</div>
                <span className="story-label">Create story</span>
            </div>

            {/* User Stories */}
            {stories.map((story, i) => (
                <div
                    key={i}
                    className={`fb-story ${story.viewed ? '' : 'unviewed'}`}
                >
                    <img src={story.thumbnail} alt="" className="story-bg" />
                    <div className="story-avatar-ring">
                        <img src={story.user?.avatar} alt={story.user?.name} />
                    </div>
                    <span className="story-label">{story.user?.firstName || story.user?.name}</span>
                </div>
            ))}

            <style>{`
                .fb-stories {
                    display: flex;
                    gap: 8px;
                    padding: 16px;
                    background: ${FB_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: ${FB_COLORS.shadow};
                    margin-bottom: 16px;
                    overflow-x: auto;
                }

                .fb-stories::-webkit-scrollbar {
                    display: none;
                }

                .fb-story {
                    position: relative;
                    width: 112px;
                    height: 200px;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    flex-shrink: 0;
                }

                .fb-story:hover {
                    transform: scale(1.02);
                }

                .fb-story .story-bg,
                .fb-story > img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .fb-story.create {
                    background: linear-gradient(to bottom, transparent 60%, ${FB_COLORS.bgWhite} 60%);
                }

                .fb-story.create .story-bg {
                    height: 70%;
                    border-radius: 12px 12px 0 0;
                    overflow: hidden;
                }

                .fb-story.create .story-bg img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .create-btn {
                    position: absolute;
                    top: 60%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 40px;
                    height: 40px;
                    background: ${FB_COLORS.blue};
                    border: 4px solid ${FB_COLORS.bgWhite};
                    border-radius: 50%;
                    color: white;
                    font-size: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .story-avatar-ring {
                    position: absolute;
                    top: 12px;
                    left: 12px;
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    padding: 3px;
                    background: linear-gradient(135deg, ${FB_COLORS.blue}, #00D9FF);
                }

                .fb-story.unviewed .story-avatar-ring {
                    background: linear-gradient(135deg, ${FB_COLORS.blue}, #00D9FF);
                }

                .story-avatar-ring img {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 3px solid ${FB_COLORS.bgWhite};
                    object-fit: cover;
                }

                .story-label {
                    position: absolute;
                    bottom: 12px;
                    left: 12px;
                    right: 12px;
                    font-size: 13px;
                    font-weight: 600;
                    color: white;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .fb-story.create .story-label {
                    color: ${FB_COLORS.textPrimary};
                    text-shadow: none;
                    text-align: center;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    FBAvatar,
    CreatePostBox,
    FBPostCard,
    FBStoriesRow,
    FB_COLORS
};
