/**
 * SMARTER.POKER NEWS HUB
 * Clean Premium Design — The Poker Intelligence Center
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Search, Clock, Eye, TrendingUp, Trophy, Calendar,
    Newspaper, Target, Lightbulb, BarChart3, Zap, Star,
    Flame, ArrowRight, Sparkles
} from 'lucide-react';
import { supabase } from '../../src/lib/supabase';

// Category styling - Clean Smarter.Poker branding
const CATEGORY_STYLES = {
    'tournament': { bg: 'from-amber-500 to-orange-500', label: 'Tournament', icon: '🏆' },
    'strategy': { bg: 'from-cyan-500 to-blue-500', label: 'Strategy', icon: '🧠' },
    'industry': { bg: 'from-purple-500 to-pink-500', label: 'Industry', icon: '📊' },
    'news': { bg: 'from-emerald-500 to-green-500', label: 'Breaking', icon: '⚡' },
    'default': { bg: 'from-slate-500 to-slate-600', label: 'News', icon: '📰' }
};

const CATEGORIES = [
    { id: 'all', label: 'All News', icon: Newspaper },
    { id: 'tournament', label: 'Tournaments', icon: Trophy },
    { id: 'strategy', label: 'Strategy', icon: Lightbulb },
    { id: 'industry', label: 'Industry', icon: BarChart3 }
];

// Clean demo data - No competitor names
const MOCK_NEWS = [
    {
        id: 1,
        title: "Hands of the Week: Pro Says 'This is What Makes Me a Great Poker Player!'",
        content: "Earlier this week, the 2025 Championship Freeroll took place at the studio. The freeroll event field included the top 40 players on the leaderboard and 14 Dream Seat qualifiers.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=800&q=80",
        category: "tournament",
        published_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        views: 12450
    },
    {
        id: 2,
        title: "Hollywood Actor Could Testify at High-Profile Poker Trial",
        content: "A famous Hollywood actor may be called to testify in an upcoming trial involving a well-known poker player.",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=600&q=80",
        category: "industry",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        views: 8720
    },
    {
        id: 3,
        title: "Players Agree to 'Winner Takes All' Heads-Up Match",
        content: "The latest high-stakes heads-up match ends in a controversial winner-take-all deal.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80",
        category: "news",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
        views: 6340
    },
    {
        id: 4,
        title: "Could You Chase This Astonishing Poker World Record?",
        content: "A new poker world record attempt is underway that has the community buzzing with excitement.",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=600&q=80",
        category: "news",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
        views: 5210
    },
    {
        id: 5,
        title: "Cheaters Caught Marking Cards at Major Card Room — Instantly Banned",
        content: "Security footage revealed a sophisticated card marking scheme at a major cardroom.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80",
        category: "industry",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        views: 15680
    },
    {
        id: 6,
        title: "GTO Strategy Deep Dive: Optimal River Betting Frequencies",
        content: "Understanding when to bet the river is crucial for maximizing EV in modern poker.",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=600&q=80",
        category: "strategy",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
        views: 4890
    },
    {
        id: 7,
        title: "WSOP 2025 Schedule Released: 99 Bracelet Events Announced",
        content: "The World Series of Poker has unveiled its biggest schedule ever with 99 gold bracelet events.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80",
        category: "tournament",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
        views: 22100
    },
    {
        id: 8,
        title: "Online Poker Traffic Hits All-Time High in January 2025",
        content: "Global online poker traffic has reached unprecedented levels according to new data.",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=600&q=80",
        category: "industry",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
        views: 7650
    },
    {
        id: 9,
        title: "ICM Fundamentals: When to Fold Pocket Aces on the Bubble",
        content: "Advanced ICM analysis shows there are spots where folding aces is the correct play.",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80",
        category: "strategy",
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 16).toISOString(),
        views: 9340
    }
];

const POY_LEADERBOARD = [
    { rank: 1, name: "Alex F.", points: 2850 },
    { rank: 2, name: "Thomas B.", points: 2720 },
    { rank: 3, name: "Chad E.", points: 2580 },
    { rank: 4, name: "Stephen C.", points: 2410 },
    { rank: 5, name: "Daniel N.", points: 2290 }
];

const UPCOMING_EVENTS = [
    { name: "WSOP Main Event", date: "Jun 28", location: "Las Vegas" },
    { name: "EPT Barcelona", date: "Aug 15", location: "Spain" },
    { name: "WPT World Championship", date: "Dec 1", location: "Las Vegas" }
];

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function readTime(content) {
    const words = content?.split(' ').length || 100;
    return `${Math.ceil(words / 200)} min read`;
}

function getCategoryStyle(category) {
    return CATEGORY_STYLES[category] || CATEGORY_STYLES.default;
}

// Clean Category Badge
function CategoryBadge({ category, className = "" }) {
    const style = getCategoryStyle(category);
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${style.bg} text-white shadow-lg ${className}`}>
            {style.icon} {style.label}
        </span>
    );
}

// Premium News Card with hover effects
function NewsCard({ article, index }) {
    const style = getCategoryStyle(article.category);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.5 }}
            whileHover={{ y: -8 }}
            className="group cursor-pointer"
        >
            <Link href={`/hub/article?url=${encodeURIComponent(article.source_url || '#')}`}>
                <div className="relative bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-2xl overflow-hidden border border-zinc-800/50 
                    hover:border-cyan-500/40 transition-all duration-500 shadow-xl hover:shadow-cyan-500/10">

                    {/* Image with overlay */}
                    <div className="relative h-48 overflow-hidden">
                        <img
                            src={article.image_url}
                            alt={article.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />

                        {/* Category Badge */}
                        <div className="absolute top-3 left-3">
                            <CategoryBadge category={article.category} />
                        </div>

                        {/* Glow on hover */}
                        <div className="absolute inset-0 bg-cyan-500/0 group-hover:bg-cyan-500/5 transition-all duration-500" />
                    </div>

                    {/* Content */}
                    <div className="p-5">
                        <h3 className="text-white font-bold text-base leading-snug mb-3 line-clamp-2 
                            group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-purple-400 
                            group-hover:bg-clip-text transition-all duration-300">
                            {article.title}
                        </h3>
                        <p className="text-zinc-400 text-sm line-clamp-2 mb-4">
                            {article.content}
                        </p>
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {timeAgo(article.published_at)}
                            </span>
                            <span className="flex items-center gap-1.5 text-cyan-500/70">
                                <Eye className="w-3.5 h-3.5" />
                                {article.views?.toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Bottom accent line */}
                    <div className={`h-1 bg-gradient-to-r ${style.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                </div>
            </Link>
        </motion.div>
    );
}

export default function NewsHub() {
    const [news, setNews] = useState(MOCK_NEWS);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');

    useEffect(() => {
        loadNews();
    }, [selectedCategory]);

    const loadNews = async () => {
        setLoading(true);
        try {
            let query = supabase.from('poker_news').select('*');
            if (selectedCategory !== 'all') {
                query = query.eq('category', selectedCategory);
            }
            query = query.order('published_at', { ascending: false }).limit(30);

            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                setNews(data);
            }
        } catch (e) {
            console.log('Using mock data');
        }
        setLoading(false);
    };

    const filteredNews = news.filter(article => {
        if (searchQuery && !article.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const heroArticle = filteredNews[0];
    const breakingHeadlines = filteredNews.slice(1, 5);
    const gridNews = filteredNews.slice(5);

    return (
        <>
            <Head>
                <title>News Hub | Smarter.Poker</title>
                <meta name="description" content="Your one-stop shop for poker intelligence" />
            </Head>

            <div className="min-h-screen bg-zinc-950">
                {/* Animated Background */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-cyan-500/5 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-0 right-1/4 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                    <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-blue-500/3 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                </div>

                {/* Header */}
                <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50">
                    <div className="max-w-7xl mx-auto px-4 py-4">
                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                            {/* Logo + Title */}
                            <Link href="/hub">
                                <motion.div
                                    className="flex items-center gap-3 cursor-pointer group"
                                    whileHover={{ scale: 1.02 }}
                                >
                                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 
                                        flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-500/40 transition-shadow">
                                        <Zap className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                                            News Hub
                                        </h1>
                                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Poker Intelligence</p>
                                    </div>
                                </motion.div>
                            </Link>

                            {/* Search */}
                            <div className="flex-1 max-w-lg">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                    <input
                                        type="text"
                                        placeholder="Search stories..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-white text-sm
                                            placeholder-zinc-500 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {/* Category Tabs */}
                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                {CATEGORIES.map(cat => {
                                    const Icon = cat.icon;
                                    const isActive = selectedCategory === cat.id;
                                    return (
                                        <motion.button
                                            key={cat.id}
                                            onClick={() => setSelectedCategory(cat.id)}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all
                                                ${isActive
                                                    ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-500/25'
                                                    : 'bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800'
                                                }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {cat.label}
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="relative max-w-7xl mx-auto px-4 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* Main Content Area */}
                        <div className="lg:col-span-8 space-y-10">

                            {/* Hero Section */}
                            <motion.section
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="grid grid-cols-1 md:grid-cols-5 gap-5"
                            >
                                {/* Main Feature (3/5) */}
                                {heroArticle && (
                                    <div className="md:col-span-3">
                                        <Link href={`/hub/article?url=${encodeURIComponent(heroArticle.source_url || '#')}`}>
                                            <motion.div
                                                className="relative h-[420px] rounded-2xl overflow-hidden group cursor-pointer"
                                                whileHover={{ scale: 1.01 }}
                                            >
                                                <img
                                                    src={heroArticle.image_url}
                                                    alt={heroArticle.title}
                                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />

                                                {/* Content overlay */}
                                                <div className="absolute bottom-0 left-0 right-0 p-6">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <CategoryBadge category={heroArticle.category} />
                                                        <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur text-xs text-zinc-300 flex items-center gap-1.5">
                                                            <Clock className="w-3 h-3" />
                                                            {readTime(heroArticle.content)}
                                                        </span>
                                                    </div>
                                                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 leading-tight 
                                                        group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-purple-400 
                                                        group-hover:bg-clip-text transition-all duration-300">
                                                        {heroArticle.title}
                                                    </h2>
                                                    <p className="text-zinc-300 text-sm line-clamp-2 mb-4">
                                                        {heroArticle.content}
                                                    </p>
                                                    <div className="flex items-center gap-4 text-sm text-zinc-400">
                                                        <span>{timeAgo(heroArticle.published_at)}</span>
                                                        <span className="flex items-center gap-1.5">
                                                            <Eye className="w-4 h-4 text-cyan-500" />
                                                            {heroArticle.views?.toLocaleString()} views
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Glow border on hover */}
                                                <div className="absolute inset-0 border-2 border-transparent group-hover:border-cyan-500/30 rounded-2xl transition-all duration-300" />
                                            </motion.div>
                                        </Link>
                                    </div>
                                )}

                                {/* Breaking Headlines Stack (2/5) */}
                                <div className="md:col-span-2 space-y-4">
                                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                        <Flame className="w-4 h-4 text-orange-500" />
                                        Breaking
                                    </h3>
                                    {breakingHeadlines.map((article, i) => (
                                        <motion.div
                                            key={article.id}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.1 }}
                                            whileHover={{ x: 4 }}
                                        >
                                            <Link href={`/hub/article?url=${encodeURIComponent(article.source_url || '#')}`}>
                                                <div className="flex gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/50 
                                                    hover:border-cyan-500/30 hover:bg-zinc-900/80 cursor-pointer transition-all group">
                                                    <img
                                                        src={article.image_url}
                                                        alt={article.title}
                                                        className="w-20 h-16 object-cover rounded-lg flex-shrink-0"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <CategoryBadge category={article.category} className="mb-2 text-[10px] py-0.5 px-2" />
                                                        <h4 className="text-white text-sm font-semibold line-clamp-2 group-hover:text-cyan-400 transition-colors">
                                                            {article.title}
                                                        </h4>
                                                        <p className="text-zinc-500 text-xs mt-1">{timeAgo(article.published_at)}</p>
                                                    </div>
                                                </div>
                                            </Link>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.section>

                            {/* Latest Stories Grid */}
                            <section>
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-cyan-400" />
                                        Latest Stories
                                    </h2>
                                    <button className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
                                        View All <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {gridNews.map((article, i) => (
                                        <NewsCard key={article.id} article={article} index={i} />
                                    ))}
                                </div>
                            </section>
                        </div>

                        {/* Sidebar */}
                        <aside className="lg:col-span-4 space-y-6">

                            {/* Trending Stories */}
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-800/50 p-5"
                            >
                                <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-orange-400" />
                                    Trending Now
                                </h3>
                                <div className="space-y-4">
                                    {[...news].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((article, i) => (
                                        <motion.div
                                            key={article.id}
                                            className="flex gap-3 group cursor-pointer"
                                            whileHover={{ x: 4 }}
                                        >
                                            <span className={`text-xl font-black w-6 ${i < 3 ? 'text-transparent bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text' : 'text-zinc-600'}`}>
                                                {i + 1}
                                            </span>
                                            <div className="flex-1">
                                                <p className="text-sm text-zinc-300 font-medium line-clamp-2 group-hover:text-cyan-400 transition-colors">
                                                    {article.title}
                                                </p>
                                                <span className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                                                    <Eye className="w-3 h-3 text-cyan-500/50" />
                                                    {article.views?.toLocaleString()}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Player of the Year */}
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-800/50 overflow-hidden"
                            >
                                <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Trophy className="w-4 h-4" />
                                        Player of the Year
                                    </h3>
                                </div>
                                <div className="p-4 space-y-1">
                                    {POY_LEADERBOARD.map((player, i) => (
                                        <motion.div
                                            key={i}
                                            className="flex items-center justify-between py-2.5 border-b border-zinc-800/50 last:border-0"
                                            whileHover={{ x: 4 }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-lg
                                                    ${i === 0 ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-black'
                                                        : i === 1 ? 'bg-gradient-to-r from-zinc-300 to-zinc-400 text-black'
                                                            : i === 2 ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white'
                                                                : 'bg-zinc-800 text-zinc-400'}`}>
                                                    {player.rank}
                                                </span>
                                                <span className="text-sm text-white font-medium">{player.name}</span>
                                            </div>
                                            <span className="text-sm text-cyan-400 font-mono font-bold">{player.points.toLocaleString()}</span>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Daily Challenge */}
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 }}
                                className="bg-gradient-to-br from-purple-500/10 via-cyan-500/10 to-blue-500/10 rounded-2xl border border-purple-500/20 p-5"
                            >
                                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                    <Star className="w-4 h-4 text-purple-400" />
                                    Daily XP Challenge
                                </h3>
                                <p className="text-sm text-zinc-300 mb-4">
                                    Read 3 articles today to earn bonus XP!
                                </p>
                                <div className="flex gap-2 mb-3">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className={`flex-1 h-2.5 rounded-full transition-all duration-500
                                            ${i === 1 ? 'bg-gradient-to-r from-cyan-500 to-purple-500' : 'bg-zinc-800'}`} />
                                    ))}
                                </div>
                                <p className="text-xs text-zinc-500">1 of 3 completed • <span className="text-cyan-400">+50 XP reward</span></p>
                            </motion.div>

                            {/* Upcoming Events */}
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 }}
                                className="bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-800/50 p-5"
                            >
                                <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-green-400" />
                                    Upcoming Events
                                </h3>
                                <div className="space-y-3">
                                    {UPCOMING_EVENTS.map((event, i) => (
                                        <motion.div
                                            key={i}
                                            className="flex items-center justify-between py-2.5 border-b border-zinc-800/50 last:border-0"
                                            whileHover={{ x: 4 }}
                                        >
                                            <div>
                                                <p className="text-sm text-white font-medium">{event.name}</p>
                                                <p className="text-xs text-zinc-500">{event.location}</p>
                                            </div>
                                            <span className="text-xs text-cyan-400 font-mono bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                                                {event.date}
                                            </span>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        </aside>
                    </div>
                </main>
            </div>
        </>
    );
}
