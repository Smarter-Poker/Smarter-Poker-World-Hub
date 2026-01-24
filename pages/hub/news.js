/**
 * SMARTER.POKER NEWS HUB - REDESIGNED UI
 * Build: 20260124-v2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - 6 Source-Specific News Boxes (PokerNews, MSPT, CardPlayer, WSOP, Poker.org, Pokerfuse)
 * - Latest Videos tab with auto-scraped content
 * - Category filtering
 * - Trending sidebar
 * - Auto-refreshes from scraper every 2 hours
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
    Search, Clock, Eye, TrendingUp, Trophy, Calendar,
    Zap, Play, Mail, Check, Flame, MapPin, ExternalLink, Loader,
    Bookmark, BookmarkCheck, Share2, Twitter, Facebook, LinkIcon,
    Moon, Sun, Lock, Target, CheckCircle, ChevronDown, Video,
    Newspaper, Globe, RefreshCw, ChevronRight, Film
} from 'lucide-react';

import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// Fallback data
const FALLBACK_NEWS = [
    { id: '1', title: "WSOP 2025 Schedule Released", content: "The World Series of Poker announces its biggest schedule yet", image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80", category: "tournament", read_time: 4, views: 5200, published_at: new Date().toISOString(), source_name: "PokerNews" },
    { id: '2', title: "Phil Ivey Returns to Live Poker", content: "Legendary player set for major comeback", image_url: "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=400&q=80", category: "news", read_time: 3, views: 8900, published_at: new Date(Date.now() - 3600000).toISOString(), source_name: "CardPlayer" },
    { id: '3', title: "GTO Strategy: 3-Betting Ranges Explained", content: "Master the art of 3-betting with optimal frequencies", image_url: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400&q=80", category: "strategy", read_time: 8, views: 12400, published_at: new Date(Date.now() - 7200000).toISOString(), source_name: "Upswing" },
    { id: '4', title: "Online Poker Traffic Hits New Records", content: "Global player pools see unprecedented growth", image_url: "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80", category: "industry", read_time: 5, views: 3100, published_at: new Date(Date.now() - 10800000).toISOString(), source_name: "Poker.org" },
    { id: '5', title: "EPT Barcelona Main Event Preview", content: "All you need to know about Europe's biggest poker festival", image_url: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80", category: "tournament", read_time: 6, views: 4500, published_at: new Date(Date.now() - 14400000).toISOString(), source_name: "PokerNews" },
    { id: '6', title: "Bankroll Management Essentials", content: "Protect your poker career with proper money management", image_url: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&q=80", category: "strategy", read_time: 7, views: 6700, published_at: new Date(Date.now() - 18000000).toISOString(), source_name: "CardPlayer" },
    { id: '7', title: "New Poker Room Opens in Las Vegas", content: "State-of-the-art facility debuts on the Strip", image_url: "https://images.unsplash.com/photo-1517232115160-ff93364542dd?w=400&q=80", category: "industry", read_time: 4, views: 2300, published_at: new Date(Date.now() - 21600000).toISOString(), source_name: "Poker.org" },
    { id: '8', title: "WPT Championship Final Table Set", content: "Six players remain for the $10M prize pool", image_url: "https://images.unsplash.com/photo-1609743522653-52354461eb27?w=400&q=80", category: "tournament", read_time: 5, views: 7800, published_at: new Date(Date.now() - 25200000).toISOString(), source_name: "PokerNews" }
];

const FALLBACK_VIDEOS = [
    { id: '1', title: "WSOP Main Event Day 1 Highlights", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=300&q=80", duration: "15:42", views: 125000, channel: "PokerGO" },
    { id: '2', title: "How to Beat Small Stakes Poker", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=300&q=80", duration: "28:15", views: 89000, channel: "Jonathan Little" },
    { id: '3', title: "Phil Hellmuth Epic Blowup Compilation", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=300&q=80", duration: "12:34", views: 450000, channel: "Poker Clips" },
    { id: '4', title: "GTO vs Exploitative Play Breakdown", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=300&q=80", duration: "45:20", views: 67000, channel: "Upswing Poker" }
];

const FALLBACK_POY = [
    { player_name: "Alex F.", points: 2850, rank: 1 },
    { player_name: "Thomas B.", points: 2720, rank: 2 },
    { player_name: "Chad E.", points: 2580, rank: 3 },
    { player_name: "Stephen C.", points: 2410, rank: 4 },
    { player_name: "Daniel N.", points: 2290, rank: 5 }
];

const FALLBACK_EVENTS = [
    { id: '1', name: "WSOP Main Event", event_date: "2025-06-28" },
    { id: '2', name: "EPT Barcelona", event_date: "2025-08-15" },
    { id: '3', name: "WPT Championship", event_date: "2025-12-01" }
];

// MSPT (Mid-States Poker Tour) Fallback Data
const FALLBACK_MSPT = [
    { id: 'mspt1', title: "MSPT Venetian $1,600 Main Event Kicks Off", source_url: "https://msptpoker.com", published_at: new Date().toISOString(), prize_pool: "$2M GTD" },
    { id: 'mspt2', title: "MSPT Canterbury Park Results - John Smith Wins", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 86400000).toISOString(), prize_pool: "$350K" },
    { id: 'mspt3', title: "MSPT 2025 Schedule Announced - 20+ Stops", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 172800000).toISOString(), prize_pool: null },
    { id: 'mspt4', title: "MSPT Player of the Year Race Heats Up", source_url: "https://msptpoker.com", published_at: new Date(Date.now() - 259200000).toISOString(), prize_pool: null }
];

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatEventDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatViews(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Fallback images for different categories - using reliable poker images
const FALLBACK_IMAGES = {
    tournament: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=400',
    strategy: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=400',
    industry: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=400',
    news: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=400',
    online: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=400'
};

// News Box Component - Dedicated display box for each story
function NewsBox({ article, index, onOpen, isBookmarked, onBookmark, onShare, isRead }) {
    const categoryColors = {
        tournament: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', icon: '🏆' },
        strategy: { bg: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa', icon: '📚' },
        industry: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', icon: '💼' },
        news: { bg: 'rgba(0, 212, 255, 0.15)', color: '#2374E1', icon: '📰' },
        online: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', icon: '💻' }
    };
    const catStyle = categoryColors[article.category] || categoryColors.news;

    // Get image with fallback
    const imageUrl = article.image_url || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news;

    return (
        <div
            className={`news-box ${isRead ? 'read' : ''}`}
            onClick={() => onOpen(article)}
        >
            {/* Quick Actions */}
            <div className="box-actions">
                <button onClick={(e) => { e.stopPropagation(); onBookmark(article.id); }} title="Bookmark">
                    {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); onShare(article); }} title="Share">
                    <Share2 size={14} />
                </button>
            </div>

            {/* Read Indicator */}
            {isRead && (
                <div className="read-indicator">
                    <CheckCircle size={10} /> Read
                </div>
            )}

            {/* Image with fallback */}
            <div className="box-image">
                <img
                    src={imageUrl}
                    alt={article.title}
                    loading="lazy"
                    onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.classList.add('no-image');
                    }}
                />
                <div className="image-placeholder">
                    <span className="placeholder-icon">{catStyle.icon}</span>
                    <span className="placeholder-text">{article.category?.toUpperCase() || 'POKER'}</span>
                </div>
                <div className="box-overlay" />
            </div>

            {/* Content */}
            <div className="box-content">
                {/* Title */}
                <h3 className="box-title">{article.title}</h3>

                {/* Description/Excerpt */}
                {article.content && (
                    <p className="box-excerpt">{article.content.substring(0, 100)}...</p>
                )}

                {/* Meta */}
                <div className="box-meta">
                    <span className="source">{article.source_name || article.author_name || 'Smarter.Poker'}</span>
                    <span className="separator">•</span>
                    <span className="time">{timeAgo(article.published_at)}</span>
                    <span className="separator">•</span>
                    <span className="views"><Eye size={10} /> {formatViews(article.views || 0)}</span>
                </div>
            </div>

            <style jsx>{`
                .news-box {
                    position: relative;
                    background: #242526;
                    border: 1px solid #3E4042;
                    border-radius: 8px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    height: 340px;
                }

                .news-box:hover {
                    background: #3A3B3C;
                    transform: translateY(-2px);
                }

                .news-box.read {
                    opacity: 0.7;
                }

                .news-box.read:hover {
                    opacity: 1;
                }

                .box-actions {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    display: flex;
                    gap: 6px;
                    z-index: 10;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .news-box:hover .box-actions {
                    opacity: 1;
                }

                .box-actions button {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .box-actions button:hover {
                    background: rgba(0, 212, 255, 0.4);
                }

                .read-indicator {
                    position: absolute;
                    top: 12px;
                    left: 12px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: rgba(34, 197, 94, 0.9);
                    border-radius: 6px;
                    font-size: 10px;
                    font-weight: 600;
                    color: #fff;
                    z-index: 10;
                }

                .box-image {
                    position: relative;
                    width: 100%;
                    height: 180px;
                    min-height: 180px;
                    overflow: hidden;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                }

                .box-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.4s;
                    position: relative;
                    z-index: 1;
                }

                .news-box:hover .box-image img {
                    transform: scale(1.08);
                }

                .box-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to top, rgba(10, 10, 18, 0.9) 0%, transparent 60%);
                    z-index: 2;
                }

                .image-placeholder {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 50%, #16213e 100%);
                    z-index: 0;
                }

                .box-image.no-image .image-placeholder {
                    z-index: 1;
                }

                .placeholder-icon {
                    font-size: 48px;
                    opacity: 0.6;
                }

                .placeholder-text {
                    font-size: 12px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    color: rgba(255, 255, 255, 0.4);
                    margin-top: 8px;
                }

                .box-content {
                    padding: 14px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    flex: 1;
                }

                .box-category {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    width: fit-content;
                }

                .box-title {
                    font-size: 14px;
                    font-weight: 600;
                    line-height: 1.4;
                    color: #fff;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .news-box-large .box-title {
                    font-size: 18px;
                    -webkit-line-clamp: 3;
                }

                .box-excerpt {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    line-height: 1.5;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .box-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-top: auto;
                    flex-wrap: wrap;
                }

                .box-meta .source {
                    color: #2374E1;
                    font-weight: 600;
                }

                .box-meta .separator {
                    opacity: 0.3;
                }

                .box-meta .views {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }
            `}</style>
        </div>
    );
}

