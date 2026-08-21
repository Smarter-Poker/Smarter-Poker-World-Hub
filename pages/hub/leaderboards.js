/**
 * POKER LEADERBOARDS PAGE
 * Rankings by check-ins, reviews, activity, and overall engagement.
 * Route: /hub/leaderboards
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import PageTransition from '../../src/components/transitions/PageTransition';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';

import BottomNavBar from '../../src/components/ui/BottomNavBar';
// 2026-05-07 — UI-UX-Pro-Max icons (Lucide for tab icons + states)
import { Trophy, MapPin, Star, Activity, AlertTriangle } from 'lucide-react';

const darkShimmerKeyframes = `
@keyframes dark-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`;

function DarkShimmerBlock({ width = '100%', height = 16, radius = 4, style = {} }) {
    return (
        <div style={{
            background: 'linear-gradient(90deg, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%)',
            backgroundSize: '800px 100%',
            animation: 'dark-shimmer 1.5s infinite linear',
            borderRadius: radius,
            width,
            height,
            ...style
        }} />
    );
}
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
    { key: 'overall',  label: 'Overall',   Icon: Trophy   },
    { key: 'checkins', label: 'Check-ins', Icon: MapPin   },
    { key: 'reviews',  label: 'Reviews',   Icon: Star     },
    { key: 'activity', label: 'Activity',  Icon: Activity },
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
            <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                <Image
                    src={src}
                    alt={name || 'Player'}
                    fill
                    sizes={`${size}px`}
                    style={{ objectFit: 'cover' }}
                    priority={size >= 50}
                />
            </div>
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
    const [menuOpen, setMenuOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    
    useEffect(() => {
        const user = getAuthUser();
        if (user) setCurrentUser(user);
    }, []);
    const { filters, setFilter } = usePersistedFilters('leaderboards', { activeTab: 'overall', period: 'all' });
    const activeTab = filters.activeTab;
    const period = filters.period;
    const setActiveTab = (v) => setFilter('activeTab', v);
    const setPeriod = (v) => setFilter('period', v);

    const menuConfig = getMenuConfig('leaderboards', null, {}, {});

    // Connect to global telemetry bus
    useTrainingBus('leaderboards');

    // SWR-backed fetch — cached 60s, instant on tab switch
    const swrKey = `/api/poker/leaderboards?type=${activeTab}&period=${period}&limit=50`;
    const { data: swrData, error, isLoading: loading, mutate: refreshLeaderboards } = useSWR(swrKey, (url) =>
        fetch(url).then(r => { if (!r.ok) throw new Error('Failed to load leaderboards'); return r.json(); }),
        { refreshInterval: 60000 }
    );
    const leaders = swrData?.leaders || [];



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
            <SEOHead
                title="Poker Leaderboards — Global Rankings"
                description="See Who Tops The Charts Across All Smarter.Poker Games. Global Rankings For Training, Trivia, Memory Games, And More."
                canonical="/hub/leaderboards"
            />

            <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="right"
                theme="dark"
                menuItems={menuConfig.menuItems}
                bottomLinks={menuConfig.bottomLinks}
            />

            <PageTransition>
                <div style={{
                    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: C.bg,
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
                                    <tab.Icon size={16} aria-hidden />
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
                                                <DarkShimmerBlock width={36} height={36} radius={18}  />
                                                <DarkShimmerBlock width={40} height={40} radius={20}  />
                                                <div style={{ flex: 1 }}>
                                                    <DarkShimmerBlock width="60%" height={14} style={{ marginBottom: 6, background: '#252525' }} />
                                                    <DarkShimmerBlock width="30%" height={10}  />
                                                </div>
                                                <DarkShimmerBlock width={50} height={20} radius={4}  />
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
                                    <AlertTriangle size={48} aria-hidden style={{ color: C.red, marginBottom: 12 }} strokeWidth={1.5} />
                                    <p style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
                                        Failed to load leaderboards
                                    </p>
                                    <p style={{ color: C.textSec, fontSize: 14, margin: '0 0 16px' }}>{error}</p>
                                    <button
                                        onClick={refreshLeaderboards}
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
                                    <Trophy size={64} aria-hidden style={{ color: C.textSec, marginBottom: 16, opacity: 0.5 }} strokeWidth={1} />
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
                
                {/* Sticky My Rank Dashboard */}
                {currentUser && (
                    <div style={{
                        position: 'fixed', bottom: 70, left: 0, right: 0,
                        background: 'rgba(26,26,26,0.95)', backdropFilter: 'blur(10px)',
                        borderTop: `1px solid ${C.border}`,
                        padding: '12px 16px', zIndex: 40,
                        display: 'flex', justifyContent: 'center'
                    }}>
                        <div style={{
                            width: '100%', maxWidth: 680, display: 'flex', alignItems: 'center', gap: 12
                        }}>
                            {leaders.find(l => l.user?.id === currentUser.id) ? (() => {
                                const myEntry = leaders.find(l => l.user?.id === currentUser.id);
                                const rankInfo = getRankDisplay(myEntry.rank);
                                return (
                                    <>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: myEntry.rank <= 3 ? 14 : 13,
                                            fontWeight: myEntry.rank <= 3 ? 800 : 600,
                                            color: myEntry.rank <= 3 ? (myEntry.rank <= 2 ? '#000' : '#fff') : C.textSec,
                                            background: myEntry.rank <= 3 ? rankInfo.bg : C.border + '40',
                                            boxShadow: rankInfo.shadow,
                                            flexShrink: 0
                                        }}>
                                            {myEntry.rank}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, color: C.textSec }}>Your Rank</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>You are in the Top 50!</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: C.gold }}>
                                                {activeTab === 'overall' ? (myEntry.score || 0).toLocaleString() : (myEntry.count || 0).toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: 11, color: C.textSec }}>
                                                {activeTab === 'overall' ? 'pts' : myEntry.metric || activeTab}
                                            </div>
                                        </div>
                                    </>
                                );
                            })() : (
                                <>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 18, color: C.textSec, background: C.border + '40'
                                    }}>
                                        -
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, color: C.textSec }}>Your Rank</div>
                                        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Unranked</div>
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: 12, color: C.textSec, maxWidth: 120 }}>
                                        Check in or post to earn a spot!
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
                  <BottomNavBar />
    </PageTransition>

            <style dangerouslySetInnerHTML={{ __html: darkShimmerKeyframes }} />
            <style>{`
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
