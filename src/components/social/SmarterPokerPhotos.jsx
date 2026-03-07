/**
 * 📸 smarter-poker-style PHOTO GALLERY
 * src/app/social/components/SmarterPokerPhotos.jsx
 * 
 * Photo grid and lightbox like SmarterPoker Photos
 */

import React, { useState } from 'react';
import { SPAvatar, SP_COLORS } from './SmarterPokerStyleCard';

// ═══════════════════════════════════════════════════════════════════════════
// 📸 PHOTO GRID (In Posts)
// ═══════════════════════════════════════════════════════════════════════════

export const PhotoGrid = ({ photos = [], onPhotoClick }) => {
    const count = photos.length;

    if (count === 0) return null;

    const getGridClass = () => {
        if (count === 1) return 'grid-1';
        if (count === 2) return 'grid-2';
        if (count === 3) return 'grid-3';
        if (count === 4) return 'grid-4';
        return 'grid-5plus';
    };

    return (
        <div className={`sp-photo-grid ${getGridClass()}`}>
            {photos.slice(0, 5).map((photo, i) => (
                <div
                    key={i}
                    className="photo-item"
                    onClick={() => onPhotoClick?.(i)}
                >
                    <img src={photo.url || photo} alt="" />
                    {i === 4 && count > 5 && (
                        <div className="more-overlay">
                            +{count - 5}
                        </div>
                    )}
                </div>
            ))}

            <style>{`
                .sp-photo-grid {
                    display: grid;
                    gap: 2px;
                    cursor: pointer;
                    border-radius: 8px;
                    overflow: hidden;
                }

                .sp-photo-grid.grid-1 {
                    grid-template-columns: 1fr;
                }

                .sp-photo-grid.grid-2 {
                    grid-template-columns: 1fr 1fr;
                }

                .sp-photo-grid.grid-3 {
                    grid-template-columns: 2fr 1fr;
                    grid-template-rows: 1fr 1fr;
                }

                .sp-photo-grid.grid-3 .photo-item:first-child {
                    grid-row: 1 / 3;
                }

                .sp-photo-grid.grid-4 {
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr 1fr;
                }

                .sp-photo-grid.grid-5plus {
                    grid-template-columns: 1fr 1fr 1fr;
                    grid-template-rows: 1fr 1fr;
                }

                .sp-photo-grid.grid-5plus .photo-item:first-child {
                    grid-column: 1 / 3;
                }

                .photo-item {
                    position: relative;
                    overflow: hidden;
                    min-height: 150px;
                }

                .grid-1 .photo-item {
                    max-height: 500px;
                }

                .photo-item img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.2s;
                }

                .photo-item:hover img {
                    transform: scale(1.02);
                }

                .more-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 32px;
                    font-weight: 600;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🖼️ PHOTO LIGHTBOX
// ═══════════════════════════════════════════════════════════════════════════

export const PhotoLightbox = ({
    photos = [],
    initialIndex = 0,
    post,
    user,
    onClose
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [showComments, setShowComments] = useState(true);

    const goNext = () => setCurrentIndex((i) => (i + 1) % photos.length);
    const goPrev = () => setCurrentIndex((i) => (i - 1 + photos.length) % photos.length);

    const currentPhoto = photos[currentIndex];

    return (
        <div className="sp-lightbox">
            {/* Close Button */}
            <button className="close-btn" onClick={onClose}>✕</button>

            {/* Main Image Area */}
            <div className="lightbox-main">
                <button className="nav-btn prev" onClick={goPrev}>‹</button>

                <div className="image-container">
                    <img src={currentPhoto?.url || currentPhoto} alt="" />
                </div>

                <button className="nav-btn next" onClick={goNext}>›</button>
            </div>

            {/* Right Panel (Comments) */}
            {showComments && (
                <div className="lightbox-panel">
                    {/* Post Header */}
                    <div className="panel-header">
                        <SPAvatar src={user?.avatar} size={40} />
                        <div className="post-meta">
                            <span className="post-author">{user?.name}</span>
                            <span className="post-time">{post?.time || 'Just now'}</span>
                        </div>
                        <button className="more-btn">⋯</button>
                    </div>

                    {/* Caption */}
                    {post?.text && (
                        <div className="panel-caption">
                            {post.text}
                        </div>
                    )}

                    {/* Reactions */}
                    <div className="panel-reactions">
                        <div className="reaction-icons">
                            <span>👍</span><span>❤️</span><span>🔥</span>
                        </div>
                        <span className="reaction-count">{post?.likeCount || 0}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="panel-actions">
                        <button className="action-btn">👍 Like</button>
                        <button className="action-btn">💬 Comment</button>
                        <button className="action-btn">↗️ Share</button>
                    </div>

                    {/* Comments */}
                    <div className="panel-comments">
                        {post?.comments?.map((comment, i) => (
                            <div key={i} className="comment">
                                <SPAvatar src={comment.user?.avatar} size={32} />
                                <div className="comment-content">
                                    <span className="comment-author">{comment.user?.name}</span>
                                    <span className="comment-text">{comment.text}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Comment Input */}
                    <div className="panel-input">
                        <SPAvatar size={32} />
                        <input type="text" placeholder="Write A Comment..." />
                    </div>
                </div>
            )}

            {/* Toggle Panel Button */}
            <button
                className="toggle-panel-btn"
                onClick={() => setShowComments(!showComments)}
            >
                {showComments ? '→' : '←'}
            </button>

            {/* Photo Counter */}
            <div className="photo-counter">
                {currentIndex + 1} / {photos.length}
            </div>

            <style>{`
                .sp-lightbox {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.9);
                    z-index: 9999;
                    display: flex;
                }

                .close-btn {
                    position: absolute;
                    top: 16px;
                    left: 16px;
                    width: 40px;
                    height: 40px;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    border-radius: 50%;
                    color: white;
                    font-size: 20px;
                    cursor: pointer;
                    z-index: 10;
                }

                .close-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .lightbox-main {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                }

                .image-container {
                    max-width: 90%;
                    max-height: 90vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .image-container img {
                    max-width: 100%;
                    max-height: 90vh;
                    object-fit: contain;
                }

                .nav-btn {
                    position: absolute;
                    width: 48px;
                    height: 48px;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    border-radius: 50%;
                    color: white;
                    font-size: 32px;
                    cursor: pointer;
                    z-index: 10;
                }

                .nav-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .nav-btn.prev { left: 16px; }
                .nav-btn.next { right: 16px; }

                .lightbox-panel {
                    width: 360px;
                    background: ${SP_COLORS.bgWhite};
                    display: flex;
                    flex-direction: column;
                    border-left: 1px solid ${SP_COLORS.divider};
                }

                .panel-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    border-bottom: 1px solid ${SP_COLORS.divider};
                }

                .post-meta {
                    flex: 1;
                }

                .post-author {
                    display: block;
                    font-weight: 600;
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
                }

                .post-time {
                    font-size: 13px;
                    color: ${SP_COLORS.textSecondary};
                }

                .more-btn {
                    width: 32px;
                    height: 32px;
                    background: none;
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;
                }

                .more-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .panel-caption {
                    padding: 16px;
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
                    line-height: 1.34;
                }

                .panel-reactions {
                    display: flex;
                    align-items: center;
                    padding: 0 16px 8px;
                    gap: 4px;
                }

                .reaction-icons span {
                    font-size: 16px;
                    margin-left: -4px;
                }

                .reaction-icons span:first-child {
                    margin-left: 0;
                }

                .reaction-count {
                    color: ${SP_COLORS.textSecondary};
                    font-size: 15px;
                }

                .panel-actions {
                    display: flex;
                    padding: 8px 16px;
                    border-top: 1px solid ${SP_COLORS.divider};
                    border-bottom: 1px solid ${SP_COLORS.divider};
                }

                .panel-actions .action-btn {
                    flex: 1;
                    padding: 8px;
                    background: none;
                    border: none;
                    border-radius: 4px;
                    color: ${SP_COLORS.textSecondary};
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .panel-actions .action-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .panel-comments {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                }

                .comment {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 12px;
                }

                .comment-content {
                    background: ${SP_COLORS.bgMain};
                    padding: 8px 12px;
                    border-radius: 18px;
                }

                .comment-author {
                    font-weight: 600;
                    font-size: 13px;
                    color: ${SP_COLORS.textPrimary};
                    margin-right: 4px;
                }

                .comment-text {
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
                }

                .panel-input {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    border-top: 1px solid ${SP_COLORS.divider};
                }

                .panel-input input {
                    flex: 1;
                    padding: 8px 16px;
                    background: ${SP_COLORS.bgMain};
                    border: none;
                    border-radius: 20px;
                    font-size: 15px;
                }

                .toggle-panel-btn {
                    position: absolute;
                    right: 360px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 32px;
                    height: 48px;
                    background: ${SP_COLORS.bgWhite};
                    border: 1px solid ${SP_COLORS.divider};
                    border-right: none;
                    border-radius: 4px 0 0 4px;
                    cursor: pointer;
                    z-index: 10;
                }

                .photo-counter {
                    position: absolute;
                    bottom: 16px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.6);
                    color: white;
                    padding: 6px 12px;
                    border-radius: 16px;
                    font-size: 14px;
                }

                @media (max-width: 768px) {
                    .lightbox-panel {
                        display: none;
                    }
                    
                    .toggle-panel-btn {
                        display: none;
                    }
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📸 PHOTO ALBUM GRID
// ═══════════════════════════════════════════════════════════════════════════

export const PhotoAlbumGrid = ({ albums = [], onAlbumClick }) => (
    <div className="sp-album-grid">
        {albums.map((album, i) => (
            <div
                key={i}
                className="album-card"
                onClick={() => onAlbumClick?.(album.id)}
            >
                <div className="album-cover">
                    <img src={album.coverPhoto} alt={album.name} />
                </div>
                <div className="album-info">
                    <h4 className="album-name">{album.name}</h4>
                    <span className="album-count">{album.photoCount} photos</span>
                </div>
            </div>
        ))}

        <style>{`
            .sp-album-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 16px;
                padding: 16px;
            }

            .album-card {
                background: ${SP_COLORS.bgWhite};
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            }

            .album-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }

            .album-cover {
                aspect-ratio: 1;
                overflow: hidden;
            }

            .album-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .album-info {
                padding: 12px;
            }

            .album-name {
                font-size: 15px;
                font-weight: 600;
                color: ${SP_COLORS.textPrimary};
                margin: 0 0 4px;
            }

            .album-count {
                font-size: 13px;
                color: ${SP_COLORS.textSecondary};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    PhotoGrid,
    PhotoLightbox,
    PhotoAlbumGrid
};