// Video Card Component
function VideoCard({ video, onClick }) {
    return (
        <div
            className="video-card"
            onClick={() => onClick(video)}
        >
            <div className="video-thumbnail">
                <img src={video.thumbnail_url} alt={video.title} loading="lazy" />
                <div className="video-duration">{video.duration}</div>
                <div className="play-button">
                    <Play size={24} fill="#fff" />
                </div>
            </div>
            <div className="video-info">
                <h4>{video.title}</h4>
                <div className="video-meta">
                    <span className="channel">{video.channel}</span>
                    <span>{formatViews(video.views)} views</span>
                </div>
            </div>

            <style jsx>{`
                .video-card {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.3s;
                }

                .video-card:hover {
                    border-color: rgba(255, 0, 0, 0.3);
                    box-shadow: 0 4px 20px rgba(255, 0, 0, 0.1);
                }

                .video-thumbnail {
                    position: relative;
                    aspect-ratio: 16/9;
                    overflow: hidden;
                }

                .video-thumbnail img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.3s;
                }

                .video-card:hover .video-thumbnail img {
                    transform: scale(1.05);
                }

                .video-duration {
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    padding: 3px 6px;
                    background: rgba(0, 0, 0, 0.85);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #fff;
                }

                .play-button {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 50px;
                    height: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 0, 0, 0.9);
                    border-radius: 50%;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .video-card:hover .play-button {
                    opacity: 1;
                }

                .video-info {
                    padding: 12px;
                }

                .video-info h4 {
                    font-size: 13px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 6px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .video-meta {
                    display: flex;
                    justify-content: space-between;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .video-meta .channel {
                    color: rgba(255, 255, 255, 0.7);
                }
            `}</style>
        </div>
    );
}

// YouTube URL helpers for Reels
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

