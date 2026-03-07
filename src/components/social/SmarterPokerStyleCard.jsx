/**
 * 🌐 smarter-poker-style FEED CARD
 * src/app/social/components/SmarterPokerStyleCard.jsx
 * 
 * Light, bright, familiar SmarterPoker UI with poker integration
 */

import React, { useState } from 'react';
import { getAuthorDisplayName } from '../../utils/displayName';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 FACEBOOK COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════════════

export const SP_COLORS = {
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

export const SPAvatar = ({ src, name, size = 40, online = false }) => (
    <div className="sp-avatar-container" style={{ position: 'relative', width: size, height: size }}>
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
    <div className="sp-create-post">
        <div className="sp-create-post-header">
            <SPAvatar src={user?.avatar} name={user?.name} size={40} />
            <button className="sp-create-input">
                What's on your mind, {user?.firstName || 'there'}?
            </button>
        </div>
        <div className="sp-create-divider" />
        <div className="sp-create-actions">
            <button className="sp-create-btn live">
                <span className="icon">🔴</span> Live Session
            </button>
            <button className="sp-create-btn photo">
                <span className="icon">📷</span> Photo/Video
            </button>
            <button className="sp-create-btn hand">
                <span className="icon">🃏</span> Share Hand
            </button>
        </div>

        <style>{`
            .sp-create-post {
                background: ${SP_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: ${SP_COLORS.shadow};
                margin-bottom: 16px;
                padding: 12px 16px;
            }

            .sp-create-post-header {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .sp-create-input {
                flex: 1;
                background: ${SP_COLORS.bgMain};
                border: none;
                border-radius: 20px;
                padding: 10px 16px;
                font-size: 17px;
                color: ${SP_COLORS.textSecondary};
                text-align: left;
                cursor: pointer;
            }

            .sp-create-input:hover {
                background: ${SP_COLORS.bgHover};
            }

            .sp-create-divider {
                height: 1px;
                background: ${SP_COLORS.divider};
                margin: 12px 0;
            }

            .sp-create-actions {
                display: flex;
                justify-content: space-around;
            }

            .sp-create-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
                background: transparent;
                border: none;
                border-radius: 6px;
                font-size: 15px;
                font-weight: 600;
                color: ${SP_COLORS.textSecondary};
                cursor: pointer;
            }

            .sp-create-btn:hover {
                background: ${SP_COLORS.bgHover};
            }

            .sp-create-btn.live .icon { color: #F02849; }
            .sp-create-btn.photo .icon { color: #45BD62; }
            .sp-create-btn.hand .icon { color: ${SP_COLORS.pokerOrange}; }

            .sp-create-btn .icon {
                font-size: 20px;
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📰 POST CARD
// ═══════════════════════════════════════════════════════════════════════════

export const SPPostCard = ({
    post,
    user,
    onLike,
    onComment,
    onShare
}) => {
    const [liked, setLiked] = useState(post.userLiked || post.isLiked || false);
    const [showComments, setShowComments] = useState(false);

    // Support both old and new data structures
    const author = user || post.author || post.user;
    const authorName = getAuthorDisplayName(author);
    const authorAvatar = author?.avatar || author?.avatarUrl || null;
    const authorTier = author?.tier || (author?.isShark ? 'SHARK' : author?.isGTO ? 'GTO_MASTER' : null);

    // Support both flat and nested engagement structures
    const likeCount = post.engagement?.likeCount ?? post.likeCount ?? 0;
    const commentCount = post.engagement?.commentCount ?? post.commentCount ?? 0;
    const shareCount = post.engagement?.shareCount ?? post.shareCount ?? 0;

    // Support both content and text properties
    const postContent = post.content || post.text;

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
        <div className="sp-post">
            {/* Header */}
            <div className="sp-post-header">
                <SPAvatar src={authorAvatar} name={authorName} size={40} online={author?.online} />
                <div className="sp-post-meta">
                    <div className="sp-post-author">
                        <span className="sp-post-name">{authorName}</span>
                        {authorTier === 'SHARK' && <span className="badge-shark">🦈 Shark</span>}
                        {authorTier === 'GTO_MASTER' && <span className="badge-gto">👑 GTO</span>}
                        {author?.isVerified && <span className="badge-verified">✓</span>}
                    </div>
                    <div className="sp-post-time">
                        {formatTime(post.createdAt)} · 🌐
                    </div>
                </div>
                <button className="sp-post-more">⋯</button>
            </div>

            {/* Content */}
            <div className="sp-post-content">
                {postContent && <p className="sp-post-text">{postContent}</p>}

                {/* Hand History (Poker-specific) */}
                {post.handData && (
                    <div className="sp-hand-embed">
                        <div className="sp-hand-header">
                            <span className="stakes">{post.handData.stakes}</span>
                            <span className={`result ${post.handData.won ? 'win' : 'loss'}`}>
                                {post.handData.won ? '+' : '-'}${post.handData.amount}
                            </span>
                        </div>
                        <div className="sp-hand-cards">
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

                {/* Media Grid - supports multiple images/videos */}
                {(post.mediaUrls?.length > 0 || post.media) && (
                    <div className="sp-post-media">
                        {/* Support both array and single item */}
                        {post.mediaUrls?.length > 0 ? (
                            <div className={`media-grid media-count-${Math.min(post.mediaUrls.length, 4)}`}>
                                {post.mediaUrls.slice(0, 4).map((media, idx) => {
                                    const mediaUrl = typeof media === 'string' ? media : media.url;
                                    const mediaType = typeof media === 'string' ? media : media.type;
                                    // Detect video URLs: YouTube, Shorts, or video file extensions
                                    const isVideo = mediaType?.startsWith('video') ||
                                        mediaUrl?.includes('youtube.com') ||
                                        mediaUrl?.includes('youtu.be') ||
                                        mediaUrl?.match(/\.(mp4|webm|mov|avi)(\?|$)/i);

                                    return (
                                        <div key={idx} className="media-item">
                                            {isVideo ? (
                                                <>
                                                    <img
                                                        src={media.thumbnail || `https://img.youtube.com/vi/${mediaUrl?.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1]}/hqdefault.jpg`}
                                                        alt={`Video ${idx + 1}`}
                                                        loading="lazy"
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                    {/* Play Button Overlay */}
                                                    <div className="video-play-overlay">
                                                        <div className="play-button">▶</div>
                                                    </div>
                                                </>
                                            ) : (
                                                <img
                                                    src={mediaUrl}
                                                    alt={`Media ${idx + 1}`}
                                                    loading="lazy"
                                                />
                                            )}
                                            {idx === 3 && post.mediaUrls.length > 4 && (
                                                <div className="more-media-overlay">
                                                    +{post.mediaUrls.length - 4}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <img src={post.media} alt="Post" />
                        )}
                    </div>
                )}
            </div>

            {/* Reactions Count */}
            <div className="sp-post-reactions">
                <div className="reaction-icons">
                    <span className="reaction-emoji">👍</span>
                    <span className="reaction-emoji">❤️</span>
                    <span className="reaction-emoji">🔥</span>
                </div>
                <span className="reaction-count">{likeCount}</span>
                <div className="comment-share-count">
                    {commentCount > 0 && <span>{commentCount} comments</span>}
                    {shareCount > 0 && <span>{shareCount} shares</span>}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="sp-post-actions">
                <button
                    className={`sp-action-btn ${liked ? 'liked' : ''}`}
                    onClick={handleLike}
                >
                    <span className="icon">{liked ? '👍' : '👍'}</span>
                    <span>Like</span>
                </button>
                <button
                    className="sp-action-btn"
                    onClick={() => setShowComments(!showComments)}
                >
                    <span className="icon">💬</span>
                    <span>Comment</span>
                </button>
                <button
                    className="sp-action-btn"
                    onClick={() => onShare?.(post.id)}
                >
                    <span className="icon">↗️</span>
                    <span>Share</span>
                </button>
            </div>

            {/* Comments */}
            {showComments && (
                <div className="sp-comments">
                    <div className="sp-comment-input">
                        <SPAvatar size={32} />
                        <input type="text" placeholder="Write A Comment..." />
                    </div>
                    {post.comments?.map((comment, i) => (
                        <div key={i} className="sp-comment">
                            <SPAvatar src={comment.user?.avatar || comment.author?.avatarUrl} size={32} />
                            <div className="sp-comment-content">
                                <span className="sp-comment-author">{getAuthorDisplayName(comment.user || comment.author)}</span>
                                <span className="sp-comment-text">{comment.text || comment.content}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .sp-post {
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: ${SP_COLORS.shadow};
                    margin-bottom: 16px;
                    overflow: hidden;
                }

                .sp-post-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                }

                .sp-post-meta {
                    flex: 1;
                }

                .sp-post-author {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .sp-post-name {
                    font-weight: 600;
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
                    cursor: pointer;
                }

                .sp-post-name:hover {
                    text-decoration: underline;
                }

                .badge-shark, .badge-gto {
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-weight: 600;
                }

                .badge-shark {
                    background: ${SP_COLORS.blueLight};
                    color: ${SP_COLORS.blue};
                }

                .badge-gto {
                    background: linear-gradient(135deg, ${SP_COLORS.pokerGold}, #FEF08A);
                    color: #92400E;
                }

                .sp-post-time {
                    font-size: 13px;
                    color: ${SP_COLORS.textSecondary};
                }

                .sp-post-more {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    font-size: 16px;
                    color: ${SP_COLORS.textSecondary};
                    cursor: pointer;
                }

                .sp-post-more:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .sp-post-content {
                    padding: 0 16px 12px;
                }

                .sp-post-text {
                    font-size: 15px;
                    line-height: 1.34;
                    color: ${SP_COLORS.textPrimary};
                    margin: 0 0 12px;
                }

                /* Hand Embed */
                .sp-hand-embed {
                    background: ${SP_COLORS.bgMain};
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 12px;
                }

                .sp-hand-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-weight: 600;
                }

                .stakes { color: ${SP_COLORS.textSecondary}; }
                .result.win { color: ${SP_COLORS.pokerGreen}; }
                .result.loss { color: #EF4444; }

                .sp-hand-cards {
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
                    color: ${SP_COLORS.textSecondary};
                    margin-left: 8px;
                }

                /* Media Grid */
                .sp-post-media {
                    margin-left: -16px;
                    margin-right: -16px;
                }

                .sp-post-media > img {
                    width: 100%;
                    max-height: 600px;
                    object-fit: cover;
                }

                .media-grid {
                    display: grid;
                    gap: 2px;
                }

                .media-grid.media-count-1 {
                    grid-template-columns: 1fr;
                }

                .media-grid.media-count-2 {
                    grid-template-columns: 1fr 1fr;
                }

                .media-grid.media-count-3 {
                    grid-template-columns: 2fr 1fr;
                    grid-template-rows: 1fr 1fr;
                }

                .media-grid.media-count-3 .media-item:first-child {
                    grid-row: span 2;
                }

                .media-grid.media-count-4 {
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr 1fr;
                }

                .media-item {
                    position: relative;
                    overflow: hidden;
                    min-height: 150px;
                    max-height: 300px;
                    background: ${SP_COLORS.bgMain};
                }

                .media-item img,
                .media-item video {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .media-item video {
                    background: #000;
                }

                .more-media-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 32px;
                    font-weight: 700;
                }

                /* Video Play Button Overlay */
                .video-play-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                }

                .video-play-overlay .play-button {
                    width: 64px;
                    height: 64px;
                    background: rgba(255, 255, 255, 0.9);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    color: #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }

                .media-item:hover .video-play-overlay .play-button {
                    background: rgba(255, 255, 255, 1);
                    transform: scale(1.05);
                }

                /* Reactions */
                .sp-post-reactions {
                    display: flex;
                    align-items: center;
                    padding: 10px 16px;
                    border-bottom: 1px solid ${SP_COLORS.divider};
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
                    color: ${SP_COLORS.textSecondary};
                    margin-right: auto;
                }

                .comment-share-count {
                    display: flex;
                    gap: 16px;
                    font-size: 15px;
                    color: ${SP_COLORS.textSecondary};
                }

                /* Actions */
                .sp-post-actions {
                    display: flex;
                    padding: 4px 8px;
                }

                .sp-action-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 10px 0;
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    color: ${SP_COLORS.textSecondary};
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .sp-action-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .sp-action-btn.liked {
                    color: ${SP_COLORS.blue};
                }

                .sp-action-btn .icon {
                    font-size: 18px;
                }

                /* Comments */
                .sp-comments {
                    padding: 8px 16px 16px;
                    background: ${SP_COLORS.bgMain};
                }

                .sp-comment-input {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 12px;
                }

                .sp-comment-input input {
                    flex: 1;
                    background: ${SP_COLORS.bgWhite};
                    border: none;
                    border-radius: 20px;
                    padding: 8px 16px;
                    font-size: 15px;
                }

                .sp-comment {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 8px;
                }

                .sp-comment-content {
                    background: ${SP_COLORS.bgWhite};
                    padding: 8px 12px;
                    border-radius: 18px;
                }

                .sp-comment-author {
                    font-weight: 600;
                    font-size: 13px;
                    color: ${SP_COLORS.textPrimary};
                    margin-right: 4px;
                }

                .sp-comment-text {
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
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
        <div className="sp-stories">
            {/* Create Story */}
            <div className="sp-story create">
                <div className="story-bg">
                    <img src={currentUser?.avatar || '/default-avatar.png'} alt="" />
                </div>
                <div className="create-btn">+</div>
                <span className="story-label">Create Story</span>
            </div>

            {/* User Stories */}
            {stories.map((story, i) => (
                <div
                    key={i}
                    className={`sp-story ${story.viewed ? '' : 'unviewed'}`}
                >
                    <img src={story.thumbnail} alt="" className="story-bg" />
                    <div className="story-avatar-ring">
                        <img src={story.user?.avatar} alt={story.user?.name} />
                    </div>
                    <span className="story-label">{story.user?.firstName || story.user?.name}</span>
                </div>
            ))}

            <style>{`
                .sp-stories {
                    display: flex;
                    gap: 8px;
                    padding: 16px;
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: ${SP_COLORS.shadow};
                    margin-bottom: 16px;
                    overflow-x: auto;
                }

                .sp-stories::-webkit-scrollbar {
                    display: none;
                }

                .sp-story {
                    position: relative;
                    width: 112px;
                    height: 200px;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    flex-shrink: 0;
                }

                .sp-story:hover {
                    transform: scale(1.02);
                }

                .sp-story .story-bg,
                .sp-story > img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .sp-story.create {
                    background: linear-gradient(to bottom, transparent 60%, ${SP_COLORS.bgWhite} 60%);
                }

                .sp-story.create .story-bg {
                    height: 70%;
                    border-radius: 12px 12px 0 0;
                    overflow: hidden;
                }

                .sp-story.create .story-bg img {
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
                    background: ${SP_COLORS.blue};
                    border: 4px solid ${SP_COLORS.bgWhite};
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
                    background: linear-gradient(135deg, ${SP_COLORS.blue}, #00D9FF);
                }

                .sp-story.unviewed .story-avatar-ring {
                    background: linear-gradient(135deg, ${SP_COLORS.blue}, #00D9FF);
                }

                .story-avatar-ring img {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 3px solid ${SP_COLORS.bgWhite};
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

                .sp-story.create .story-label {
                    color: ${SP_COLORS.textPrimary};
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
    SPAvatar,
    CreatePostBox,
    SPPostCard,
    FBStoriesRow,
    SP_COLORS
};
