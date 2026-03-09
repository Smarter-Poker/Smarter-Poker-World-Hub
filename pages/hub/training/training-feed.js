/**
 * TRAINING ACTIVITY FEED — Social Training Updates
 * ═══════════════════════════════════════════════════════════════════════════
 * Social feed showing what friends are training. See achievements,
 * session completions, and streak milestones from your network.
 *
 * Route: /hub/training/training-feed
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// FEED EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

const EVENT_TYPES = {
    session: { icon: '🎯', color: '#3b82f6', label: 'Training' },
    streak: { icon: '🔥', color: '#f97316', label: 'Streak' },
    achievement: { icon: '🏆', color: '#fbbf24', label: 'Badge' },
    mastery: { icon: '⭐', color: '#a855f7', label: 'Mastery' },
    leaderboard: { icon: '📊', color: '#22c55e', label: 'Rank Up' },
};

// ═══════════════════════════════════════════════════════════════════════════
// FEED ENGINE (real user data + simulated community activity)
// ═══════════════════════════════════════════════════════════════════════════

// Simple seed-based pseudo-random to avoid Math.random() flicker on re-renders
function seededRandom(seed) {
    const x = Math.sin(seed * 9301 + 49297) * 49241;
    return x - Math.floor(x);
}

const FRIEND_NAMES = [
    'PokerPro_Mike', 'AceHunter99', 'GTO_Sarah', 'Riverbluff_Dan',
    'ChipStack_King', 'FlushDraw_Amy', 'NittyGritty', 'RangeWizard',
];

const GAME_NAMES = [
    'BB Defense', 'BTN Opens', 'C-Bet Mastery', 'River Bluffs',
    '3-Bet Pots', 'MTT Push/Fold', 'Turn Barrels', 'SB Strategy',
    'Position Mastery', 'Pot Geometry', 'ICM Decisions', 'Bluff Catching',
];

function generateFeedItems(userSessions) {
    const items = [];
    const now = Date.now();

    // Add user's own recent sessions
    if (userSessions && userSessions.length > 0) {
        userSessions.slice(0, 3).forEach((s, i) => {
            items.push({
                id: `user-${i}`,
                type: 'session',
                user: 'You',
                isYou: true,
                game: s.game_id?.replace(/-/g, ' ')?.replace(/\b\w/g, l => l.toUpperCase()) || 'GTO Training',
                accuracy: s.accuracy || Math.round((s.correct_count / Math.max(s.hands_played, 1)) * 100) || 0,
                handsPlayed: s.hands_played || s.total_questions || 0,
                timestamp: new Date(s.created_at).getTime(),
                avatarColor: '#00d4ff',
            });
        });
    }

    // Generate simulated community activity (seeded for deterministic renders)
    const daySeed = Math.floor(now / 86400000); // changes once per day
    for (let i = 0; i < 12; i++) {
        const friendName = FRIEND_NAMES[i % FRIEND_NAMES.length];
        const minutesAgo = Math.floor(seededRandom(daySeed + i) * 1440) + 5;
        const type = i < 6 ? 'session' : i < 9 ? 'streak' : i < 11 ? 'achievement' : 'mastery';

        const item = {
            id: `community-${i}`,
            type,
            user: friendName,
            isYou: false,
            simulated: true,
            timestamp: now - (minutesAgo * 60000),
            avatarColor: `hsl(${(i * 47) % 360}, 60%, 55%)`,
        };

        if (type === 'session') {
            item.game = GAME_NAMES[i % GAME_NAMES.length];
            item.accuracy = Math.floor(seededRandom(daySeed + i + 100) * 30) + 65;
            item.handsPlayed = Math.floor(seededRandom(daySeed + i + 200) * 20) + 10;
        } else if (type === 'streak') {
            item.streakDays = Math.floor(seededRandom(daySeed + i + 300) * 25) + 3;
        } else if (type === 'achievement') {
            item.badge = ['First Blood', 'Streak Master', 'GTO Expert', 'Iron Will', 'Diamond Grinder'][i % 5];
        } else if (type === 'mastery') {
            item.game = GAME_NAMES[i % GAME_NAMES.length];
            item.level = Math.floor(seededRandom(daySeed + i + 400) * 3) + 1;
        }

        items.push(item);
    }

    // Sort by timestamp (newest first)
    return items.sort((a, b) => b.timestamp - a.timestamp);
}

function formatTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED ITEM COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function FeedItem({ item, onChallenge }) {
    const eventType = EVENT_TYPES[item.type] || EVENT_TYPES.session;

    function renderContent() {
        switch (item.type) {
            case 'session':
                return (
                    <>
                        <span style={{ fontWeight: 700, color: item.isYou ? '#00d4ff' : '#e2e8f0' }}>
                            {item.user}
                        </span>
                        {' completed a '}
                        <span style={{ fontWeight: 700, color: eventType.color }}>
                            {item.handsPlayed}-hand
                        </span>
                        {' session on '}
                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                            {item.game}
                        </span>
                        {' — '}
                        <span style={{
                            fontWeight: 800,
                            color: item.accuracy >= 80 ? '#4ade80'
                                : item.accuracy >= 65 ? '#fbbf24' : '#f87171',
                        }}>
                            {item.accuracy}%
                        </span>
                        {' accuracy'}
                    </>
                );
            case 'streak':
                return (
                    <>
                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                            {item.user}
                        </span>
                        {' hit a '}
                        <span style={{ fontWeight: 800, color: '#f97316' }}>
                            {item.streakDays}-day streak
                        </span>
                        {' milestone!'}
                    </>
                );
            case 'achievement':
                return (
                    <>
                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                            {item.user}
                        </span>
                        {' unlocked the '}
                        <span style={{ fontWeight: 800, color: '#fbbf24' }}>
                            {item.badge}
                        </span>
                        {' badge'}
                    </>
                );
            case 'mastery':
                return (
                    <>
                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                            {item.user}
                        </span>
                        {' mastered Level '}
                        <span style={{ fontWeight: 800, color: '#a855f7' }}>
                            {item.level}
                        </span>
                        {' of '}
                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                            {item.game}
                        </span>
                    </>
                );
            default:
                return null;
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                padding: '14px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', gap: 12,
            }}
        >
            {/* Avatar */}
            <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, ${item.avatarColor}, ${item.avatarColor}88)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800, color: '#fff',
            }}>
                {item.isYou ? '👤' : item.user.charAt(0)}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 6 }}>
                    {renderContent()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: `${eventType.color}12`,
                        border: `1px solid ${eventType.color}22`,
                        color: eventType.color, fontSize: 9, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                        {eventType.icon} {eventType.label}
                    </span>
                    {item.simulated && (
                        <span style={{
                            padding: '1px 5px', borderRadius: 3,
                            background: 'rgba(100,116,139,0.1)',
                            border: '1px solid rgba(100,116,139,0.15)',
                            color: '#475569', fontSize: 8, fontWeight: 600,
                            letterSpacing: 0.3,
                        }}>
                            COMMUNITY
                        </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569' }}>
                        {formatTimeAgo(item.timestamp)}
                    </span>
                    {!item.isYou && item.type === 'session' && (
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onChallenge(item.user)}
                            style={{
                                marginLeft: 'auto',
                                padding: '3px 10px', borderRadius: 6,
                                border: '1px solid rgba(168,85,247,0.2)',
                                background: 'rgba(168,85,247,0.06)',
                                color: '#a855f7', fontSize: 9, fontWeight: 700,
                                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5,
                            }}
                        >
                            Challenge
                        </motion.button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TrainingFeedPage() {
    const router = useRouter();
    useTrainingBus('training-feed');
    const [loading, setLoading] = useState(true);
    const [feedItems, setFeedItems] = useState([]);
    const [filter, setFilter] = useState('all');

    const fetchFeed = useCallback(async () => {
        const user = getAuthUser();
        try {
            if (user?.id) {
                const token = getAccessToken();
                const res = await fetch(`/api/training/get-sessions?limit=50`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const data = await res.json();
                if (data.success) {
                    const items = generateFeedItems(data.sessions || []);
                    setFeedItems(items);
                }
            } else {
                setFeedItems(generateFeedItems([]));
            }
        } catch (e) {
            setFeedItems(generateFeedItems([]));
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchFeed(); }, [fetchFeed]);

    // Bus listeners — refresh feed when a training session completes
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => fetchFeed());
        const onSessionComplete = () => fetchFeed();
        window.addEventListener('training:session-complete', onSessionComplete);
        return () => {
            unsub();
            window.removeEventListener('training:session-complete', onSessionComplete);
        };
    }, [fetchFeed]);

    const handleChallenge = (username) => {
        router.push('/hub/training/pvp-lobby');
    };

    const filteredItems = filter === 'all'
        ? feedItems
        : feedItems.filter(item => item.type === filter);

    const FILTER_OPTIONS = [
        { id: 'all', label: 'All' },
        { id: 'session', label: 'Sessions' },
        { id: 'streak', label: 'Streaks' },
        { id: 'achievement', label: 'Badges' },
    ];

    return (
        <>
            <Head>
                <title>Training Feed | Smarter.Poker GTO Training</title>
            </Head>
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'rgba(255,255,255,0.05)', border: 'none',
                            color: '#94a3b8', fontSize: 18, cursor: 'pointer',
                            width: 36, height: 36, borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        ←
                    </button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                            Training Feed
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                            See what your network is training
                        </div>
                    </div>
                </div>

                {/* Filter tabs */}
                <div style={{
                    display: 'flex', gap: 4, padding: '10px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: 'rgba(0,0,0,0.15)',
                }}>
                    {FILTER_OPTIONS.map(f => (
                        <motion.button
                            key={f.id}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setFilter(f.id)}
                            style={{
                                flex: 1, padding: '7px', borderRadius: 6,
                                border: `1px solid ${filter === f.id ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                                background: filter === f.id ? 'rgba(0,212,255,0.06)' : 'transparent',
                                color: filter === f.id ? '#00d4ff' : '#64748b',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            {f.label}
                        </motion.button>
                    ))}
                </div>

                <div style={{ maxWidth: 600, margin: '0 auto' }}>
                    {/* Loading */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    width: 32, height: 32, margin: '0 auto 12px',
                                    border: '2px solid rgba(255,255,255,0.05)',
                                    borderTopColor: '#00d4ff', borderRadius: '50%',
                                }}
                            />
                            Loading feed...
                        </div>
                    )}

                    {/* Feed Items */}
                    {!loading && filteredItems.map(item => (
                        <FeedItem
                            key={item.id}
                            item={item}
                            onChallenge={handleChallenge}
                        />
                    ))}

                    {/* Empty state */}
                    {!loading && filteredItems.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>No activity yet</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>
                                Complete some training sessions to see activity here
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div style={{
                        textAlign: 'center', padding: '20px 16px',
                        fontSize: 10, color: '#334155',
                    }}>
                        Feed updates automatically when you or friends complete sessions
                    </div>
                </div>
            </div>
        </>
    );
}
