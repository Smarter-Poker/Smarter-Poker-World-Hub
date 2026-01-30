/**
 * POKER LEADERBOARDS PAGE
 * Rankings by check-ins, reviews, activity, and overall engagement.
 * Route: /hub/leaderboards
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import PageTransition from '../../src/components/transitions/PageTransition';

const C = {
    bg: '#0a0a0a',
    card: '#1a1a1a',
    cardHover: '#252525',
    text: '#FFFFFF',
    textSec: '#9ca3af',
    border: '#2a2a2a',
    blue: '#3b82f6',
    green: '#22c55e',
    red: '#ef4444',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
    gold: '#d4a853',
    goldBright: '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
};

const TABS = [
    { key: 'overall', label: 'Overall', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z' },
    { key: 'checkins', label: 'Check-ins', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
    { key: 'reviews', label: 'Reviews', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z' },
    { key: 'activity', label: 'Activity', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
];

const PERIODS = [
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' },
];

function getMedalColor(rank) {
    if (rank === 1) return C.goldBright;
    if (rank === 2) return C.silver;
    if (rank === 3) return C.bronze;
    return null;
}

function getRankDisplay(rank) {
    if (rank === 1) return { label: '1st', bg: 'linear-gradient(135deg, #FFD700, #FFA500)', shadow: '0 0 20px rgba(255,215,0,0.4)' };
    if (rank === 2) return { label: '2nd', bg: 'linear-gradient(135deg, #C0C0C0, #A0A0A0)', shadow: '0 0 15px rgba(192,192,192,0.3)' };
    if (rank === 3) return { label: '3rd', bg: 'linear-gradient(135deg, #CD7F32, #B8690E)', shadow: '0 0 15px rgba(205,127,50,0.3)' };
    return { label: `#${rank}`, bg: C.card, shadow: 'none' };
}

function Avatar({ src, name, size = 48 }) {
    const initials = (name || 'P').charAt(0).toUpperCase();
    const colors = ['#3b82f6', '#22c55e', '#ef4444', '#8b5cf6', '#f59e0b', '#06b6d4'];
    const bgColor = colors[initials.charCodeAt(0) % colors.length];

    if (src) {
        return (
            <img
                src={src}
                alt={name}
                style={{
                    width: size, height: size, borderRadius: '50%',
                    objectFit: 'cover', flexShrink: 0
                }}
            />
        );
    }
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', background: bgColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.4, fontWeight: 700, color: 'white', flexShrink: 0
        }}>
            {initials}
        </div>
    );
}

// Top 3 podium display
function Podium({ leaders }) {
    if (!leaders || leaders.length < 1) return null;

    const top3 = leaders.slice(0, 3);
    // Reorder for podium: 2nd, 1st, 3rd
    const podiumOrder = top3.length >= 3
        ? [top3[1], top3[0], top3[2]]
        : top3.length === 2
            ? [top3[1], top3[0]]
            : [top3[0]];

    const heights = { 0: 100, 1: 140, 2: 80 };
    const sizes = { 0: 60, 1: 80, 2: 56 };
    const medalColors = [C.silver, C.goldBright, C.bronze];

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
            gap: 12, padding: '24px 16px 0', marginBottom: 16
        }}>
            {podiumOrder.map((leader, idx) => {
                const actualRank = leader.rank;
                const medal = getMedalColor(actualRank);
                const h = heights[idx] || 80;
                const avatarSize = sizes[idx] || 56;

                return (
                    <motion.div
                        key={leader.user?.id || idx}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.15, duration: 0.4 }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: 140 }}
                    >
                        <Link href={`/hub/user/${leader.user?.username || ''}`} style={{ textDecoration: 'none', textAlign: 'center' }}>
                            <div style={{ position: 'relative', marginBottom: 8 }}>
                                <div style={{
                                    border: `3px solid ${medal}`,
                                    borderRadius: '50%', padding: 2, display: 'inline-block',
                                    boxShadow: `0 0 15px ${medal}40`
                                }}>
                                    <Avatar
                                        src={leader.user?.avatar_url}
                                        name={leader.user?.full_name || leader.user?.username}
                                        size={avatarSize}
                                    />
                                </div>
                                <div style={{
                                    position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
                                    background: medal, color: actualRank <= 2 ? '#000' : '#fff',
                                    fontSize: 11, fontWeight: 800, padding: '2px 8px',
                                    borderRadius: 10, minWidth: 24, textAlign: 'center'
                                }}>
                                    {actualRank}
                                </div>
                            </div>
                            <div style={{
                                fontSize: 13, fontWeight: 600, color: C.text,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                maxWidth: 120
                            }}>
                                {leader.user?.full_name || leader.user?.username || 'Player'}
                            </div>
                        </Link>
                        <div style={{
                            fontSize: 14, fontWeight: 700, color: C.gold, marginTop: 4
                        }}>
                            {leader.score != null ? leader.score.toLocaleString() : (leader.count || 0).toLocaleString()}
                        </div>
                        <div style={{
                            width: '80%', height: h, marginTop: 8,
                            background: `linear-gradient(180deg, ${medal}30, ${medal}10)`,
                            borderRadius: '8px 8px 0 0',
                            border: `1px solid ${medal}40`,
                            borderBottom: 'none'
                        }} />
                    </motion.div>
                );
            })}
        </div>
    );
}

// Individual leaderboard row
function LeaderRow({ leader, type, index }) {
    const rankInfo = getRankDisplay(leader.rank);
    const isTopThree = leader.rank <= 3;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03, duration: 0.3 }}
        >
            <Link
                href={`/hub/user/${leader.user?.username || ''}`}
                style={{ textDecoration: 'none' }}
            >
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                    background: isTopThree ? `${getMedalColor(leader.rank)}08` : 'transparent',
                    borderBottom: `1px solid ${C.border}`,
                    transition: 'background 0.2s',
                    cursor: 'pointer'
                }}
                    onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                    onMouseLeave={e => e.currentTarget.style.background = isTopThree ? `${getMedalColor(leader.rank)}08` : 'transparent'}
                >
                    {/* Rank */}
                    <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: isTopThree ? 14 : 13,
                        fontWeight: isTopThree ? 800 : 600,
                        color: isTopThree ? (leader.rank <= 2 ? '#000' : '#fff') : C.textSec,
                        background: isTopThree ? rankInfo.bg : C.border + '40',
                        boxShadow: rankInfo.shadow,
                        flexShrink: 0
                    }}>
                        {leader.rank}
                    </div>

                    {/* Avatar */}
                    <Avatar
                        src={leader.user?.avatar_url}
                        name={leader.user?.full_name || leader.user?.username}
                        size={40}
                    />

                    {/* Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 14, fontWeight: 600, color: C.text,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>
                            {leader.user?.full_name || leader.user?.username || 'Player'}
                        </div>
                        {leader.user?.username && (
                            <div style={{ fontSize: 12, color: C.textSec }}>
                                @{leader.user.username}
                            </div>
                        )}
                    </div>

                    {/* Score/Count */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                            fontSize: 16, fontWeight: 700,
                            color: isTopThree ? C.gold : C.text
                        }}>
                            {type === 'overall'
                                ? (leader.score || 0).toLocaleString()
                                : (leader.count || 0).toLocaleString()
                            }
                        </div>
                        <div style={{ fontSize: 11, color: C.textSec }}>
                            {type === 'overall' ? 'pts' : leader.metric || type}
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}

