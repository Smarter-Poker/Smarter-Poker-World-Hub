/**
 * 📺 FACEBOOK-STYLE WATCH VIEW
 * src/app/social/views/FacebookWatchView.jsx
 * 
 * Video feed, live streams, and saved videos
 * Connected to SocialService
 */

import React, { useState, useEffect } from 'react';
import { FB_COLORS, FBAvatar } from '../components/FacebookStyleCard';
import { PokerReactionBar } from '../components/PokerReputationBadges';
import { useSocialOrb } from '../../providers/SocialOrbProvider';

// ═══════════════════════════════════════════════════════════════════════════
// 📺 WATCH SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════

const WatchSidebar = () => (
    <aside className="watch-sidebar">
        <div className="sidebar-search">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search videos" />
        </div>

        <nav className="watch-nav">
            <a href="#home" className="active">
                <span className="icon">🏠</span> Home
            </a>
            <a href="#live">
                <span className="icon">🔴</span> Live
            </a>
            <a href="#reels">
                <span className="icon">🎬</span> Reels
            </a>
            <a href="#shows">
                <span className="icon">📺</span> Shows
            </a>
            <a href="#saved">
                <span className="icon">🔖</span> Saved Videos
            </a>
        </nav>

        <div className="divider" />

        <h4 className="sidebar-heading">Your Watchlist</h4>
        <div className="watchlist-item">
            <FBAvatar size={36} />
            <div className="watchlist-info">
                <span className="name">PokerGO</span>
                <span className="new-dot">●</span>
            </div>
        </div>
        <div className="watchlist-item">
            <FBAvatar size={36} />
            <div className="watchlist-info">
                <span className="name">Hustler Casino Live</span>
                <span className="new-dot">●</span>
            </div>
        </div>

        <style>{`
            .watch-sidebar {
                position: fixed;
                top: 56px;
                left: 0;
                width: 360px;
                height: calc(100vh - 56px);
                background: ${FB_COLORS.bgWhite};
                border-right: 1px solid ${FB_COLORS.divider};
                padding: 16px 8px;
                overflow-y: auto;
            }

            .sidebar-search {
                position: relative;
                padding: 0 8px 16px;
            }

            .sidebar-search input {
                width: 100%;
                padding: 10px 16px 10px 36px;
                background: ${FB_COLORS.bgMain};
                border: none;
                border-radius: 20px;
                font-size: 15px;
            }

            .search-icon {
                position: absolute;
                left: 18px;
                top: 10px;
                color: ${FB_COLORS.textSecondary};
            }

            .watch-nav a {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                color: ${FB_COLORS.textPrimary};
                text-decoration: none;
                font-weight: 600;
                font-size: 15px;
                border-radius: 8px;
            }

            .watch-nav a:hover {
                background: ${FB_COLORS.bgHover};
            }

            .watch-nav a.active {
                background: ${FB_COLORS.bgMain};
                color: ${FB_COLORS.blue};
            }

            .icon {
                width: 36px;
                height: 36px;
                background: #E4E6EB;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
            }

            .active .icon {
                background: ${FB_COLORS.blue};
                color: white;
            }

            .divider {
                height: 1px;
                background: ${FB_COLORS.divider};
                margin: 8px 0;
            }

            .sidebar-heading {
                padding: 8px;
                font-size: 17px;
                font-weight: 600;
                color: ${FB_COLORS.textPrimary};
                margin: 0;
            }

            .watchlist-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px;
                cursor: pointer;
                border-radius: 8px;
            }

            .watchlist-item:hover {
                background: ${FB_COLORS.bgHover};
            }

            .watchlist-info {
                flex: 1;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .name {
                font-weight: 600;
                font-size: 15px;
                color: ${FB_COLORS.textPrimary};
            }

            .new-dot {
                color: ${FB_COLORS.blue};
                font-size: 12px;
            }

            @media (max-width: 1100px) {
                .watch-sidebar { display: none; }
            }
        `}</style>
    </aside>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🎥 VIDEO CARD
// ═══════════════════════════════════════════════════════════════════════════

const WatchVideoCard = ({ video }) => (
    <div className="watch-card">
        {/* Header */}
        <div className="watch-header">
            <FBAvatar src={video.channelAvatar || video.author?.avatar} size={40} />
            <div className="header-info">
                <span className="channel-name">{video.channelName || video.author?.name || 'Unknown Channel'}</span>
                <span className="meta">{video.timeAgo || 'Recently'} · 🌎</span>
            </div>
            <button className="btn-more">⋯</button>
        </div>

        {/* Video Player (Placeholder) */}
        <div className="video-player">
            <span className="duration-badge">{video.duration || 'LIVE'}</span>
        </div>

        {/* Title & Stats */}
        <div className="watch-content">
            <h3 className="video-title">{video.title || video.content}</h3>
            <p className="video-desc">{video.description}</p>
        </div>

        {/* Actions */}
        <div className="watch-actions">
            <PokerReactionBar />
            <div className="action-stats">
                <span>{video.views || 0} views</span>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="watch-buttons">
            <button>👍 Like</button>
            <button>💬 Comment</button>
            <button>↗️ Share</button>
        </div>

        <style>{`
            .watch-card {
                background: ${FB_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                margin-bottom: 16px;
                overflow: hidden;
            }

            .watch-header {
                padding: 12px 16px;
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .header-info {
                flex: 1;
            }

            .channel-name {
                display: block;
                font-weight: 600;
                color: ${FB_COLORS.textPrimary};
            }

            .meta {
                font-size: 13px;
                color: ${FB_COLORS.textSecondary};
            }

            .btn-more {
                border: none;
                background: none;
                font-size: 20px;
                cursor: pointer;
            }

            .video-player {
                width: 100%;
                aspect-ratio: 16/9;
                background: black;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .player-overlay {
                width: 64px;
                height: 64px;
                background: rgba(0,0,0,0.6);
                border-radius: 50%;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                border: 2px solid white;
            }

            .duration-badge {
                position: absolute;
                bottom: 12px;
                right: 12px;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
            }

            .watch-content {
                padding: 12px 16px;
            }

            .video-title {
                font-size: 17px;
                font-weight: 600;
                margin: 0 0 4px;
                color: ${FB_COLORS.textPrimary};
            }

            .video-desc {
                font-size: 15px;
                color: ${FB_COLORS.textPrimary};
                margin: 0;
            }

            .watch-actions {
                padding: 8px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid ${FB_COLORS.divider};
            }

            .action-stats {
                font-size: 15px;
                color: ${FB_COLORS.textSecondary};
            }

            .watch-buttons {
                display: flex;
                padding: 4px 16px;
            }

            .watch-buttons button {
                flex: 1;
                padding: 12px;
                background: none;
                border: none;
                font-weight: 600;
                color: ${FB_COLORS.textSecondary};
                cursor: pointer;
                border-radius: 4px;
            }

            .watch-buttons button:hover {
                background: ${FB_COLORS.bgHover};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📺 MAIN WATCH VIEW
// ═══════════════════════════════════════════════════════════════════════════

export const FacebookWatchView = ({ onNavigate }) => {
    const { socialService } = useSocialOrb();
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchVideos = async () => {
            if (socialService) {
                try {
                    const { posts } = await socialService.getVideos({ limit: 10 });
                    // Filter only if backend didn't (though getVideos adds filter arg)
                    // If posts are empty, fall back to mock
                    if (posts && posts.length > 0) {
                        setVideos(posts);
                    } else {
                        throw new Error("No videos found");
                    }
                } catch (e) {
                    // Fallback Mock
                    setVideos([
                        {
                            id: 1,
                            title: "Is this the SICKEST call in Poker History? 😱",
                            description: "Tom Dwan faces a massive overbet on the river.",
                            channelName: "PokerGO",
                            channelAvatar: "",
                            views: "1.2M",
                            timeAgo: "2 hours ago",
                            duration: "12:45"
                        }
                    ]);
                } finally {
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        };
        fetchVideos();
    }, [socialService]);

    return (
        <div className="watch-page">
            <WatchSidebar />

            <main className="watch-feed">
                <div className="feed-header">
                    <h2>Watch</h2>
                </div>

                {loading ? (
                    <div>Loading videos...</div>
                ) : (
                    videos.map(v => (
                        <WatchVideoCard key={v.id} video={v} />
                    ))
                )}
            </main>

            <style>{`
                .watch-page {
                    background: ${FB_COLORS.bgMain};
                    min-height: 100vh;
                    display: flex;
                }

                .watch-feed {
                    max-width: 960px;
                    width: 100%;
                    margin: 0 auto;
                    padding: 24px;
                    flex: 1;
                }

                .feed-header {
                    margin-bottom: 24px;
                }

                .feed-header h2 {
                    font-size: 24px;
                    font-weight: 700;
                    margin: 0;
                }

                @media (min-width: 1100px) {
                    .watch-feed {
                        margin-left: 360px;
                    }
                }
            `}</style>
        </div>
    );
};

export default FacebookWatchView;
