/**
 * 🎬 FACEBOOK-STYLE REELS
 * src/app/social/components/FacebookReels.jsx
 * 
 * Short-form video content like Facebook/Instagram Reels
 */

import React, { useState, useRef } from 'react';
import { FBAvatar, FB_COLORS } from './FacebookStyleCard';

// ═══════════════════════════════════════════════════════════════════════════
// 🎬 REEL CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const ReelCard = ({
    reel,
    autoPlay = false,
    onPlay,
    onLike,
    onComment,
    onShare
}) => {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [liked, setLiked] = useState(reel?.userLiked || false);

    const handlePlayPause = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
        onPlay?.(reel.id);
    };

    const handleLike = () => {
        setLiked(!liked);
        onLike?.(reel.id, !liked);
    };

    return (
        <div className="fb-reel-card" onClick={handlePlayPause}>
            {/* Video or Thumbnail */}
            {reel.videoUrl ? (
                <video
                    ref={videoRef}
                    src={reel.videoUrl}
                    poster={reel.thumbnail}
                    loop
                    muted
                    playsInline
                />
            ) : (
                <img src={reel.thumbnail} alt="" />
            )}

            {/* Gradient Overlay */}
            <div className="reel-gradient" />


            {/* User Info */}
            <div className="reel-user">
                <FBAvatar src={reel.user?.avatar} size={32} />
                <span className="reel-username">{reel.user?.name}</span>
                {!reel.isFollowing && (
                    <button className="follow-btn">Follow</button>
                )}
            </div>

            {/* Description */}
            <div className="reel-description">
                {reel.description}
            </div>

            {/* Music/Audio */}
            {reel.audio && (
                <div className="reel-audio">
                    <span className="music-icon">🎵</span>
                    <span className="audio-name">{reel.audio}</span>
                </div>
            )}

            {/* Right Actions */}
            <div className="reel-actions">
                <button
                    className={`reel-action ${liked ? 'liked' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleLike(); }}
                >
                    <span className="action-icon">{liked ? '❤️' : '🤍'}</span>
                    <span className="action-count">{reel.likeCount || 0}</span>
                </button>
                <button
                    className="reel-action"
                    onClick={(e) => { e.stopPropagation(); onComment?.(reel.id); }}
                >
                    <span className="action-icon">💬</span>
                    <span className="action-count">{reel.commentCount || 0}</span>
                </button>
                <button
                    className="reel-action"
                    onClick={(e) => { e.stopPropagation(); onShare?.(reel.id); }}
                >
                    <span className="action-icon">↗️</span>
                    <span className="action-count">{reel.shareCount || 0}</span>
                </button>
                <button className="reel-action">
                    <span className="action-icon">⋯</span>
                </button>
            </div>

            <style>{`
                .fb-reel-card {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    min-height: 500px;
                    max-height: 90vh;
                    background: #000;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                }

                .fb-reel-card video,
                .fb-reel-card > img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .reel-gradient {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 50%;
                    background: linear-gradient(transparent, rgba(0,0,0,0.8));
                    pointer-events: none;
                }

                .reel-play-btn {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 48px;
                    opacity: 0.9;
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
                }

                .reel-user {
                    position: absolute;
                    bottom: 80px;
                    left: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .reel-username {
                    color: white;
                    font-weight: 600;
                    font-size: 14px;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                }

                .follow-btn {
                    padding: 4px 12px;
                    background: transparent;
                    border: 1px solid white;
                    border-radius: 4px;
                    color: white;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .follow-btn:hover {
                    background: rgba(255,255,255,0.1);
                }

                .reel-description {
                    position: absolute;
                    bottom: 48px;
                    left: 12px;
                    right: 60px;
                    color: white;
                    font-size: 14px;
                    line-height: 1.3;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                }

                .reel-audio {
                    position: absolute;
                    bottom: 16px;
                    left: 12px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: white;
                    font-size: 12px;
                }

                .music-icon {
                    font-size: 14px;
                }

                .audio-name {
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .reel-actions {
                    position: absolute;
                    right: 8px;
                    bottom: 100px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .reel-action {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                }

                .action-icon {
                    font-size: 24px;
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
                }

                .action-count {
                    color: white;
                    font-size: 12px;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                }

                .reel-action.liked .action-icon {
                    animation: like-pop 0.3s ease;
                }

                @keyframes like-pop {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.3); }
                    100% { transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎬 REELS CAROUSEL (Home Feed Version)
// ═══════════════════════════════════════════════════════════════════════════

export const ReelsCarousel = ({ reels = [], onViewAll }) => {
    const scrollRef = useRef(null);

    const scroll = (direction) => {
        if (scrollRef.current) {
            const amount = direction === 'left' ? -300 : 300;
            scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    return (
        <div className="fb-reels-section">
            <div className="reels-header">
                <h3 className="reels-title">
                    <span className="title-icon">🎬</span>
                    Reels
                </h3>
                <button className="view-all-btn" onClick={onViewAll}>
                    See all reels →
                </button>
            </div>

            <div className="reels-scroll-container">
                <button className="scroll-btn left" onClick={() => scroll('left')}>‹</button>

                <div className="reels-row" ref={scrollRef}>
                    {reels.map((reel, i) => (
                        <div key={i} className="reel-preview">
                            <div className="reel-thumb">
                                <img src={reel.thumbnail} alt="" />
                                <div className="reel-overlay">
                                    <span className="view-count">{reel.viewCount} views</span>
                                </div>
                            </div>
                            <div className="reel-info">
                                <span className="reel-desc">{reel.description?.slice(0, 40)}...</span>
                            </div>
                        </div>
                    ))}
                </div>

                <button className="scroll-btn right" onClick={() => scroll('right')}>›</button>
            </div>

            <style>{`
                .fb-reels-section {
                    background: ${FB_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    margin-bottom: 16px;
                    padding: 12px;
                }

                .reels-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding: 0 4px;
                }

                .reels-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 17px;
                    font-weight: 600;
                    color: ${FB_COLORS.textPrimary};
                    margin: 0;
                }

                .title-icon {
                    font-size: 20px;
                }

                .view-all-btn {
                    background: none;
                    border: none;
                    color: ${FB_COLORS.blue};
                    font-size: 15px;
                    font-weight: 500;
                    cursor: pointer;
                }

                .view-all-btn:hover {
                    text-decoration: underline;
                }

                .reels-scroll-container {
                    position: relative;
                }

                .reels-row {
                    display: flex;
                    gap: 8px;
                    overflow-x: auto;
                    scroll-behavior: smooth;
                    padding: 4px;
                    scrollbar-width: none;
                }

                .reels-row::-webkit-scrollbar {
                    display: none;
                }

                .scroll-btn {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 40px;
                    height: 40px;
                    background: ${FB_COLORS.bgWhite};
                    border: 1px solid ${FB_COLORS.divider};
                    border-radius: 50%;
                    font-size: 20px;
                    cursor: pointer;
                    z-index: 10;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .scroll-btn:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .scroll-btn.left { left: -8px; }
                .scroll-btn.right { right: -8px; }

                .reel-preview {
                    flex-shrink: 0;
                    width: 140px;
                    cursor: pointer;
                }

                .reel-thumb {
                    position: relative;
                    width: 140px;
                    height: 250px;
                    border-radius: 8px;
                    overflow: hidden;
                }

                .reel-thumb img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .reel-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(0,0,0,0.2);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .reel-preview:hover .reel-overlay {
                    opacity: 1;
                }

                .play-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(0,0,0,0.6);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    color: white;
                }

                .view-count {
                    color: white;
                    font-size: 13px;
                    font-weight: 600;
                }

                .reel-info {
                    padding: 8px 4px;
                }

                .reel-desc {
                    font-size: 13px;
                    color: ${FB_COLORS.textPrimary};
                    line-height: 1.3;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    ReelCard,
    ReelsCarousel
};