// Breakdown bar for overall tab
function ScoreBreakdown({ leader }) {
    if (!leader.checkins && !leader.reviews && !leader.posts) return null;
    const total = (leader.checkins || 0) * 2 + (leader.reviews || 0) * 3 + (leader.posts || 0);
    if (total === 0) return null;

    const segments = [
        { label: 'Check-ins', value: (leader.checkins || 0) * 2, color: C.blue },
        { label: 'Reviews', value: (leader.reviews || 0) * 3, color: C.green },
        { label: 'Posts', value: leader.posts || 0, color: C.purple },
    ].filter(s => s.value > 0);

    return (
        <div style={{ display: 'flex', gap: 2, height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
            {segments.map(s => (
                <div
                    key={s.label}
                    style={{
                        flex: s.value / total,
                        background: s.color,
                        borderRadius: 2,
                        minWidth: 4
                    }}
                    title={`${s.label}: ${s.value} pts`}
                />
            ))}
        </div>
    );
}

export default function LeaderboardsPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('overall');
    const [period, setPeriod] = useState('all');
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchLeaderboards = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/poker/leaderboards?type=${activeTab}&period=${period}&limit=50`);
            if (!res.ok) throw new Error('Failed to load leaderboards');
            const data = await res.json();
            setLeaders(data.leaders || []);
        } catch (err) {
            console.error('Leaderboard fetch error:', err);
            setError(err.message);
            setLeaders([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, period]);

    useEffect(() => {
        fetchLeaderboards();
    }, [fetchLeaderboards]);

    // Set tab from URL query
    useEffect(() => {
        if (router.query.tab && TABS.find(t => t.key === router.query.tab)) {
            setActiveTab(router.query.tab);
        }
        if (router.query.period && PERIODS.find(p => p.key === router.query.period)) {
            setPeriod(router.query.period);
        }
    }, [router.query]);

    const getMetricDescription = () => {
        switch (activeTab) {
            case 'checkins': return 'Players ranked by venue check-ins';
            case 'reviews': return 'Players ranked by venue reviews written';
            case 'activity': return 'Players ranked by social posts created';
            case 'overall': return 'Combined score: check-ins (x2) + reviews (x3) + posts (x1)';
            default: return '';
        }
    };

    return (
        <>
            <Head>
                <title>Leaderboards | Smarter.Poker</title>
                <meta name="description" content="Poker community leaderboards - see who's the most active player" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <UniversalHeader pageDepth={1} />

            <PageTransition>
                <div style={{
                    minHeight: '100vh', background: C.bg,
                    paddingTop: 80, paddingBottom: 40
                }}>
                    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px' }}>

                        {/* Header */}
                        <div style={{ marginBottom: 24 }}>
                            <h1 style={{
                                fontSize: 28, fontWeight: 800, color: C.text,
                                margin: 0, letterSpacing: '-0.02em'
                            }}>
                                Leaderboards
                            </h1>
                            <p style={{
                                fontSize: 14, color: C.textSec, margin: '6px 0 0',
                                lineHeight: 1.4
                            }}>
                                Top poker community members ranked by engagement
                            </p>
                        </div>

                        {/* Tab Navigation */}
                        <div style={{
                            display: 'flex', gap: 4,
                            background: C.card, borderRadius: 12,
                            padding: 4, marginBottom: 16,
                            border: `1px solid ${C.border}`
                        }}>
                            {TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => {
                                        setActiveTab(tab.key);
                                        router.replace({ query: { ...router.query, tab: tab.key } }, undefined, { shallow: true });
                                    }}
                                    style={{
                                        flex: 1, padding: '10px 8px',
                                        background: activeTab === tab.key ? C.blue : 'transparent',
                                        color: activeTab === tab.key ? '#fff' : C.textSec,
                                        border: 'none', borderRadius: 8,
                                        fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d={tab.icon} />
                                    </svg>
                                    <span className="tab-label">{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Period Selector */}
                        <div style={{
                            display: 'flex', gap: 8,
                            marginBottom: 16,
                            justifyContent: 'center'
                        }}>
                            {PERIODS.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => {
                                        setPeriod(p.key);
                                        router.replace({ query: { ...router.query, period: p.key } }, undefined, { shallow: true });
                                    }}
                                    style={{
                                        padding: '6px 16px',
                                        background: period === p.key ? C.gold + '20' : 'transparent',
                                        color: period === p.key ? C.gold : C.textSec,
                                        border: `1px solid ${period === p.key ? C.gold + '60' : C.border}`,
                                        borderRadius: 20,
                                        fontSize: 13, fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Metric Description */}
                        <div style={{
                            textAlign: 'center', fontSize: 12, color: C.textSec,
                            marginBottom: 20, fontStyle: 'italic'
                        }}>
                            {getMetricDescription()}
                        </div>

                        {/* Content */}
                        <AnimatePresence mode="wait">
                            {loading ? (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <div style={{
                                        background: C.card, borderRadius: 12,
                                        border: `1px solid ${C.border}`, overflow: 'hidden'
                                    }}>
                                        {[...Array(10)].map((_, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '12px 16px',
                                                borderBottom: `1px solid ${C.border}`
                                            }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: '50%',
                                                    background: C.border + '40', animation: 'pulse 1.5s infinite'
                                                }} />
                                                <div style={{
                                                    width: 40, height: 40, borderRadius: '50%',
                                                    background: C.border + '40', animation: 'pulse 1.5s infinite'
                                                }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{
                                                        width: '60%', height: 14, borderRadius: 4,
                                                        background: C.border + '40', animation: 'pulse 1.5s infinite',
                                                        marginBottom: 6
                                                    }} />
                                                    <div style={{
                                                        width: '30%', height: 10, borderRadius: 4,
                                                        background: C.border + '40', animation: 'pulse 1.5s infinite'
                                                    }} />
                                                </div>
                                                <div style={{
                                                    width: 50, height: 20, borderRadius: 4,
                                                    background: C.border + '40', animation: 'pulse 1.5s infinite'
                                                }} />
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            ) : error ? (
                                <motion.div
                                    key="error"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    style={{
                                        textAlign: 'center', padding: 40,
                                        background: C.card, borderRadius: 12,
                                        border: `1px solid ${C.border}`
                                    }}
                                >
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="1.5" style={{ marginBottom: 12 }}>
                                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <p style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
                                        Failed to load leaderboards
                                    </p>
                                    <p style={{ color: C.textSec, fontSize: 14, margin: '0 0 16px' }}>{error}</p>
                                    <button
                                        onClick={fetchLeaderboards}
                                        style={{
                                            padding: '8px 20px', background: C.blue, color: '#fff',
                                            border: 'none', borderRadius: 8, fontSize: 14,
                                            fontWeight: 600, cursor: 'pointer'
                                        }}
                                    >
                                        Retry
                                    </button>
                                </motion.div>
                            ) : leaders.length === 0 ? (
                                <motion.div
                                    key="empty"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    style={{
                                        textAlign: 'center', padding: 60,
                                        background: C.card, borderRadius: 12,
                                        border: `1px solid ${C.border}`
                                    }}
                                >
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="1" style={{ marginBottom: 16, opacity: 0.5 }}>
                                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <p style={{ color: C.text, fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
                                        No rankings yet
                                    </p>
                                    <p style={{ color: C.textSec, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                                        Be the first to earn a spot! Check in at venues, write reviews, and post in the community.
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key={`${activeTab}-${period}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    {/* Podium for top 3 */}
                                    {leaders.length >= 3 && <Podium leaders={leaders} />}

                                    {/* Full Leaderboard List */}
                                    <div style={{
                                        background: C.card, borderRadius: 12,
                                        border: `1px solid ${C.border}`,
                                        overflow: 'hidden'
                                    }}>
                                        {/* List header */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '10px 16px',
                                            borderBottom: `1px solid ${C.border}`,
                                            fontSize: 11, fontWeight: 600, color: C.textSec,
                                            textTransform: 'uppercase', letterSpacing: '0.05em'
                                        }}>
                                            <div style={{ width: 36, textAlign: 'center' }}>Rank</div>
                                            <div style={{ width: 40 }} />
                                            <div style={{ flex: 1 }}>Player</div>
                                            <div style={{ width: 60, textAlign: 'right' }}>
                                                {activeTab === 'overall' ? 'Score' : 'Count'}
                                            </div>
                                        </div>

                                        {/* Leader rows */}
                                        {leaders.map((leader, i) => (
                                            <div key={leader.user?.id || i}>
                                                <LeaderRow
                                                    leader={leader}
                                                    type={activeTab}
                                                    index={i}
                                                />
                                                {activeTab === 'overall' && leader.rank <= 10 && (
                                                    <div style={{ padding: '0 16px 8px 100px' }}>
                                                        <ScoreBreakdown leader={leader} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Legend for overall */}
                                    {activeTab === 'overall' && leaders.length > 0 && (
                                        <div style={{
                                            display: 'flex', justifyContent: 'center', gap: 16,
                                            marginTop: 16, fontSize: 12, color: C.textSec
                                        }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: 2, background: C.blue, display: 'inline-block' }} />
                                                Check-ins (x2)
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: 2, background: C.green, display: 'inline-block' }} />
                                                Reviews (x3)
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: 2, background: C.purple, display: 'inline-block' }} />
                                                Posts (x1)
                                            </span>
                                        </div>
                                    )}

                                    {/* Total players */}
                                    <div style={{
                                        textAlign: 'center', fontSize: 13, color: C.textSec,
                                        marginTop: 16, paddingBottom: 16
                                    }}>
                                        Showing {leaders.length} player{leaders.length !== 1 ? 's' : ''}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </PageTransition>

            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .tab-label {
                    display: inline;
                }
                @media (max-width: 480px) {
                    .tab-label {
                        display: none;
                    }
                }
            `}</style>
        </>
    );
}
