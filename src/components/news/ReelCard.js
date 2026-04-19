import React from 'react';
import { Play } from 'lucide-react';
import SPImage from '../common/SPImage';

const FALLBACK_IMAGES = {
    news: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=400'
};

function formatViews(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function getYouTubeVideoId(url) {
    if (!url) return null;
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return shortMatch[1];
    return null;
}

function getReelThumbnail(reel) {
    if (reel.thumbnail_url) return reel.thumbnail_url;
    const videoId = getYouTubeVideoId(reel.video_url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return FALLBACK_IMAGES.news;
}

export default function ReelCard({ reel, onClick }) {
    const openReel = () => {
        if (onClick) onClick();
    };

    // Get display values with proper fallbacks
    const thumbnailUrl = getReelThumbnail(reel);
    const displayTitle = reel.title || reel.caption?.split('\n')[0]?.replace(/^\s*/, '') || 'Poker Reel';
    const channelName = reel.channel_name || reel.profiles?.full_name || reel.profiles?.username || 'Smarter.Poker';
    const isYouTube = reel.video_url?.includes('youtube.com') || reel.video_url?.includes('youtu.be');

    return (
        <div
            className="reel-card"
            onClick={openReel}
        >
            <div className="reel-thumbnail">
                <SPImage
                    src={thumbnailUrl}
                    alt={displayTitle}
                    fill
                    style={{ objectFit: 'cover' }}
                    onError={(e) => { e.target.src = FALLBACK_IMAGES.news; }}
                />
                <div className="reel-overlay">
                    <Play size={32} fill="#fff" color={isYouTube ? '#ff0000' : '#fff'} />
                </div>
                <div className="reel-channel">{channelName}</div>
            </div>
            <div className="reel-info">
                <h4>{displayTitle}</h4>
                <div className="reel-meta">
                    <span>{formatViews(reel.view_count || 0)} views</span>
                </div>
            </div>

            <style jsx>{`
                .reel-card {
                    position: relative;
                    background: 
                        linear-gradient(135deg, rgba(30, 32, 38, 0.95) 0%, rgba(20, 22, 28, 0.98) 100%);
                    border: none;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
                }
                
                /* Chrome frame overlay for reel cards - border only, no glow */
                .reel-card::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border-radius: 12px;
                    border: 5px solid rgba(180, 195, 220, 0.9);
                    box-shadow: none;
                    pointer-events: none;
                    z-index: 100;
                }

                .reel-card:hover {
                    box-shadow: 
                        0 8px 32px rgba(236, 72, 153, 0.3);
                }
                
                .reel-card:hover::after {
                    border-color: rgba(236, 72, 153, 0.7);
                    box-shadow: 
                        inset 0 0 10px rgba(236, 72, 153, 0.4),
                        0 0 15px rgba(236, 72, 153, 0.4);
                }

                .reel-thumbnail {
                    position: relative;
                    aspect-ratio: 9/16;
                    overflow: hidden;
                }

                .reel-thumbnail img {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.3s;
                }

                .reel-card:hover .reel-thumbnail img {
                    transform: scale(1.05);
                }

                .reel-overlay {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.3);
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .reel-card:hover .reel-overlay {
                    opacity: 1;
                }

                .reel-channel {
                    position: absolute;
                    bottom: 8px;
                    left: 8px;
                    right: 8px;
                    padding: 4px 8px;
                    background: rgba(0, 0, 0, 0.75);
                    backdrop-filter: blur(4px);
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 600;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .reel-info {
                    padding: 10px;
                }

                .reel-info h4 {
                    font-size: 12px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 4px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    line-height: 1.3;
                }

                .reel-meta {
                    font-size: 10px;
                    color: rgba(255, 255, 255, 0.5);
                }
            `}</style>
        </div>
    );
}
