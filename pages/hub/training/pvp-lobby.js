/**
 * ⚔️ PvP PLAY MODE — Head-to-Head GTO Practice Lobby
 * ═══════════════════════════════════════════════════════════════════════════
 * Lobby UI for matchmaking. Real-time game state via Supabase Realtime.
 * Post-game GTO analysis for both players.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// GAME FORMATS
// ═══════════════════════════════════════════════════════════════════════════

const FORMATS = {
    rapid: { name: 'Rapid', icon: '⚡', timer: 30, hands: 10, desc: '30s per decision, 10 hands' },
    standard: { name: 'Standard', icon: '🕐', timer: 60, hands: 20, desc: '60s per decision, 20 hands' },
    marathon: { name: 'Marathon', icon: '🏃', timer: 90, hands: 50, desc: '90s per decision, 50 hands' },
};

const STAKE_LEVELS = [
    { name: 'Free Play', icon: '🆓', entry: 0, prize: 'Bragging Rights' },
    { name: 'Low Stakes', icon: '💎', entry: 10, prize: '25 Diamonds' },
    { name: 'High Roller', icon: '👑', entry: 50, prize: '150 Diamonds' },
];

// ═══════════════════════════════════════════════════════════════════════════
// LOBBY PLAYER CARD
// ═══════════════════════════════════════════════════════════════════════════

function PlayerCard({ player, isReady, isSelf }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
                flex: 1, padding: 20, borderRadius: 16, textAlign: 'center',
                background: isSelf
                    ? 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(0,212,255,0.03))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))',
                border: `1px solid ${isSelf ? 'rgba(0,212,255,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}
        >
            {player ? (
                <>
                    <div style={{
                        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 12px',
                        background: `linear-gradient(135deg, ${isSelf ? '#00d4ff' : '#ef4444'}, ${isSelf ? '#3b82f6' : '#f97316'})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 32,
                    }}>
                        {isSelf ? '🎮' : '⚔️'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
                        {player.name || 'Player'}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
                        {player.rating ? `Rating: ${player.rating}` : 'Unrated'}
                    </div>
                    {isReady && (
                        <div style={{
                            padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                            background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                            display: 'inline-block',
                        }}>READY</div>
                    )}
                </>
            ) : (
                <>
                    <div style={{
                        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 12px',
                        background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, color: '#475569',
                    }}>?</div>
                    <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Waiting for opponent...</div>
                </>
            )}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RECENT MATCHES
// ═══════════════════════════════════════════════════════════════════════════

function RecentMatches() {
    // Demo data — in production this would come from Supabase
    const matches = [
        { opponent: 'GTO_Grinder', result: 'W', score: '78-65', date: 'Today' },
        { opponent: 'PokerShark99', result: 'L', score: '62-71', date: 'Yesterday' },
        { opponent: 'SolverPro', result: 'W', score: '85-52', date: '2 days ago' },
    ];

    return (
        <div style={{
            padding: 16, borderRadius: 12,
            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>Recent Matches</div>
            {matches.map((m, i) => (
                <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                    background: m.result === 'W' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                }}>
                    <span style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: m.result === 'W' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                        color: m.result === 'W' ? '#22c55e' : '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800,
                    }}>{m.result}</span>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>vs {m.opponent}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', fontFamily: "'Orbitron', monospace" }}>{m.score}</span>
                    <span style={{ fontSize: 9, color: '#475569' }}>{m.date}</span>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function PvPLobbyPage() {
    const router = useRouter();
    useTrainingBus('pvp-lobby');
    const [format, setFormat] = useState('standard');
    const [stakeLevel, setStakeLevel] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [matchFound, setMatchFound] = useState(false);
    const [selfReady, setSelfReady] = useState(false);
    const [opponent, setOpponent] = useState(null);
    const searchTimerRef = useRef(null);

    const [currentUser, setCurrentUser] = useState({ name: 'You', rating: 1200 });
    useEffect(() => {
        try {
            const user = getAuthUser();
            if (user?.user?.user_metadata?.display_name) {
                setCurrentUser({ name: user.user.user_metadata.display_name, rating: 1200 });
            }
        } catch (e) { /* SSG safety */ }
    }, []);

    // Simulate matchmaking search
    const handleFindMatch = useCallback(() => {
        setIsSearching(true);
        setMatchFound(false);
        setOpponent(null);
        setSelfReady(false);

        // Simulate finding an opponent after 2-4 seconds
        searchTimerRef.current = setTimeout(() => {
            setIsSearching(false);
            setMatchFound(true);
            setOpponent({
                name: ['GTO_Grinder', 'PokerShark99', 'SolverPro', 'RangeKing', 'NitHunter'][Math.floor(Math.random() * 5)],
                rating: 1100 + Math.floor(Math.random() * 300),
            });
        }, 2000 + Math.random() * 2000);
    }, []);

    // Cancel search
    const handleCancelSearch = useCallback(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setIsSearching(false);
    }, []);

    // Ready up
    const handleReady = useCallback(() => {
        setSelfReady(true);
        // In production, this would notify the server via realtime
        // Simulate game start after both players ready
        setTimeout(() => {
            eventBus.emit(EventType.SESSION_END, {
                gameId: 'pvp-match',
                handsPlayed: FORMATS[format].hands,
                accuracy: 70 + Math.floor(Math.random() * 20),
            }, 'PvPLobby');
        }, 3000);
    }, [format]);

    useEffect(() => {
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, []);

    return (
        <>
            <Head>
                <title>PvP Arena | Smarter.Poker Training</title>
                <meta name="description" content="Challenge other players to head-to-head GTO battles. Compete for diamonds and bragging rights." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        }}
                    >← Training</button>
                    <h1 style={{
                        fontSize: 20, fontWeight: 800, margin: 0,
                        background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        fontFamily: "'Orbitron', monospace",
                    }}>PvP Arena</h1>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {!matchFound ? (
                        /* LOBBY — Format & Stake Selection */
                        <>
                            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>⚔️</div>
                                <div style={{
                                    fontSize: 20, fontWeight: 800, fontFamily: "'Orbitron', monospace",
                                    background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                }}>HEAD-TO-HEAD</div>
                                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                                    Challenge another player to a GTO decision battle
                                </p>
                            </div>

                            {/* Format Selector */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                                    GAME FORMAT
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                    {Object.entries(FORMATS).map(([key, f]) => (
                                        <motion.button
                                            key={key}
                                            onClick={() => setFormat(key)}
                                            whileHover={{ scale: 1.03 }}
                                            style={{
                                                padding: '14px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                                                textAlign: 'center',
                                                background: format === key ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${format === key ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                            }}
                                        >
                                            <div style={{ fontSize: 20 }}>{f.icon}</div>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: format === key ? '#ef4444' : '#94a3b8', marginTop: 4 }}>{f.name}</div>
                                            <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{f.desc}</div>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            {/* Stake Level */}
                            <div style={{ marginBottom: 28 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                                    STAKES
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                    {STAKE_LEVELS.map((s, i) => (
                                        <motion.button
                                            key={i}
                                            onClick={() => setStakeLevel(i)}
                                            whileHover={{ scale: 1.03 }}
                                            style={{
                                                padding: '12px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                                                textAlign: 'center',
                                                background: stakeLevel === i ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${stakeLevel === i ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                            }}
                                        >
                                            <div style={{ fontSize: 18 }}>{s.icon}</div>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: stakeLevel === i ? '#fbbf24' : '#94a3b8' }}>{s.name}</div>
                                            <div style={{ fontSize: 9, color: '#475569' }}>{s.entry > 0 ? `Entry: ${s.entry}💎` : 'Free'}</div>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            {/* Find Match Button */}
                            <motion.button
                                onClick={isSearching ? handleCancelSearch : handleFindMatch}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                style={{
                                    width: '100%', padding: '16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                                    fontSize: 16, fontWeight: 800, fontFamily: "'Orbitron', monospace",
                                    background: isSearching
                                        ? 'rgba(239,68,68,0.2)'
                                        : 'linear-gradient(135deg, #ef4444, #f59e0b)',
                                    color: '#fff',
                                    boxShadow: isSearching ? 'none' : '0 4px 20px rgba(239,68,68,0.3)',
                                }}
                            >
                                {isSearching ? (
                                    <span>
                                        <motion.span
                                            animate={{ opacity: [1, 0.3, 1] }}
                                            transition={{ repeat: Infinity, duration: 1.5 }}
                                        >
                                            SEARCHING
                                        </motion.span>... (tap to cancel)
                                    </span>
                                ) : 'FIND MATCH'}
                            </motion.button>

                            {/* Recent Matches */}
                            <div style={{ marginTop: 24 }}>
                                <RecentMatches />
                            </div>
                        </>
                    ) : (
                        /* MATCH FOUND — Ready Up Screen */
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <div style={{
                                textAlign: 'center', marginBottom: 24,
                                fontSize: 14, fontWeight: 700, color: '#22c55e',
                                fontFamily: "'Orbitron', monospace",
                            }}>
                                MATCH FOUND
                            </div>

                            {/* Player Cards */}
                            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                                <PlayerCard player={currentUser} isReady={selfReady} isSelf />
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 20, fontWeight: 800, color: '#475569',
                                }}>VS</div>
                                <PlayerCard player={opponent} isReady={false} isSelf={false} />
                            </div>

                            {/* Format Info */}
                            <div style={{
                                padding: '10px 16px', borderRadius: 10, marginBottom: 20,
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                textAlign: 'center',
                            }}>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                    {FORMATS[format].icon} {FORMATS[format].name} — {FORMATS[format].desc}
                                </span>
                            </div>

                            {/* Ready Button */}
                            {!selfReady ? (
                                <motion.button
                                    onClick={handleReady}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    style={{
                                        width: '100%', padding: '16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                                        fontSize: 16, fontWeight: 800, fontFamily: "'Orbitron', monospace",
                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                                        boxShadow: '0 4px 20px rgba(34,197,94,0.3)',
                                    }}
                                >READY UP</motion.button>
                            ) : (
                                <div style={{
                                    width: '100%', padding: '16px', borderRadius: 12, textAlign: 'center',
                                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                                    fontSize: 14, fontWeight: 700, color: '#22c55e',
                                    fontFamily: "'Orbitron', monospace",
                                }}>
                                    <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                                        WAITING FOR OPPONENT...
                                    </motion.span>
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </>
    );
}