// Reel Card Component - Vertical Video for Social Reels
function ReelCard({ reel, onClick }) {
    const openReel = () => {
        if (reel.video_url) {
            window.open(reel.video_url, '_blank');
        }
    };

    // Get display values with proper fallbacks
    const thumbnailUrl = getReelThumbnail(reel);
    const displayTitle = reel.title || reel.caption?.split('\n')[0]?.replace(/^🎬\s*/, '') || 'Poker Reel';
    const channelName = reel.channel_name || reel.profiles?.full_name || reel.profiles?.username || 'Smarter.Poker';
    const isYouTube = reel.video_url?.includes('youtube.com') || reel.video_url?.includes('youtu.be');

    return (
        <div
            className="reel-card"
            onClick={openReel}
        >
            <div className="reel-thumbnail">
                <img
                    src={thumbnailUrl}
                    alt={displayTitle}
                    loading="lazy"
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
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.3s;
                }

                .reel-card:hover {
                    border-color: rgba(236, 72, 153, 0.4);
                    box-shadow: 0 4px 20px rgba(236, 72, 153, 0.15);
                }

                .reel-thumbnail {
                    position: relative;
                    aspect-ratio: 9/16;
                    overflow: hidden;
                    max-height: 280px;
                }

                .reel-thumbnail img {
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

// MSPT Dedicated News Box Component - Major Fixture
// MSPT Box - Same size as news boxes with MSPT branding
function MSPTBox({ msptNews, onOpenMSPT }) {
    const featured = msptNews[0];

    return (
        <div
            className="news-box mspt-box"
            onClick={() => featured && onOpenMSPT(featured)}
        >
            {/* Image */}
            <div className="box-image">
                <img
                    src={featured?.image_url || "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80"}
                    alt="MSPT News"
                    loading="lazy"
                />
                <div className="box-overlay" />
            </div>

            {/* Content */}
            <div className="box-content">
                {/* Title */}
                <h3 className="box-title">{featured?.title || "MSPT News & Updates"}</h3>

                {/* Description */}
                <p className="box-excerpt">
                    {featured?.prize_pool ? `${featured.prize_pool} - ` : ''}
                    Latest updates from Mid-States Poker Tour events and tournaments.
                </p>

                {/* Meta */}
                <div className="box-meta">
                    <span className="source">MSPT</span>
                    <span className="separator">•</span>
                    <span className="time">{featured ? timeAgo(featured.published_at) : 'Live'}</span>
                </div>
            </div>

            <style jsx>{`
                .mspt-box {
                    border: 1px solid rgba(220, 38, 38, 0.4) !important;
                    height: 340px !important;
                }

                .mspt-box:hover {
                    border-color: rgba(220, 38, 38, 0.7) !important;
                    box-shadow: 0 8px 32px rgba(220, 38, 38, 0.2) !important;
                }

                .mspt-category {
                    background: rgba(220, 38, 38, 0.2) !important;
                    color: #f87171 !important;
                }
            `}</style>
        </div>
    );
}

// Placeholder Box for sources without articles yet
function SourcePlaceholderBox({ sourceName, sourceUrl, index }) {
    const sourceInfo = {
        'PokerNews': { icon: '🃏', color: '#2374E1', url: 'https://www.pokernews.com' },
        'MSPT': { icon: '🎰', color: '#dc2626', url: 'https://msptpoker.com' },
        'CardPlayer': { icon: '♠️', color: '#22c55e', url: 'https://www.cardplayer.com' },
        'WSOP': { icon: '🏆', color: '#fbbf24', url: 'https://www.wsop.com' },
        'Poker.org': { icon: '♦️', color: '#8b5cf6', url: 'https://www.poker.org' },
        'Pokerfuse': { icon: '🔥', color: '#f97316', url: 'https://pokerfuse.com' }
    };

    const info = sourceInfo[sourceName] || { icon: '📰', color: '#2374E1', url: '#' };

    return (
        <div
            className="news-box placeholder-box"
            onClick={() => window.open(sourceUrl || info.url, '_blank')}
        >
            <div className="box-image">
                <div className="placeholder-content">
                    <span className="placeholder-icon">{info.icon}</span>
                    <span className="placeholder-name">{sourceName}</span>
                </div>
                <div className="box-overlay" />
            </div>
            <div className="box-content">
                <h3 className="box-title">Latest from {sourceName}</h3>
                <p className="box-excerpt">Loading news from {sourceName}... Check back soon for the latest updates.</p>
                <div className="box-meta">
                    <span className="source" style={{ color: info.color }}>{sourceName}</span>
                    <span className="separator">•</span>
                    <span className="time">Visit Site →</span>
                </div>
            </div>

            <style jsx>{`
                .placeholder-box {
                    border-color: ${info.color}40 !important;
                }
                .placeholder-box:hover {
                    border-color: ${info.color}80 !important;
                }
                .placeholder-content {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #1a1a2e 0%, ${info.color}20 50%, #16213e 100%);
                }
                .placeholder-icon {
                    font-size: 48px;
                    margin-bottom: 8px;
                }
                .placeholder-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: ${info.color};
                    letter-spacing: 1px;
                }
            `}</style>
        </div>
    );
}

export default function NewsHub() {
    const router = useRouter();

    // Core State
    const [news, setNews] = useState([]);
    const [videos, setVideos] = useState([]);
    const [reels, setReels] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const [events, setEvents] = useState([]);
    const [msptNews, setMsptNews] = useState(FALLBACK_MSPT);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [activeSection, setActiveSection] = useState('news'); // 'news' or 'videos'
    const [email, setEmail] = useState('');
    const [subscribed, setSubscribed] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [subscribeError, setSubscribeError] = useState('');

    // UI State
    const [darkMode, setDarkMode] = useState(true);
    const [bookmarks, setBookmarks] = useState([]);
    const [readArticles, setReadArticles] = useState([]);
    const [shareArticle, setShareArticle] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showAllStories, setShowAllStories] = useState(false);

    // Load persisted state
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedBookmarks = localStorage.getItem('news_bookmarks');
            const savedRead = localStorage.getItem('news_read');
            const savedDarkMode = localStorage.getItem('news_dark_mode');
            if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));
            if (savedRead) setReadArticles(JSON.parse(savedRead));
            if (savedDarkMode !== null) setDarkMode(savedDarkMode === 'true');
        }
    }, []);

    // Persist state
    useEffect(() => {
        if (typeof window !== 'undefined' && bookmarks.length >= 0) {
            localStorage.setItem('news_bookmarks', JSON.stringify(bookmarks));
        }
    }, [bookmarks]);

    useEffect(() => {
        if (typeof window !== 'undefined' && readArticles.length >= 0) {
            localStorage.setItem('news_read', JSON.stringify(readArticles));
        }
    }, [readArticles]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('news_dark_mode', String(darkMode));
        }
    }, [darkMode]);

    // Toggle functions
    const toggleBookmark = (articleId) => {
        setBookmarks(prev =>
            prev.includes(articleId)
                ? prev.filter(id => id !== articleId)
                : [...prev, articleId]
        );
    };

    const markAsRead = (articleId) => {
        if (!readArticles.includes(articleId)) {
            setReadArticles(prev => [...prev, articleId]);
        }
    };

    // Share functions
    const shareToTwitter = (article) => {
        const url = `https://smarter.poker/hub/article?id=${article.id}`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(url)}`, '_blank');
    };

    const shareToFacebook = (article) => {
        const url = `https://smarter.poker/hub/article?id=${article.id}`;
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    };

    const copyLink = async (article) => {
        const url = `https://smarter.poker/hub/article?id=${article.id}`;
        await navigator.clipboard.writeText(url);
        confetti({ particleCount: 30, spread: 40, origin: { y: 0.7 } });
    };

    // Fetch data
    useEffect(() => {
        fetchAllData();
    }, []);

    useEffect(() => {
        fetchNews();
    }, [activeTab]);

    const fetchAllData = async () => {
        setLoading(true);
        await Promise.all([
            fetchNews(),
            fetchVideos(),
            fetchReels(),
            fetchLeaderboard(),
            fetchEvents(),
            fetchMSPTNews()
        ]);
        setLoading(false);
        setLastUpdate(new Date());
    };

    const refreshData = async () => {
        setIsRefreshing(true);
        await fetchAllData();
        setIsRefreshing(false);
    };

    const fetchNews = async () => {
        try {
            const params = new URLSearchParams({ limit: '20' });
            if (activeTab !== 'all') params.set('category', activeTab);
            if (searchQuery) params.set('search', searchQuery);

            const res = await fetch(`/api/news/articles?${params}`);
            const { success, data } = await res.json();

            if (success && data?.length) {
                setNews(data);
            } else {
                setNews(FALLBACK_NEWS);
            }
        } catch (e) {
            console.error('Failed to fetch news:', e);
            setNews(FALLBACK_NEWS);
        }
    };

    const fetchVideos = async () => {
        try {
            const res = await fetch('/api/news/videos?limit=20');
            const { success, data } = await res.json();
            setVideos(success && data?.length ? data : FALLBACK_VIDEOS);
        } catch (e) {
            setVideos(FALLBACK_VIDEOS);
        }
    };

    const fetchReels = async () => {
        try {
            const res = await fetch('/api/news/reels?limit=20&sort=recent');
            const { success, data } = await res.json();
            setReels(success && data?.length ? data : []);
        } catch (e) {
            setReels([]);
        }
    };

    const fetchLeaderboard = async () => {
        try {
            const res = await fetch('/api/news/leaderboard?limit=5');
            const { success, data } = await res.json();
            setLeaderboard(success && data?.length ? data : FALLBACK_POY);
        } catch (e) {
            setLeaderboard(FALLBACK_POY);
        }
    };

    const fetchEvents = async () => {
        try {
            const res = await fetch('/api/news/events?limit=3');
            const { success, data } = await res.json();
            setEvents(success && data?.length ? data : FALLBACK_EVENTS);
        } catch (e) {
            setEvents(FALLBACK_EVENTS);
        }
    };

    const fetchMSPTNews = async () => {
        try {
            // Fetch MSPT-specific news from articles API
            const res = await fetch('/api/news/articles?search=MSPT&limit=4');
            const { success, data } = await res.json();
            if (success && data?.length) {
                // Transform to MSPT format
                setMsptNews(data.map(a => ({
                    id: a.id,
                    title: a.title,
                    source_url: a.source_url || '#',
                    published_at: a.published_at,
                    prize_pool: null
                })));
            } else {
                setMsptNews(FALLBACK_MSPT);
            }
        } catch (e) {
            setMsptNews(FALLBACK_MSPT);
        }
    };

    // Search handler
    const handleSearch = useCallback((value) => {
        setSearchQuery(value);
        const timer = setTimeout(() => fetchNews(), 300);
        return () => clearTimeout(timer);
    }, [activeTab]);

    // Newsletter subscription
    const handleSubscribe = async (e) => {
        e.preventDefault();
        if (!email || !email.includes('@')) {
            setSubscribeError('Please enter a valid email');
            return;
        }

        setSubscribing(true);
        setSubscribeError('');

        try {
            const res = await fetch('/api/news/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const { success, error } = await res.json();

            if (success) {
                setSubscribed(true);
            } else {
                setSubscribeError(error || 'Subscription failed');
            }
        } catch (e) {
            setSubscribeError('Network error');
        } finally {
            setSubscribing(false);
        }
    };

    // Article navigation
    const openArticle = async (article) => {
        try {
            await fetch('/api/news/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: article.id })
            });
        } catch (e) { }

        markAsRead(article.id);

        if (article.source_url) {
            window.open(article.source_url, '_blank');
        } else {
            router.push(`/hub/article?id=${article.id}`);
        }
    };

    // Video navigation - supports YouTube and direct URLs
    const openVideo = (video) => {
        if (video.youtube_id) {
            window.open(`https://www.youtube.com/watch?v=${video.youtube_id}`, '_blank');
        } else if (video.url) {
            window.open(video.url, '_blank');
        }
    };

    // Filter news
    const filteredNews = news.filter(article => {
        if (!searchQuery) return true;
        return article.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            article.content?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // 6 dedicated source boxes - each box shows the latest article from its specific source
    const DEDICATED_SOURCES = [
        { name: 'PokerNews', url: 'https://www.pokernews.com' },
        { name: 'Poker.org', url: 'https://www.poker.org' },
        { name: 'CardPlayer', url: 'https://www.cardplayer.com' },
        { name: 'Pokerfuse', url: 'https://pokerfuse.com' },
        { name: 'WSOP', url: 'https://www.wsop.com' },
        { name: 'MSPT', url: 'https://msptpoker.com' }
    ];

    // Get the latest article from each dedicated source (always show all 6 boxes)
    const sourceBoxArticles = DEDICATED_SOURCES.map((source, index) => {
        const articlesFromSource = filteredNews.filter(a => a.source_name === source.name);
        // Return the most recent article from this source, or a placeholder if none
        return articlesFromSource[0] || {
            id: `placeholder-${source.name}`,
            title: `Latest from ${source.name}`,
            content: `Check back soon for the latest poker news from ${source.name}.`,
            excerpt: `Check back soon for the latest poker news from ${source.name}.`,
            source_name: source.name,
            source_url: source.url,
            image_url: FALLBACK_IMAGES[['tournament', 'industry', 'news', 'industry', 'tournament', 'tournament'][index]],
            category: ['tournament', 'industry', 'news', 'industry', 'tournament', 'tournament'][index],
            published_at: new Date().toISOString(),
            views: 0,
            isPlaceholder: true
        };
    });

    // Top articles = source box articles (always 6)
    const topArticles = sourceBoxArticles;
    const topArticleIds = topArticles.filter(a => !a.isPlaceholder).map(a => a.id);

    // Remaining stories = all other articles not in the top boxes
    const remainingStories = filteredNews.filter(a => !topArticleIds.includes(a.id));

    // Trending = sorted by views
    const trendingNews = [...news].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

    return (
        <PageTransition>
            <Head>
                <title>News | Smarter.Poker</title>
                <meta name="description" content="Latest poker news, tournament updates, strategy tips, and industry insights" />
            </Head>

            <div className={`news-hub ${darkMode ? '' : 'light'}`}>
                <UniversalHeader pageDepth={1} />

                {/* Header Bar */}
                <header className="header">
                    <div className="header-left">
                        <div className="logo">
                            <Newspaper className="logo-icon" size={22} />
                            <span>Poker News</span>
                        </div>

                        {/* Section Tabs */}
                        <div className="section-tabs">
                            <button
                                className={`section-tab ${activeSection === 'news' ? 'active' : ''}`}
                                onClick={() => setActiveSection('news')}
                            >
                                <Newspaper size={16} /> News
                            </button>
                            <button
                                className={`section-tab ${activeSection === 'videos' ? 'active' : ''}`}
                                onClick={() => setActiveSection('videos')}
                            >
                                <Video size={16} /> Latest Videos
                            </button>
                            <button
                                className={`section-tab ${activeSection === 'reels' ? 'active' : ''}`}
                                onClick={() => setActiveSection('reels')}
                            >
                                <Film size={16} /> Reels
                            </button>
                        </div>
                    </div>

                    <div className="header-right">
                        <div className="search-box">
                            <Search className="search-icon" size={16} />
                            <input
                                type="text"
                                placeholder="Search news..."
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="clear-search" onClick={() => { setSearchQuery(''); fetchNews(); }}>×</button>
                            )}
                        </div>

                        {/* Refresh Button */}
                        <button
                            className="refresh-btn"
                            onClick={refreshData}
                            disabled={isRefreshing}
                            title="Refresh news"
                        >
                            <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
                        </button>

                        {/* Dark Mode Toggle */}
                        <button
                            className="theme-toggle"
                            onClick={() => setDarkMode(!darkMode)}
                            title={darkMode ? "Light Mode" : "Dark Mode"}
                        >
                            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                    </div>
                </header>

                {/* Share Modal */}
                <AnimatePresence>
                    {shareArticle && (
                        <motion.div
                            className="share-modal-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShareArticle(null)}
                        >
                            <motion.div
                                className="share-modal"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3>Share Article</h3>
                                <p>{shareArticle.title}</p>
                                <div className="share-buttons">
                                    <button onClick={() => { shareToTwitter(shareArticle); setShareArticle(null); }}>
                                        <Twitter size={20} /> Twitter
                                    </button>
                                    <button onClick={() => { shareToFacebook(shareArticle); setShareArticle(null); }}>
                                        <Facebook size={20} /> Facebook
                                    </button>
                                    <button onClick={() => { copyLink(shareArticle); setShareArticle(null); }}>
                                        <LinkIcon size={20} /> Copy Link
                                    </button>
                                </div>
                                <button className="close-modal" onClick={() => setShareArticle(null)}>×</button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Loading State */}
                {loading && (
                    <div className="loading">
                        <Loader className="spinner" size={32} />
                        <span>Loading latest news...</span>
                    </div>
                )}

                {/* Main Layout */}
                <div className="layout">
                    {/* Left Column - News Boxes */}
                    <main className="main-content">
                        {activeSection === 'news' ? (
                            <>
                                {/* News Grid - 6 Source-Specific Boxes */}
                                <section className="news-section">
                                    <h2 className="section-title">
                                        <Flame size={18} /> Today's Top Stories
                                    </h2>

                                    {filteredNews.length === 0 ? (
                                        <div className="no-results">
                                            <Globe size={48} />
                                            <p>No articles found{searchQuery ? ` for "${searchQuery}"` : ''}</p>
                                            <button onClick={() => { setSearchQuery(''); setActiveTab('all'); fetchNews(); }}>
                                                Clear filters
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="news-grid">
                                            {/* Show 1 article per source - 6 dedicated source boxes */}
                                            {topArticles.map((article, index) => (
                                                <NewsBox
                                                    key={article.id}
                                                    article={article}
                                                    index={index}
                                                    onOpen={openArticle}
                                                    isBookmarked={bookmarks.includes(article.id)}
                                                    onBookmark={toggleBookmark}
                                                    onShare={setShareArticle}
                                                    isRead={readArticles.includes(article.id)}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* More Stories Button - Clickable */}
                                    {remainingStories.length > 0 && !showAllStories && (
                                        <motion.button
                                            className="more-stories"
                                            onClick={() => setShowAllStories(true)}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                        >
                                            <span>{remainingStories.length} more stories available</span>
                                            <ChevronDown size={16} />
                                        </motion.button>
                                    )}
                                </section>

                                {/* Additional Stories (shown when expanded) */}
                                <AnimatePresence>
                                    {remainingStories.length > 0 && showAllStories && (
                                        <motion.section
                                            className="more-section"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.3 }}
                                        >
                                            <h2 className="section-title">
                                                <Newspaper size={18} /> More Stories
                                                <button
                                                    className="collapse-btn"
                                                    onClick={() => setShowAllStories(false)}
                                                >
                                                    Collapse
                                                </button>
                                            </h2>
                                            <div className="news-list">
                                                {remainingStories.map((article) => (
                                                    <motion.div
                                                        key={article.id}
                                                        className="news-list-item"
                                                        whileHover={{ x: 4 }}
                                                        onClick={() => openArticle(article)}
                                                    >
                                                        <img
                                                            src={article.image_url || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news}
                                                            alt=""
                                                            className="list-thumb"
                                                            onError={(e) => { e.target.src = FALLBACK_IMAGES.news; }}
                                                        />
                                                        <div className="list-content">
                                                            <h4>{article.title}</h4>
                                                            <div className="list-meta">
                                                                <span>{article.source_name || article.author_name || 'Source'}</span>
                                                                <span>•</span>
                                                                <span>{timeAgo(article.published_at)}</span>
                                                            </div>
                                                        </div>
                                                        <ChevronRight size={16} className="list-arrow" />
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </motion.section>
                                    )}
                                </AnimatePresence>

                                {/* Reels Preview Section - Shows on News tab */}
                                <section className="reels-preview-section">
                                    <div className="section-header-row">
                                        <h2 className="section-title">
                                            <Film size={18} /> Poker Reels
                                        </h2>
                                        <button
                                            className="see-all-btn"
                                            onClick={() => setActiveSection('reels')}
                                        >
                                            See All →
                                        </button>
                                    </div>
                                    {reels.length > 0 ? (
                                        <div className="reels-carousel">
                                            {reels.slice(0, 6).map(reel => (
                                                <ReelCard key={reel.id} reel={reel} />
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{color: '#888', padding: '20px', textAlign: 'center'}}>Loading reels...</p>
                                    )}
                                </section>

                                {/* Videos Preview Section - Shows on News tab */}
                                <section className="videos-preview-section">
                                    <div className="section-header-row">
                                        <h2 className="section-title">
                                            <Play size={18} /> Latest Videos
                                        </h2>
                                        <button
                                            className="see-all-btn"
                                            onClick={() => setActiveSection('videos')}
                                        >
                                            See All →
                                        </button>
                                    </div>
                                    {videos.length > 0 ? (
                                        <div className="videos-carousel">
                                            {videos.slice(0, 4).map(video => (
                                                <VideoCard key={video.id} video={video} onClick={openVideo} />
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{color: '#888', padding: '20px', textAlign: 'center'}}>Loading videos...</p>
                                    )}
                                </section>
                            </>
                        ) : activeSection === 'videos' ? (
                            /* Videos Section */
                            <section className="videos-section">
                                <h2 className="section-title">
                                    <Play size={18} /> Latest Poker Videos
                                </h2>
                                <p className="section-desc">
                                    Auto-updated every 2 hours with the latest poker content from YouTube
                                </p>

                                <div className="videos-grid">
                                    {videos.map(video => (
                                        <VideoCard
                                            key={video.id}
                                            video={video}
                                            onClick={openVideo}
                                        />
                                    ))}
                                </div>

                                <Link href="/hub/video-library" className="see-all-videos">
                                    View Full Video Library <ExternalLink size={14} />
                                </Link>
                            </section>
                        ) : (
                            /* Reels Section */
                            <section className="reels-section">
                                <h2 className="section-title">
                                    <Film size={18} /> Poker Reels
                                </h2>
                                <p className="section-desc">
                                    Short-form poker content from top YouTube channels - updated daily
                                </p>

                                {reels.length === 0 ? (
                                    <div className="no-results">
                                        <Film size={48} />
                                        <p>No reels available yet. Check back soon!</p>
                                    </div>
                                ) : (
                                    <div className="reels-grid">
                                        {reels.map(reel => (
                                            <ReelCard
                                                key={reel.id || reel.youtube_id}
                                                reel={reel}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </main>

                    {/* Right Sidebar */}
                    <aside className="sidebar">
                        {/* Newsletter */}
                        <div className="widget newsletter">
                            <h4><Mail size={14} /> Get Free Strategy</h4>
                            {subscribed ? (
                                <div className="subscribed">
                                    <Check size={20} /> You're subscribed!
                                </div>
                            ) : (
                                <form onSubmit={handleSubscribe}>
                                    <input
                                        type="email"
                                        placeholder="Your email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                    <button type="submit" disabled={subscribing}>
                                        {subscribing ? <Loader size={14} className="spinner" /> : 'Subscribe'}
                                    </button>
                                </form>
                            )}
                            {subscribeError && <p className="error">{subscribeError}</p>}
                        </div>

                        {/* MSPT News & Updates - Dedicated Box */}
                        <div className="widget mspt">
                            <h4><Trophy size={14} /> MSPT News & Updates</h4>
                            <ul className="mspt-list">
                                {msptNews.map((item) => (
                                    <li
                                        key={item.id}
                                        onClick={() => item.source_url && window.open(item.source_url, '_blank')}
                                    >
                                        <div className="mspt-item">
                                            <span className="mspt-title">{item.title}</span>
                                            <div className="mspt-meta">
                                                <span className="mspt-time">{timeAgo(item.published_at)}</span>
                                                {item.prize_pool && (
                                                    <span className="mspt-prize">{item.prize_pool}</span>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <a
                                href="https://msptpoker.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mspt-link"
                            >
                                Visit MSPT Official Site <ExternalLink size={12} />
                            </a>
                        </div>

                        {/* Trending */}
                        <div className="widget">
                            <h4><TrendingUp size={14} /> Trending</h4>
                            <ul className="trending-list">
                                {trendingNews.map((article, i) => (
                                    <li key={article.id} onClick={() => openArticle(article)}>
                                        <span className="rank">{i + 1}</span>
                                        <img
                                            src={article.image_url || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.news}
                                            alt=""
                                            className="trend-thumb"
                                            loading="lazy"
                                            onError={(e) => { e.target.src = FALLBACK_IMAGES.news; }}
                                        />
                                        <span className="title">{article.title}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Player of the Year */}
                        <div className="widget leaderboard">
                            <h4><Trophy size={14} /> Player of the Year</h4>
                            <ul>
                                {leaderboard.map((player, i) => (
                                    <li key={player.id || i}>
                                        <span className={`medal medal-${i + 1}`}>{i + 1}</span>
                                        <span className="name">{player.player_name}</span>
                                        <span className="points">{(player.points || 0).toLocaleString()}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Upcoming Events */}
                        <Link href="/hub/poker-near-me">
                            <div className="widget events">
                                <h4><MapPin size={14} /> Poker Near Me</h4>
                                <ul className="events-list">
                                    {events.map(event => (
                                        <li key={event.id}>
                                            <span>{event.name}</span>
                                            <span className="date">{formatEventDate(event.event_date)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="view-all">
                                    View All Events <ExternalLink size={12} />
                                </div>
                            </div>
                        </Link>
                    </aside>
                </div>

                <style jsx>{`
                    .news-hub {
                        min-height: 100vh;
                        background: #18191A;
                        color: #E4E6EB;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }

                    /* Header */
                    .header {
                        position: sticky;
                        top: 0;
                        z-index: 100;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 12px 24px;
                        background: #242526;
                        border-bottom: 1px solid #3E4042;
                    }

                    .header-left {
                        display: flex;
                        align-items: center;
                        gap: 24px;
                    }

                    .header-right {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }

                    .logo {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .logo :global(.logo-icon) {
                        color: #2374E1;
                    }

                    .logo span {
                        font-size: 18px;
                        font-weight: 700;
                        color: #E4E6EB;
                    }

                    .section-tabs {
                        display: flex;
                        gap: 4px;
                    }

                    .section-tab {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 16px;
                        background: #3A3B3C;
                        border: none;
                        border-radius: 8px;
                        color: #B0B3B8;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .section-tab:hover {
                        background: #4E4F50;
                        color: #E4E6EB;
                    }

                    .section-tab.active {
                        background: #2374E1;
                        color: #fff;
                    }

                    .search-box {
                        position: relative;
                        width: 200px;
                    }

                    .search-box input {
                        width: 100%;
                        padding: 8px 12px 8px 36px;
                        background: #3A3B3C;
                        border: none;
                        border-radius: 20px;
                        color: #E4E6EB;
                        font-size: 13px;
                        outline: none;
                    }

                    .search-box input:focus {
                        border-color: #2374E1;
                    }

                    .search-box :global(.search-icon) {
                        position: absolute;
                        left: 10px;
                        top: 50%;
                        transform: translateY(-50%);
                        color: rgba(255, 255, 255, 0.4);
                    }

                    .clear-search {
                        position: absolute;
                        right: 8px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 18px;
                        height: 18px;
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        border-radius: 50%;
                        color: #fff;
                        font-size: 12px;
                        cursor: pointer;
                    }

                    .refresh-btn, .theme-toggle {
                        padding: 8px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        color: rgba(255, 255, 255, 0.7);
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .refresh-btn:hover, .theme-toggle:hover {
                        background: rgba(255, 255, 255, 0.1);
                        color: #fff;
                    }

                    .refresh-btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    .refresh-btn :global(.spinning) {
                        animation: spin 1s linear infinite;
                    }

                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }

                    /* Category Bar */
                    .category-bar {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 24px;
                        background: rgba(10, 10, 18, 0.8);
                        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                        overflow-x: auto;
                    }

                    .category-tab {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 14px;
                        background: transparent;
                        border: none;
                        border-radius: 20px;
                        color: rgba(255, 255, 255, 0.6);
                        font-size: 12px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                        white-space: nowrap;
                    }

                    .category-tab:hover {
                        background: rgba(255, 255, 255, 0.05);
                        color: #fff;
                    }

                    .category-tab.active {
                        background: rgba(0, 212, 255, 0.15);
                        color: #2374E1;
                    }

                    .last-update {
                        margin-left: auto;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.4);
                    }

                    /* Loading */
                    .loading {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        padding: 60px;
                        color: rgba(255, 255, 255, 0.5);
                    }

                    .loading :global(.spinner) {
                        animation: spin 1s linear infinite;
                    }

                    /* Layout */
                    .layout {
                        display: grid;
                        grid-template-columns: 1fr 320px;
                        gap: 24px;
                        padding: 24px;
                        max-width: 1400px;
                        margin: 0 auto;
                    }

                    @media (max-width: 1000px) {
                        .layout {
                            grid-template-columns: 1fr;
                        }
                        .sidebar {
                            display: none;
                        }
                    }

                    /* News Section */
                    .news-section {
                        margin-bottom: 32px;
                    }

                    .section-title {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font-size: 18px;
                        font-weight: 700;
                        margin-bottom: 20px;
                        color: #fff;
                    }

                    .section-title :global(svg) {
                        color: #2374E1;
                    }

                    .section-desc {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.5);
                        margin-bottom: 20px;
                    }

                    /* News Grid - 6 uniform boxes in 2x3 format */
                    .news-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                    }

                    /* Force ALL boxes to same size */
                    .news-grid > * {
                        height: 340px !important;
                        min-height: 340px !important;
                        max-height: 340px !important;
                    }

                    .news-grid .news-box,
                    .news-grid .mspt-box {
                        height: 340px !important;
                        min-height: 340px !important;
                        max-height: 340px !important;
                    }

                    @media (max-width: 768px) {
                        .news-grid {
                            grid-template-columns: 1fr;
                        }
                    }

                    .no-results {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        padding: 60px;
                        color: rgba(255, 255, 255, 0.4);
                        text-align: center;
                    }

                    .no-results button {
                        padding: 8px 16px;
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        border-radius: 6px;
                        color: #fff;
                        cursor: pointer;
                    }

                    .more-stories {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        width: 100%;
                        margin-top: 20px;
                        padding: 14px 20px;
                        background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(139, 92, 246, 0.1));
                        border: 1px solid rgba(0, 212, 255, 0.3);
                        border-radius: 10px;
                        font-size: 14px;
                        font-weight: 500;
                        color: rgba(255, 255, 255, 0.8);
                        cursor: pointer;
                        transition: all 0.3s ease;
                    }

                    .more-stories:hover {
                        background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(139, 92, 246, 0.2));
                        border-color: rgba(0, 212, 255, 0.5);
                        color: #fff;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 15px rgba(0, 212, 255, 0.2);
                    }

                    .collapse-btn {
                        margin-left: auto;
                        padding: 4px 12px;
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        border-radius: 6px;
                        font-size: 12px;
                        color: rgba(255, 255, 255, 0.6);
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .collapse-btn:hover {
                        background: rgba(255, 255, 255, 0.2);
                        color: #fff;
                    }

                    /* More Stories List */
                    .more-section {
                        margin-top: 32px;
                    }

                    .news-list {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }

                    .news-list-item {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.02);
                        border: 1px solid rgba(255, 255, 255, 0.04);
                        border-radius: 10px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .news-list-item:hover {
                        background: rgba(255, 255, 255, 0.04);
                        border-color: rgba(0, 212, 255, 0.2);
                    }

                    .list-thumb {
                        width: 60px;
                        height: 45px;
                        border-radius: 6px;
                        object-fit: cover;
                    }

                    .list-content {
                        flex: 1;
                    }

                    .list-content h4 {
                        font-size: 13px;
                        font-weight: 600;
                        color: #fff;
                        margin-bottom: 4px;
                    }

                    .list-meta {
                        display: flex;
                        gap: 6px;
                        font-size: 11px;
                        color: rgba(255, 255, 255, 0.4);
                    }

                    .list-arrow {
                        color: rgba(255, 255, 255, 0.3);
                    }

                    /* Reels & Videos Preview Sections (on News tab) */
                    .reels-preview-section,
                    .videos-preview-section {
                        margin-top: 32px;
                        padding-top: 24px;
                        border-top: 1px solid rgba(255, 255, 255, 0.1);
                    }

                    .section-header-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 16px;
                    }

                    .section-header-row .section-title {
                        margin-bottom: 0;
                    }

                    .see-all-btn {
                        background: rgba(0, 212, 255, 0.1);
                        border: 1px solid rgba(0, 212, 255, 0.3);
                        border-radius: 8px;
                        padding: 8px 16px;
                        color: #2374E1;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .see-all-btn:hover {
                        background: rgba(0, 212, 255, 0.2);
                    }

                    .reels-carousel {
                        display: flex;
                        gap: 16px;
                        overflow-x: auto;
                        padding-bottom: 8px;
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255,255,255,0.2) transparent;
                    }

                    .reels-carousel::-webkit-scrollbar {
                        height: 6px;
                    }

                    .reels-carousel::-webkit-scrollbar-track {
                        background: transparent;
                    }

                    .reels-carousel::-webkit-scrollbar-thumb {
                        background: rgba(255,255,255,0.2);
                        border-radius: 3px;
                    }

                    .reels-carousel .reel-card {
                        flex-shrink: 0;
                        width: 160px;
                    }

                    .videos-carousel {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                    }

                    @media (max-width: 768px) {
                        .videos-carousel {
                            grid-template-columns: 1fr;
                        }
                    }

                    /* Videos Section */
                    .videos-section {
                        padding-bottom: 24px;
                    }

                    .videos-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
                        gap: 16px;
                    }

                    .see-all-videos {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        margin-top: 24px;
                        padding: 14px;
                        background: linear-gradient(135deg, rgba(255, 0, 0, 0.15), rgba(255, 0, 0, 0.05));
                        border: 1px solid rgba(255, 0, 0, 0.3);
                        border-radius: 10px;
                        color: #ff4444;
                        font-size: 14px;
                        font-weight: 600;
                        text-decoration: none;
                        transition: all 0.2s;
                    }

                    .see-all-videos:hover {
                        background: rgba(255, 0, 0, 0.2);
                    }

                    /* Reels Section */
                    .reels-section {
                        padding-bottom: 24px;
                    }

                    .reels-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                        gap: 16px;
                    }

                    /* Sidebar */
                    .sidebar {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }

                    .widget {
                        background: #242526;
                        border: 1px solid #3E4042;
                        border-radius: 8px;
                        padding: 16px;
                    }

                    .widget h4 {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        margin-bottom: 14px;
                        color: #E4E6EB;
                    }

                    .widget h4 :global(svg) {
                        color: #2374E1;
                    }

                    /* Newsletter Widget */
                    .newsletter h4 {
                        background: #2374E1;
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .newsletter h4 :global(svg) {
                        color: #fff;
                    }

                    .newsletter form {
                        display: flex;
                        gap: 8px;
                    }

                    .newsletter input {
                        flex: 1;
                        padding: 10px 12px;
                        background: #3A3B3C;
                        border: 1px solid #3E4042;
                        border-radius: 8px;
                        color: #E4E6EB;
                        font-size: 12px;
                    }

                    .newsletter button {
                        padding: 10px 16px;
                        background: #2374E1;
                        border: none;
                        border-radius: 8px;
                        color: #fff;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    .error {
                        color: #ef4444;
                        font-size: 11px;
                        margin-top: 8px;
                    }

                    .subscribed {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 12px;
                        background: rgba(34, 197, 94, 0.1);
                        border-radius: 8px;
                        color: #22c55e;
                        font-weight: 600;
                    }

                    /* Trending List */
                    .trending-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .trending-list li {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                        cursor: pointer;
                    }

                    .trending-list li:hover {
                        background: rgba(255, 255, 255, 0.02);
                    }

                    .trending-list li:last-child {
                        border-bottom: none;
                    }

                    .trending-list .rank {
                        width: 20px;
                        font-size: 13px;
                        font-weight: 700;
                        color: #2374E1;
                    }

                    .trend-thumb {
                        width: 40px;
                        height: 30px;
                        border-radius: 4px;
                        object-fit: cover;
                    }

                    .trending-list .title {
                        flex: 1;
                        font-size: 12px;
                        color: rgba(255, 255, 255, 0.7);
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }

                    /* Leaderboard */
                    .leaderboard h4 {
                        background: #2374E1;
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .leaderboard h4 :global(svg) {
                        color: #fff;
                    }

                    .leaderboard ul {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .leaderboard li {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 8px 0;
                        border-bottom: 1px solid #3E4042;
                    }

                    .leaderboard li:last-child {
                        border-bottom: none;
                    }

                    .medal {
                        width: 22px;
                        height: 22px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                        font-size: 10px;
                        font-weight: 700;
                    }

                    .medal-1 {
                        background: #2374E1;
                        color: #fff;
                    }
                    .medal-2 {
                        background: #3A3B3C;
                        color: #E4E6EB;
                    }
                    .medal-3 {
                        background: #3A3B3C;
                        color: #E4E6EB;
                    }
                    .medal-4, .medal-5 {
                        background: #3A3B3C;
                        color: #B0B3B8;
                    }

                    .leaderboard .name {
                        flex: 1;
                        font-size: 12px;
                    }
                    .leaderboard .points {
                        font-size: 12px;
                        font-weight: 600;
                        color: #2374E1;
                    }

                    /* MSPT Widget */
                    .mspt h4 {
                        background: #2374E1;
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .mspt h4 :global(svg) {
                        color: #fff;
                    }

                    .mspt-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .mspt-list li {
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .mspt-list li:hover {
                        background: rgba(220, 38, 38, 0.1);
                        margin: 0 -16px;
                        padding: 10px 16px;
                    }

                    .mspt-list li:last-child {
                        border-bottom: none;
                    }

                    .mspt-item {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }

                    .mspt-title {
                        font-size: 12px;
                        font-weight: 500;
                        color: rgba(255, 255, 255, 0.9);
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }

                    .mspt-meta {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 10px;
                    }

                    .mspt-time {
                        color: rgba(255, 255, 255, 0.4);
                    }

                    .mspt-prize {
                        background: rgba(220, 38, 38, 0.2);
                        color: #f87171;
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-weight: 600;
                    }

                    .mspt-link {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        margin-top: 12px;
                        padding: 10px;
                        background: rgba(220, 38, 38, 0.15);
                        border-radius: 8px;
                        color: #f87171;
                        font-size: 12px;
                        font-weight: 600;
                        text-decoration: none;
                        transition: all 0.2s;
                    }

                    .mspt-link:hover {
                        background: rgba(220, 38, 38, 0.25);
                    }

                    /* Events Widget */
                    .events {
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .events:hover {
                        border-color: #2374E1;
                        transform: translateY(-2px);
                    }

                    .events h4 {
                        background: #2374E1;
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 8px 8px 0 0;
                    }

                    .events h4 :global(svg) {
                        color: #fff;
                    }

                    .events-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .events-list li {
                        display: flex;
                        justify-content: space-between;
                        padding: 10px 0;
                        border-bottom: 1px solid #3E4042;
                        font-size: 12px;
                    }

                    .events-list li:last-child {
                        border-bottom: none;
                    }

                    .events-list .date {
                        background: rgba(0, 212, 255, 0.1);
                        color: #2374E1;
                        padding: 4px 8px;
                        border-radius: 6px;
                        font-weight: 600;
                        font-size: 11px;
                    }

                    .view-all {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        margin-top: 12px;
                        padding: 10px;
                        background: rgba(34, 197, 94, 0.1);
                        border-radius: 8px;
                        color: #22c55e;
                        font-size: 12px;
                        font-weight: 600;
                    }

                    /* Share Modal */
                    .share-modal-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.8);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 1000;
                    }

                    .share-modal {
                        position: relative;
                        background: #1a1a2e;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 16px;
                        padding: 24px;
                        width: 90%;
                        max-width: 360px;
                        text-align: center;
                    }

                    .share-modal h3 {
                        font-size: 18px;
                        margin-bottom: 8px;
                    }

                    .share-modal p {
                        font-size: 13px;
                        color: rgba(255, 255, 255, 0.6);
                        margin-bottom: 20px;
                    }

                    .share-buttons {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }

                    .share-buttons button {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        padding: 12px;
                        border: none;
                        border-radius: 10px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    .share-buttons button:nth-child(1) {
                        background: #1da1f2;
                        color: #fff;
                    }
                    .share-buttons button:nth-child(2) {
                        background: #1877f2;
                        color: #fff;
                    }
                    .share-buttons button:nth-child(3) {
                        background: rgba(255, 255, 255, 0.1);
                        color: #fff;
                    }

                    .close-modal {
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        width: 28px;
                        height: 28px;
                        background: rgba(255, 255, 255, 0.1);
                        border: none;
                        border-radius: 50%;
                        color: #fff;
                        font-size: 18px;
                        cursor: pointer;
                    }

                    /* Light Mode */
                    .news-hub.light {
                        background: #f5f5f7;
                        color: #1a1a2e;
                    }

                    .news-hub.light .header {
                        background: rgba(255, 255, 255, 0.95);
                        border-bottom-color: rgba(0, 0, 0, 0.06);
                    }

                    .news-hub.light .category-bar {
                        background: rgba(255, 255, 255, 0.8);
                    }

                    .news-hub.light .widget {
                        background: #fff;
                        border-color: rgba(0, 0, 0, 0.06);
                    }

                    @media (max-width: 768px) {
                        .header {
                            flex-wrap: wrap;
                            gap: 12px;
                        }

                        .header-left {
                            width: 100%;
                            justify-content: space-between;
                        }

                        .header-right {
                            width: 100%;
                        }

                        .search-box {
                            flex: 1;
                        }

                        .section-tabs {
                            display: flex;
                            width: 100%;
                            justify-content: center;
                            order: 10;
                            margin-top: 8px;
                        }

                        .section-tab {
                            flex: 1;
                            justify-content: center;
                            padding: 10px 8px;
                            font-size: 12px;
                        }
                    }
                `}</style>
            </div>
        </PageTransition>
    );
}
