/**
 * SMARTER.POKER NEWS HUB
 * Viewport-Based Scaling — Sleek Minimal Design
 * Uses 30vw cards with clamp() for responsive scaling
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Search, Clock, Eye, TrendingUp, Trophy, Calendar,
    Zap, ArrowRight
} from 'lucide-react';
import { supabase } from '../../src/lib/supabase';

// Clean demo data with working images
const MOCK_NEWS = [
    {
        id: 1,
        title: "Pro Says 'This is What Makes Me a Great Poker Player'",
        content: "Earlier this week, the 2025 Championship Freeroll took place. The event field included the top 40 players.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=800&q=80",
        category: "tournament",
        published_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        views: 12450
    },
    {
        id: 2,
        title: "Hollywood Actor Could Testify at High-Profile Trial",
        content: "A famous actor may testify in an upcoming trial involving a well-known poker player.",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=800&q=80",
        category: "industry",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        views: 8720
    },
    {
        id: 3,
        title: "Winner Takes All Heads-Up Match Shocks Community",
        content: "The latest high-stakes heads-up match ends in a controversial deal.",
        image_url: "https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=800&q=80",
        category: "news",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
        views: 6340
    },
    {
        id: 4,
        title: "Could You Chase This Astonishing World Record?",
        content: "A new poker world record attempt has the community buzzing.",
        image_url: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=800&q=80",
        category: "news",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
        views: 5210
    },
    {
        id: 5,
        title: "Card Markers Caught and Instantly Banned",
        content: "Security footage revealed a sophisticated card marking scheme.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=800&q=80",
        category: "industry",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        views: 15680
    },
    {
        id: 6,
        title: "GTO Deep Dive: Optimal River Betting Frequencies",
        content: "Understanding when to bet the river is crucial for maximizing EV.",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=800&q=80",
        category: "strategy",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
        views: 4890
    },
    {
        id: 7,
        title: "WSOP 2025: 99 Bracelet Events Announced",
        content: "The World Series has unveiled its biggest schedule ever.",
        image_url: "https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=800&q=80",
        category: "tournament",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
        views: 22100
    },
    {
        id: 8,
        title: "Online Traffic Hits All-Time High This Month",
        content: "Global online poker traffic has reached unprecedented levels.",
        image_url: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=800&q=80",
        category: "industry",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
        views: 7650
    }
];

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

    const filtered = news.filter(a =>
        !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const hero = filtered[0];
    const secondary = filtered.slice(1, 4);
    const grid = filtered.slice(4);

    return (
        <>
            <Head>
                <title>News | Smarter.Poker</title>
            </Head>

            <div className="news-hub">
                {/* Sticky Header */}
                <header className="news-header">
                    <Link href="/hub">
                        <div className="logo">
                            <Zap className="logo-icon" />
                            <span className="logo-text">News</span>
                        </div>
                    </Link>

                    <div className="search-box">
                        <Search className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search..."
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

                {/* Main Content */}
                <main className="news-main">
                    {/* Hero Row */}
                    <section className="hero-row">
                        {/* Hero Card - Left 2/3 */}
                        {hero && (
                            <Link href={`/hub/article?url=#`} className="hero-card">
                                <motion.div
                                    className="hero-inner"
                                    whileHover={{ scale: 1.02 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <img src={hero.image_url} alt="" className="hero-img" />
                                    <div className="hero-gradient" />
                                    <div className="hero-text">
                                        <h2>{hero.title}</h2>
                                        <p>{hero.content}</p>
                                        <div className="hero-meta">
                                            <span><Clock size={12} /> {timeAgo(hero.published_at)}</span>
                                            <span><Eye size={12} /> {hero.views?.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            </Link>
                        )}

                        {/* Secondary Stack - Right 1/3 */}
                        <div className="secondary-stack">
                            {secondary.map((article, i) => (
                                <Link key={article.id} href={`/hub/article?url=#`}>
                                    <motion.div
                                        className="secondary-card"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        whileHover={{ x: 4 }}
                                    >
                                        <img src={article.image_url} alt="" />
                                        <div className="secondary-info">
                                            <h3>{article.title}</h3>
                                            <span>{timeAgo(article.published_at)}</span>
                                        </div>
                                    </motion.div>
                                </Link>
                            ))}
                        </div>
                    </section>

                    {/* Grid + Sidebar Row */}
                    <section className="content-row">
                        {/* News Grid */}
                        <div className="news-grid">
                            <h4 className="section-title">Latest <ArrowRight size={14} /></h4>
                            <div className="cards-lane">
                                {grid.map((article, i) => (
                                    <Link key={article.id} href={`/hub/article?url=#`}>
                                        <motion.div
                                            className="news-card"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            whileHover={{ y: -6 }}
                                        >
                                            <div className="card-img">
                                                <img src={article.image_url} alt="" />
                                            </div>
                                            <div className="card-body">
                                                <h3>{article.title}</h3>
                                                <div className="card-meta">
                                                    <span>{timeAgo(article.published_at)}</span>
                                                    <span>{article.views?.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </Link>
                                ))}
                            </div>
                        </div>

                        {/* Sidebar */}
                        <aside className="sidebar">
                            {/* Trending */}
                            <div className="widget">
                                <h4><TrendingUp size={14} /> Trending</h4>
                                <ul className="trending-list">
                                    {[...news].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((a, i) => (
                                        <li key={a.id}>
                                            <span className="rank">{i + 1}</span>
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
                                <h4><Calendar size={14} /> Events</h4>
                                <ul className="events-list">
                                    <li><span>WSOP Main Event</span><span className="date">Jun 28</span></li>
                                    <li><span>EPT Barcelona</span><span className="date">Aug 15</span></li>
                                    <li><span>WPT Championship</span><span className="date">Dec 1</span></li>
                                </ul>
                            </div>
                        </aside>
                    </section>
                </main>

                <style jsx>{`
                    .news-hub {
                        --card-size: clamp(160px, 28vw, 240px);
                        --gap: clamp(12px, 2vw, 20px);
                        --pad: clamp(16px, 4vw, 32px);
                        
                        min-height: 100vh;
                        background: #0a0a12;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }

                    /* HEADER */
                    .news-header {
                        position: sticky;
                        top: 0;
                        z-index: 100;
                        display: flex;
                        align-items: center;
                        gap: var(--gap);
                        padding: 12px var(--pad);
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

                    .logo :global(.logo-icon) {
                        width: 24px;
                        height: 24px;
                        color: #00d4ff;
                    }

                    .logo-text {
                        font-size: clamp(18px, 3vw, 22px);
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
                        padding: 10px 12px 10px 36px;
                        background: rgba(255,255,255,0.06);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 10px;
                        color: #fff;
                        font-size: 13px;
                        outline: none;
                    }

                    .search-box input:focus {
                        border-color: #00d4ff;
                    }

                    .search-box :global(.search-icon) {
                        position: absolute;
                        left: 12px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 16px;
                        height: 16px;
                        color: rgba(255,255,255,0.4);
                    }

                    .tabs {
                        display: flex;
                        gap: 4px;
                    }

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

                    .tab:hover {
                        color: #fff;
                        background: rgba(255,255,255,0.05);
                    }

                    .tab.active {
                        color: #fff;
                        background: linear-gradient(135deg, #00d4ff, #7c3aed);
                    }

                    /* MAIN */
                    .news-main {
                        padding: var(--pad);
                        max-width: 1400px;
                        margin: 0 auto;
                    }

                    /* HERO ROW */
                    .hero-row {
                        display: grid;
                        grid-template-columns: 2fr 1fr;
                        gap: var(--gap);
                        margin-bottom: var(--pad);
                    }

                    @media (max-width: 800px) {
                        .hero-row {
                            grid-template-columns: 1fr;
                        }
                    }

                    .hero-card {
                        display: block;
                        text-decoration: none;
                    }

                    .hero-inner {
                        position: relative;
                        height: clamp(280px, 40vw, 380px);
                        border-radius: 16px;
                        overflow: hidden;
                    }

                    .hero-img {
                        position: absolute;
                        inset: 0;
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        transition: transform 0.5s;
                    }

                    .hero-inner:hover .hero-img {
                        transform: scale(1.05);
                    }

                    .hero-gradient {
                        position: absolute;
                        inset: 0;
                        background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%);
                    }

                    .hero-text {
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        padding: 24px;
                    }

                    .hero-text h2 {
                        font-size: clamp(20px, 3.5vw, 28px);
                        font-weight: 700;
                        line-height: 1.2;
                        margin-bottom: 8px;
                        color: #fff;
                    }

                    .hero-text p {
                        font-size: clamp(12px, 2vw, 14px);
                        color: rgba(255,255,255,0.7);
                        line-height: 1.5;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                        margin-bottom: 10px;
                    }

                    .hero-meta {
                        display: flex;
                        gap: 16px;
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                    }

                    .hero-meta span {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }

                    /* SECONDARY STACK */
                    .secondary-stack {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }

                    .secondary-card {
                        display: flex;
                        gap: 12px;
                        padding: 12px;
                        background: rgba(255,255,255,0.03);
                        border: 1px solid rgba(255,255,255,0.06);
                        border-radius: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .secondary-card:hover {
                        background: rgba(255,255,255,0.06);
                        border-color: rgba(0,212,255,0.2);
                    }

                    .secondary-card img {
                        width: 80px;
                        height: 60px;
                        object-fit: cover;
                        border-radius: 8px;
                        flex-shrink: 0;
                    }

                    .secondary-info {
                        flex: 1;
                        min-width: 0;
                    }

                    .secondary-info h3 {
                        font-size: 13px;
                        font-weight: 600;
                        line-height: 1.3;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                        margin-bottom: 4px;
                        color: #fff;
                    }

                    .secondary-info span {
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                    }

                    /* CONTENT ROW */
                    .content-row {
                        display: grid;
                        grid-template-columns: 1fr 280px;
                        gap: var(--gap);
                    }

                    @media (max-width: 900px) {
                        .content-row {
                            grid-template-columns: 1fr;
                        }
                    }

                    .section-title {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 14px;
                        font-weight: 600;
                        margin-bottom: 16px;
                        color: rgba(255,255,255,0.9);
                    }

                    /* CARDS LANE */
                    .cards-lane {
                        display: flex;
                        gap: var(--gap);
                        overflow-x: auto;
                        padding-bottom: 12px;
                        scrollbar-width: none;
                    }

                    .cards-lane::-webkit-scrollbar {
                        display: none;
                    }

                    .news-card {
                        width: var(--card-size);
                        flex-shrink: 0;
                        background: rgba(255,255,255,0.03);
                        border: 1px solid rgba(255,255,255,0.06);
                        border-radius: 14px;
                        overflow: hidden;
                        cursor: pointer;
                        transition: all 0.3s;
                    }

                    .news-card:hover {
                        border-color: rgba(0,212,255,0.3);
                        box-shadow: 0 8px 24px rgba(0,212,255,0.08);
                    }

                    .card-img {
                        width: 100%;
                        height: var(--card-size);
                        overflow: hidden;
                    }

                    .card-img img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        transition: transform 0.4s;
                    }

                    .news-card:hover .card-img img {
                        transform: scale(1.08);
                    }

                    .card-body {
                        padding: 14px;
                    }

                    .card-body h3 {
                        font-size: 13px;
                        font-weight: 600;
                        line-height: 1.35;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                        margin-bottom: 8px;
                        color: #fff;
                    }

                    .card-meta {
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                    }

                    /* SIDEBAR */
                    .sidebar {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }

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
                        color: rgba(255,255,255,0.9);
                    }

                    .widget h4 :global(svg) {
                        color: #00d4ff;
                    }

                    .trending-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .trending-list li {
                        display: flex;
                        gap: 10px;
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                    }

                    .trending-list li:last-child {
                        border-bottom: none;
                    }

                    .trending-list .rank {
                        width: 20px;
                        font-size: 13px;
                        font-weight: 700;
                        color: #00d4ff;
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
                        border-bottom: 1px solid rgba(255,255,255,0.05);
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

                    .medal-1 { background: linear-gradient(135deg, #fbbf24, #d97706); color: #000; }
                    .medal-2 { background: linear-gradient(135deg, #9ca3af, #6b7280); color: #000; }
                    .medal-3 { background: linear-gradient(135deg, #b45309, #92400e); color: #fff; }
                    .medal-4, .medal-5 { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); }

                    .leaderboard .name {
                        flex: 1;
                        font-size: 12px;
                        color: #fff;
                    }

                    .leaderboard .points {
                        font-size: 12px;
                        font-weight: 600;
                        color: #00d4ff;
                        font-family: 'SF Mono', monospace;
                    }

                    /* EVENTS */
                    .events-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .events-list li {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                        font-size: 12px;
                        color: rgba(255,255,255,0.8);
                    }

                    .events-list li:last-child {
                        border-bottom: none;
                    }

                    .events-list .date {
                        background: rgba(0,212,255,0.1);
                        color: #00d4ff;
                        padding: 4px 8px;
                        border-radius: 6px;
                        font-weight: 600;
                        font-size: 11px;
                    }

                    @media (max-width: 600px) {
                        .tabs {
                            display: none;
                        }
                        
                        .search-box {
                            max-width: 100%;
                        }
                    }
                `}</style>
            </div>
        </>
    );
}
