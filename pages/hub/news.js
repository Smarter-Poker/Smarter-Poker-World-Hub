/**
 * SMARTER.POKER NEWS HUB
 * Enhanced with PokerNews-style features
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Search, Clock, Eye, TrendingUp, Trophy, Calendar,
    Zap, ArrowRight, Play, Radio, Mail, Check, Flame
} from 'lucide-react';
import { supabase } from '../../src/lib/supabase';

// Mock data
const LIVE_EVENTS = [
    { id: 1, name: "WSOP Main Event", blinds: "50K/100K", leader: "Alex F.", chips: "12.4M", status: "live" },
    { id: 2, name: "EPT Monte Carlo", blinds: "25K/50K", leader: "Thomas B.", chips: "8.2M", status: "live" },
];

const MOCK_NEWS = [
    {
        id: 1,
        title: "Pro Says 'This is What Makes Me a Great Poker Player'",
        content: "Earlier this week, the 2025 Championship Freeroll took place with the top 40 players.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80",
        category: "Tournament",
        read_time: 4,
        published_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        views: 12450
    },
    {
        id: 2,
        title: "Hollywood Actor Could Testify at High-Profile Trial",
        content: "A famous actor may testify in an upcoming trial involving a well-known player.",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=400&q=80",
        category: "Industry",
        read_time: 3,
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        views: 8720
    },
    {
        id: 3,
        title: "Winner Takes All Heads-Up Match Shocks Community",
        content: "The latest high-stakes heads-up match ends in a controversial deal.",
        image_url: "https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=400&q=80",
        category: "News",
        read_time: 5,
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
        views: 6340
    },
    {
        id: 4,
        title: "Could You Chase This Astonishing World Record?",
        content: "A new poker world record attempt has the community buzzing.",
        image_url: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80",
        category: "News",
        read_time: 2,
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
        views: 5210
    },
    {
        id: 5,
        title: "Card Markers Caught and Instantly Banned",
        content: "Security footage revealed a sophisticated card marking scheme.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80",
        category: "Industry",
        read_time: 6,
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        views: 15680
    },
    {
        id: 6,
        title: "GTO Deep Dive: Optimal River Betting Frequencies",
        content: "Understanding when to bet the river is crucial for maximizing EV.",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=400&q=80",
        category: "Strategy",
        read_time: 8,
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
        views: 4890
    }
];

const SHORTS = [
    { id: 1, title: "Insane River Bluff", views: "1.2M", duration: "0:45", thumb: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=200&q=80" },
    { id: 2, title: "Phil's Epic Fold", views: "890K", duration: "0:32", thumb: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=200&q=80" },
    { id: 3, title: "Pocket Aces Cracked", views: "2.1M", duration: "0:58", thumb: "https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=200&q=80" },
    { id: 4, title: "Royal Flush Live!", views: "3.5M", duration: "1:12", thumb: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=200&q=80" },
];

const MEDIA = {
    videos: [
        { id: 1, title: "WSOP 2025 Preview", duration: "12:34", thumb: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=300&q=80" },
        { id: 2, title: "How to Crush Live $2/5", duration: "18:22", thumb: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=300&q=80" },
    ],
    podcasts: [
        { id: 1, title: "The Poker Edge Ep. 142", duration: "1:02:15", thumb: "https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=300&q=80" },
        { id: 2, title: "Strategy Talk with Pros", duration: "45:30", thumb: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=300&q=80" },
    ]
};

const POY_LEADERBOARD = [
    { rank: 1, name: "Alex F.", points: 2850 },
    { rank: 2, name: "Thomas B.", points: 2720 },
    { rank: 3, name: "Chad E.", points: 2580 },
    { rank: 4, name: "Stephen C.", points: 2410 },
    { rank: 5, name: "Daniel N.", points: 2290 }
];

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

export default function NewsHub() {
    const [news, setNews] = useState(MOCK_NEWS);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [mediaTab, setMediaTab] = useState('videos');
    const [email, setEmail] = useState('');
    const [subscribed, setSubscribed] = useState(false);

    useEffect(() => {
        loadNews();
    }, []);

    const loadNews = async () => {
        try {
            const { data, error } = await supabase
                .from('poker_news')
                .select('*')
                .order('published_at', { ascending: false })
                .limit(20);
            if (!error && data?.length) setNews(data);
        } catch (e) { }
    };

    const handleSubscribe = (e) => {
        e.preventDefault();
        if (email) setSubscribed(true);
    };

    const filtered = news.filter(a =>
        !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            <Head>
                <title>News | Smarter.Poker</title>
            </Head>

            <div className="news-hub">
                {/* Header */}
                <header className="header">
                    <Link href="/hub">
                        <div className="logo">
                            <Zap className="logo-icon" />
                            <span>News</span>
                        </div>
                    </Link>

                    <div className="search-box">
                        <Search className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search news..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <nav className="tabs">
                        {['all', 'tournaments', 'strategy', 'industry'].map(tab => (
                            <button
                                key={tab}
                                className={`tab ${activeTab === tab ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </nav>
                </header>

                {/* Live Events Bar */}
                <div className="live-bar">
                    <div className="live-indicator">
                        <span className="pulse" />
                        LIVE
                    </div>
                    <div className="live-events">
                        {LIVE_EVENTS.map(event => (
                            <Link key={event.id} href="#" className="live-event">
                                <span className="event-name">{event.name}</span>
                                <span className="event-blinds">Blinds: {event.blinds}</span>
                                <span className="event-leader">
                                    <Trophy size={12} /> {event.leader} ({event.chips})
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Main Layout */}
                <div className="layout">
                    {/* Main Content */}
                    <main className="main">
                        {/* News Grid */}
                        <div className="card-grid">
                            {filtered.map((article, i) => (
                                <Link key={article.id} href={`/hub/article?url=#`}>
                                    <motion.article
                                        className={`card ${i === 0 ? 'featured' : ''}`}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        whileHover={{ y: -4 }}
                                    >
                                        <div className="card-image">
                                            <img src={article.image_url} alt="" />
                                        </div>
                                        <div className="card-content">
                                            <div className="card-tags">
                                                <span className="category">{article.category}</span>
                                                <span className="read-time">
                                                    <Clock size={10} /> {article.read_time || 3} min
                                                </span>
                                            </div>
                                            <h3>{article.title}</h3>
                                            {i === 0 && <p>{article.content}</p>}
                                            <div className="card-meta">
                                                <span>{timeAgo(article.published_at)}</span>
                                                <span><Eye size={12} /> {article.views?.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </motion.article>
                                </Link>
                            ))}
                        </div>

                        {/* Shorts Section */}
                        <section className="shorts-section">
                            <h4><Flame size={16} /> Poker Shorts</h4>
                            <div className="shorts-grid">
                                {SHORTS.map(short => (
                                    <motion.div
                                        key={short.id}
                                        className="short-card"
                                        whileHover={{ scale: 1.05 }}
                                    >
                                        <div className="short-thumb">
                                            <img src={short.thumb} alt="" />
                                            <span className="duration">{short.duration}</span>
                                            <div className="play-overlay">
                                                <Play size={24} fill="#fff" />
                                            </div>
                                        </div>
                                        <div className="short-info">
                                            <span className="short-title">{short.title}</span>
                                            <span className="short-views">{short.views} views</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </section>

                        {/* Media Section */}
                        <section className="media-section">
                            <div className="media-header">
                                <h4><Play size={16} /> Media</h4>
                                <div className="media-tabs">
                                    <button
                                        className={mediaTab === 'videos' ? 'active' : ''}
                                        onClick={() => setMediaTab('videos')}
                                    >
                                        Videos
                                    </button>
                                    <button
                                        className={mediaTab === 'podcasts' ? 'active' : ''}
                                        onClick={() => setMediaTab('podcasts')}
                                    >
                                        <Radio size={12} /> Podcasts
                                    </button>
                                </div>
                            </div>
                            <div className="media-grid">
                                {MEDIA[mediaTab]?.map(item => (
                                    <div key={item.id} className="media-card">
                                        <div className="media-thumb">
                                            <img src={item.thumb} alt="" />
                                            <span className="duration">{item.duration}</span>
                                            <div className="play-overlay">
                                                <Play size={20} fill="#fff" />
                                            </div>
                                        </div>
                                        <span className="media-title">{item.title}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </main>

                    {/* Sidebar */}
                    <aside className="sidebar">
                        {/* Newsletter */}
                        <div className="widget newsletter">
                            <h4><Mail size={14} /> Get Free Strategy</h4>
                            {subscribed ? (
                                <div className="subscribed">
                                    <Check size={20} /> You're in!
                                </div>
                            ) : (
                                <form onSubmit={handleSubscribe}>
                                    <input
                                        type="email"
                                        placeholder="Your email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                    <button type="submit">Get Guide</button>
                                </form>
                            )}
                        </div>

                        {/* Trending with Thumbnails */}
                        <div className="widget">
                            <h4><TrendingUp size={14} /> Trending</h4>
                            <ul className="trending-list">
                                {[...news].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((a, i) => (
                                    <li key={a.id}>
                                        <span className="rank">{i + 1}</span>
                                        <img src={a.image_url} alt="" className="trend-thumb" />
                                        <span className="title">{a.title}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Leaderboard */}
                        <div className="widget leaderboard">
                            <h4><Trophy size={14} /> Player of the Year</h4>
                            <ul>
                                {POY_LEADERBOARD.map(p => (
                                    <li key={p.rank}>
                                        <span className={`medal medal-${p.rank}`}>{p.rank}</span>
                                        <span className="name">{p.name}</span>
                                        <span className="points">{p.points.toLocaleString()}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Events */}
                        <div className="widget">
                            <h4><Calendar size={14} /> Upcoming</h4>
                            <ul className="events-list">
                                <li><span>WSOP Main Event</span><span className="date">Jun 28</span></li>
                                <li><span>EPT Barcelona</span><span className="date">Aug 15</span></li>
                                <li><span>WPT Championship</span><span className="date">Dec 1</span></li>
                            </ul>
                        </div>
                    </aside>
                </div>

                <style jsx>{`
                    .news-hub {
                        --card-w: clamp(280px, 30vw, 360px);
                        min-height: 100vh;
                        background: #0a0a12;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }

                    /* HEADER */
                    .header {
                        position: sticky;
                        top: 0;
                        z-index: 100;
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        padding: 12px 24px;
                        background: rgba(10, 10, 18, 0.95);
                        backdrop-filter: blur(12px);
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                    }

                    .logo {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                    }

                    .logo :global(.logo-icon) { width: 22px; height: 22px; color: #00d4ff; }

                    .logo span {
                        font-size: 20px;
                        font-weight: 700;
                        background: linear-gradient(90deg, #00d4ff, #7c3aed);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                    }

                    .search-box {
                        flex: 1;
                        max-width: 280px;
                        position: relative;
                    }

                    .search-box input {
                        width: 100%;
                        padding: 10px 12px 10px 38px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 10px;
                        color: #fff;
                        font-size: 13px;
                        outline: none;
                    }

                    .search-box input:focus { border-color: #00d4ff; }

                    .search-box :global(.search-icon) {
                        position: absolute;
                        left: 12px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 16px;
                        height: 16px;
                        color: rgba(255,255,255,0.4);
                    }

                    .tabs { display: flex; gap: 4px; margin-left: auto; }

                    .tab {
                        padding: 8px 14px;
                        background: transparent;
                        border: none;
                        color: rgba(255,255,255,0.5);
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        cursor: pointer;
                        border-radius: 8px;
                        transition: all 0.2s;
                    }

                    .tab:hover { color: #fff; background: rgba(255,255,255,0.05); }
                    .tab.active { color: #fff; background: linear-gradient(135deg, #00d4ff, #7c3aed); }

                    /* LIVE BAR */
                    .live-bar {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        padding: 10px 24px;
                        background: linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05));
                        border-bottom: 1px solid rgba(239,68,68,0.2);
                    }

                    .live-indicator {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 11px;
                        font-weight: 700;
                        color: #ef4444;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }

                    .pulse {
                        width: 8px;
                        height: 8px;
                        background: #ef4444;
                        border-radius: 50%;
                        animation: pulse 1.5s infinite;
                    }

                    @keyframes pulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.5; transform: scale(1.2); }
                    }

                    .live-events {
                        display: flex;
                        gap: 24px;
                        overflow-x: auto;
                        flex: 1;
                    }

                    .live-event {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        font-size: 12px;
                        white-space: nowrap;
                        color: rgba(255,255,255,0.8);
                        text-decoration: none;
                    }

                    .live-event:hover { color: #fff; }

                    .event-name { font-weight: 600; color: #fff; }
                    .event-blinds { color: rgba(255,255,255,0.5); }
                    .event-leader { display: flex; align-items: center; gap: 4px; color: #fbbf24; }

                    /* LAYOUT */
                    .layout {
                        display: grid;
                        grid-template-columns: 1fr 300px;
                        gap: 24px;
                        padding: 24px;
                        max-width: 1400px;
                        margin: 0 auto;
                    }

                    @media (max-width: 1000px) {
                        .layout { grid-template-columns: 1fr; }
                        .sidebar { display: none; }
                    }

                    /* CARD GRID */
                    .card-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(var(--card-w), 1fr));
                        gap: 20px;
                    }

                    .card {
                        background: rgba(255,255,255,0.03);
                        border: 1px solid rgba(255,255,255,0.06);
                        border-radius: 14px;
                        overflow: hidden;
                        cursor: pointer;
                        transition: all 0.3s;
                    }

                    .card:hover {
                        border-color: rgba(0,212,255,0.3);
                        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
                    }

                    .card.featured {
                        grid-column: span 2;
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                    }

                    @media (max-width: 700px) {
                        .card.featured { grid-column: span 1; display: block; }
                    }

                    .card-image { aspect-ratio: 16/10; overflow: hidden; }
                    .card.featured .card-image { aspect-ratio: auto; height: 100%; }

                    .card-image img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        transition: transform 0.4s;
                    }

                    .card:hover .card-image img { transform: scale(1.05); }

                    .card-content { padding: 16px; }

                    .card-tags {
                        display: flex;
                        gap: 8px;
                        margin-bottom: 8px;
                    }

                    .category {
                        font-size: 10px;
                        font-weight: 700;
                        text-transform: uppercase;
                        padding: 4px 8px;
                        background: rgba(0,212,255,0.15);
                        color: #00d4ff;
                        border-radius: 4px;
                        letter-spacing: 0.5px;
                    }

                    .read-time {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        font-size: 10px;
                        color: rgba(255,255,255,0.4);
                    }

                    .card-content h3 {
                        font-size: 15px;
                        font-weight: 600;
                        line-height: 1.4;
                        margin-bottom: 8px;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }

                    .card.featured .card-content h3 { font-size: 20px; -webkit-line-clamp: 3; }

                    .card-content p {
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        line-height: 1.5;
                        margin-bottom: 12px;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }

                    .card-meta {
                        display: flex;
                        gap: 16px;
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                    }

                    .card-meta span { display: flex; align-items: center; gap: 4px; }

                    /* SHORTS SECTION */
                    .shorts-section {
                        margin-top: 32px;
                        padding-top: 24px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                    }

                    .shorts-section h4 {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 14px;
                        margin-bottom: 16px;
                    }

                    .shorts-section h4 :global(svg) { color: #f97316; }

                    .shorts-grid {
                        display: flex;
                        gap: 16px;
                        overflow-x: auto;
                        padding-bottom: 8px;
                    }

                    .short-card {
                        flex-shrink: 0;
                        width: 140px;
                        cursor: pointer;
                    }

                    .short-thumb {
                        position: relative;
                        width: 140px;
                        height: 200px;
                        border-radius: 12px;
                        overflow: hidden;
                    }

                    .short-thumb img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    }

                    .short-thumb .duration {
                        position: absolute;
                        bottom: 8px;
                        right: 8px;
                        background: rgba(0,0,0,0.7);
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-size: 10px;
                    }

                    .play-overlay {
                        position: absolute;
                        inset: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(0,0,0,0.3);
                        opacity: 0;
                        transition: opacity 0.2s;
                    }

                    .short-card:hover .play-overlay { opacity: 1; }

                    .short-info { padding: 8px 4px; }

                    .short-title {
                        display: block;
                        font-size: 12px;
                        font-weight: 500;
                        margin-bottom: 2px;
                    }

                    .short-views { font-size: 10px; color: rgba(255,255,255,0.4); }

                    /* MEDIA SECTION */
                    .media-section {
                        margin-top: 32px;
                        padding-top: 24px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                    }

                    .media-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 16px;
                    }

                    .media-header h4 {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 14px;
                    }

                    .media-header h4 :global(svg) { color: #00d4ff; }

                    .media-tabs { display: flex; gap: 8px; }

                    .media-tabs button {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 6px 12px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 6px;
                        color: rgba(255,255,255,0.6);
                        font-size: 11px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .media-tabs button:hover { background: rgba(255,255,255,0.1); color: #fff; }
                    .media-tabs button.active { background: #00d4ff; color: #000; border-color: #00d4ff; }

                    .media-grid { display: flex; gap: 16px; overflow-x: auto; }

                    .media-card { flex-shrink: 0; width: 200px; cursor: pointer; }

                    .media-thumb {
                        position: relative;
                        aspect-ratio: 16/9;
                        border-radius: 10px;
                        overflow: hidden;
                        margin-bottom: 8px;
                    }

                    .media-thumb img { width: 100%; height: 100%; object-fit: cover; }

                    .media-thumb .duration {
                        position: absolute;
                        bottom: 6px;
                        right: 6px;
                        background: rgba(0,0,0,0.8);
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-size: 10px;
                    }

                    .media-card:hover .play-overlay { opacity: 1; }

                    .media-title { font-size: 12px; font-weight: 500; }

                    /* SIDEBAR */
                    .sidebar { display: flex; flex-direction: column; gap: 16px; }

                    .widget {
                        background: rgba(255,255,255,0.03);
                        border: 1px solid rgba(255,255,255,0.06);
                        border-radius: 14px;
                        padding: 16px;
                    }

                    .widget h4 {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        margin-bottom: 14px;
                    }

                    .widget h4 :global(svg) { color: #00d4ff; }

                    /* NEWSLETTER */
                    .newsletter h4 {
                        background: linear-gradient(135deg, #7c3aed, #ec4899);
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 14px 14px 0 0;
                    }

                    .newsletter h4 :global(svg) { color: #fff; }

                    .newsletter form { display: flex; gap: 8px; }

                    .newsletter input {
                        flex: 1;
                        padding: 10px 12px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 12px;
                    }

                    .newsletter button {
                        padding: 10px 16px;
                        background: linear-gradient(135deg, #00d4ff, #7c3aed);
                        border: none;
                        border-radius: 8px;
                        color: #fff;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: transform 0.2s;
                    }

                    .newsletter button:hover { transform: scale(1.05); }

                    .subscribed {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 12px;
                        background: rgba(34,197,94,0.1);
                        border-radius: 8px;
                        color: #22c55e;
                        font-weight: 600;
                    }

                    /* TRENDING */
                    .trending-list { list-style: none; padding: 0; margin: 0; }

                    .trending-list li {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                    }

                    .trending-list li:last-child { border-bottom: none; }

                    .trending-list .rank {
                        width: 20px;
                        font-size: 13px;
                        font-weight: 700;
                        color: #00d4ff;
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
                        color: rgba(255,255,255,0.7);
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }

                    /* LEADERBOARD */
                    .leaderboard h4 {
                        background: linear-gradient(135deg, #f59e0b, #d97706);
                        margin: -16px -16px 14px -16px;
                        padding: 12px 16px;
                        border-radius: 14px 14px 0 0;
                    }

                    .leaderboard h4 :global(svg) { color: #fff; }
                    .leaderboard ul { list-style: none; padding: 0; margin: 0; }

                    .leaderboard li {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 8px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                    }

                    .leaderboard li:last-child { border-bottom: none; }

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

                    .medal-1 { background: linear-gradient(135deg, #fbbf24, #d97706); color: #000; }
                    .medal-2 { background: linear-gradient(135deg, #9ca3af, #6b7280); color: #000; }
                    .medal-3 { background: linear-gradient(135deg, #b45309, #92400e); color: #fff; }
                    .medal-4, .medal-5 { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); }

                    .leaderboard .name { flex: 1; font-size: 12px; }
                    .leaderboard .points { font-size: 12px; font-weight: 600; color: #00d4ff; }

                    /* EVENTS */
                    .events-list { list-style: none; padding: 0; margin: 0; }

                    .events-list li {
                        display: flex;
                        justify-content: space-between;
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                        font-size: 12px;
                    }

                    .events-list li:last-child { border-bottom: none; }

                    .events-list .date {
                        background: rgba(0,212,255,0.1);
                        color: #00d4ff;
                        padding: 4px 8px;
                        border-radius: 6px;
                        font-weight: 600;
                        font-size: 11px;
                    }

                    @media (max-width: 600px) {
                        .tabs { display: none; }
                        .header { padding: 12px 16px; }
                        .layout { padding: 16px; }
                        .live-bar { padding: 10px 16px; }
                    }
                `}</style>
            </div>
        </>
    );
}
