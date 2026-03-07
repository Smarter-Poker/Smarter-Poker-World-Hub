/**
 * 🔍 SOLUTIONS BROWSER — GTO Wizard-Style Solver Strategy Browser
 * ═══════════════════════════════════════════════════════════════════════════
 * Browse pre-solved GTO solutions from the PIO solver database.
 * Select game format, stack depth, and position to view optimal strategies.
 * Click any spot to see the full 13×13 range grid with action frequencies.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import RangeGrid from '../../../src/components/training/RangeGrid';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const GAME_TYPES = [
    { value: 'hu_cash', label: 'Cash HU', icon: '💰', description: 'Heads-Up Cash Game' },
    { value: 'postflop_complete', label: 'Cash 6-Max', icon: '🎰', description: '6-Max Postflop' },
    { value: 'mtt_6max_icm', label: 'MTT ICM', icon: '🏆', description: 'MTT 6-Max ICM' },
    { value: 'mtt_6max_chipev', label: 'MTT ChipEV', icon: '📊', description: 'MTT ChipEV' },
    { value: 'turn_spin', label: 'Spins', icon: '🎯', description: 'Spin & Go' },
];

const STACK_DEPTHS = {
    'hu_cash': [20, 40, 60, 80, 100, 200],
    'postflop_complete': [100],
    'mtt_6max_icm': [10, 20, 40, 60, 80, 100],
    'mtt_6max_chipev': [10, 20, 40, 80, 100],
    'turn_spin': [10, 20, 40, 60],
};

const POSITIONS = ['BTN', 'SB', 'BB', 'CO', 'HJ', 'MP', 'UTG'];

// ═══════════════════════════════════════════════════════════════════════════
// BOARD CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CardDisplay({ card, size = 36 }) {
    if (!card) return null;
    const rank = card[0] === 'T' ? '10' : card[0].toUpperCase();
    const suit = card[1];
    const suitSymbol = { s: '♠', h: '♥', d: '♦', c: '♣' }[suit] || '?';
    const suitColor = { s: '#e2e8f0', h: '#ef4444', d: '#3b82f6', c: '#22c55e' }[suit] || '#fff';

    return (
        <div style={{
            width: size, height: size * 1.4,
            background: 'linear-gradient(145deg, #fff 0%, #e2e8f0 100%)',
            borderRadius: 4, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            fontWeight: 800, lineHeight: 1,
        }}>
            <span style={{ fontSize: size * 0.4, color: suitColor }}>{rank}</span>
            <span style={{ fontSize: size * 0.35, color: suitColor }}>{suitSymbol}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SPOT LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════

function SpotCard({ spot, isSelected, onClick }) {
    return (
        <motion.div
            layout
            onClick={onClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
                padding: '10px 14px',
                background: isSelected
                    ? 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))'
                    : 'rgba(255,255,255,0.03)',
                border: isSelected ? '1px solid rgba(0,212,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all 0.2s ease',
            }}
        >
            {/* Board Cards */}
            <div style={{ display: 'flex', gap: 2 }}>
                {(spot.board || []).map((card, i) => (
                    <CardDisplay key={i} card={card} size={22} />
                ))}
            </div>
            {/* Info */}
            <div style={{ flex: 1 }}>
                <div style={{
                    fontSize: 12, fontWeight: 700, color: isSelected ? '#00d4ff' : '#e2e8f0',
                    fontFamily: "'Inter', sans-serif",
                }}>
                    {spot.heroPosition} • {spot.board?.join(' ') || 'Preflop'}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {spot.stackDepth}BB • {spot.gameType}
                </div>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function SolutionsBrowser() {
    const router = useRouter();

    // Filters
    const [gameType, setGameType] = useState('hu_cash');
    const [stackDepth, setStackDepth] = useState(100);
    const [position, setPosition] = useState('');
    const [page, setPage] = useState(1);

    // Data
    const [spots, setSpots] = useState([]);
    const [totalSpots, setTotalSpots] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(false);

    // Selected spot detail
    const [selectedSpot, setSelectedSpot] = useState(null);
    const [spotDetail, setSpotDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Available stack depths for current game type
    const availableStacks = useMemo(() => STACK_DEPTHS[gameType] || [100], [gameType]);

    // Reset stack depth when game type changes
    useEffect(() => {
        const stacks = STACK_DEPTHS[gameType] || [100];
        if (!stacks.includes(stackDepth)) {
            setStackDepth(stacks[stacks.length - 1]); // Default to deepest
        }
        setPage(1);
        setSelectedSpot(null);
        setSpotDetail(null);
    }, [gameType]);

    // Fetch spots list
    const fetchSpots = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                gameType,
                stackDepth: stackDepth.toString(),
                page: page.toString(),
                limit: '30',
            });
            if (position) params.set('position', position);

            const res = await fetch(`/api/training/browse-solutions?${params}`);
            const data = await res.json();

            if (data.success) {
                setSpots(data.spots || []);
                setTotalSpots(data.total || 0);
                setTotalPages(data.totalPages || 0);
            }
        } catch (err) {
            console.error('[Solutions] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [gameType, stackDepth, position, page]);

    useEffect(() => {
        fetchSpots();
    }, [fetchSpots]);

    // Fetch full spot detail (with 13×13 grid)
    const loadSpotDetail = useCallback(async (spotId) => {
        setLoadingDetail(true);
        setSelectedSpot(spotId);
        try {
            const res = await fetch(`/api/training/browse-solutions?spotId=${spotId}`);
            const data = await res.json();
            if (data.success && data.spot) {
                setSpotDetail(data.spot);
            }
        } catch (err) {
            console.error('[Solutions] Detail fetch error:', err);
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    return (
        <>
            <Head>
                <title>GTO Solutions Browser | Smarter.Poker Training</title>
                <meta name="description" content="Browse pre-solved GTO strategies for every poker spot. View optimal action frequencies for all 1326 hand combos." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <button
                            onClick={() => router.push('/hub/training')}
                            style={{
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            }}
                        >
                            ← Training
                        </button>
                        <h1 style={{
                            fontSize: 22, fontWeight: 800, margin: 0,
                            background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            GTO Solutions
                        </h1>
                        <span style={{
                            fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.04)',
                            padding: '3px 8px', borderRadius: 12, fontWeight: 600,
                        }}>
                            {totalSpots.toLocaleString()} spots
                        </span>
                    </div>

                    {/* Filters Row */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {/* Game Type Pills */}
                        {GAME_TYPES.map(gt => (
                            <button
                                key={gt.value}
                                onClick={() => setGameType(gt.value)}
                                style={{
                                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                    cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                                    background: gameType === gt.value
                                        ? 'linear-gradient(135deg, #00d4ff, #7c3aed)'
                                        : 'rgba(255,255,255,0.06)',
                                    color: gameType === gt.value ? '#fff' : '#94a3b8',
                                }}
                            >
                                {gt.icon} {gt.label}
                            </button>
                        ))}
                    </div>

                    {/* Stack Depth + Position Row */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                                Stack:
                            </span>
                            {availableStacks.map(sd => (
                                <button
                                    key={sd}
                                    onClick={() => { setStackDepth(sd); setPage(1); }}
                                    style={{
                                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                        background: stackDepth === sd ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                                        color: stackDepth === sd ? '#00d4ff' : '#64748b',
                                        fontFamily: "'Orbitron', monospace",
                                    }}
                                >
                                    {sd}BB
                                </button>
                            ))}
                        </div>

                        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                                Position:
                            </span>
                            <button
                                onClick={() => { setPosition(''); setPage(1); }}
                                style={{
                                    padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                    cursor: 'pointer', border: 'none',
                                    background: !position ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                                    color: !position ? '#00d4ff' : '#64748b',
                                }}
                            >
                                ALL
                            </button>
                            {POSITIONS.map(p => (
                                <button
                                    key={p}
                                    onClick={() => { setPosition(p); setPage(1); }}
                                    style={{
                                        padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        cursor: 'pointer', border: 'none',
                                        background: position === p ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                                        color: position === p ? '#00d4ff' : '#64748b',
                                        fontFamily: "'Orbitron', monospace",
                                    }}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div style={{
                    display: 'flex',
                    minHeight: 'calc(100vh - 160px)',
                }}>
                    {/* Left: Spot List */}
                    <div style={{
                        width: 320, borderRight: '1px solid rgba(255,255,255,0.06)',
                        overflowY: 'auto', padding: 12,
                        display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                        {loading ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{
                                    width: 32, height: 32, border: '3px solid rgba(0,212,255,0.2)',
                                    borderTop: '3px solid #00d4ff', borderRadius: '50%',
                                    animation: 'spin 1s linear infinite', margin: '0 auto',
                                }} />
                                <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>Loading solutions...</p>
                                <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            </div>
                        ) : spots.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <p style={{ color: '#64748b', fontSize: 13 }}>No spots found for this configuration</p>
                                <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>Try a different game type or stack depth</p>
                            </div>
                        ) : (
                            <>
                                {spots.map(spot => (
                                    <SpotCard
                                        key={spot.id}
                                        spot={spot}
                                        isSelected={selectedSpot === spot.id}
                                        onClick={() => loadSpotDetail(spot.id)}
                                    />
                                ))}

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div style={{
                                        display: 'flex', justifyContent: 'center', gap: 8,
                                        padding: '12px 0', marginTop: 4,
                                    }}>
                                        <button
                                            disabled={page <= 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            style={{
                                                padding: '6px 12px', borderRadius: 6, fontSize: 12,
                                                background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                                                border: 'none', cursor: page > 1 ? 'pointer' : 'not-allowed',
                                                opacity: page <= 1 ? 0.4 : 1,
                                            }}
                                        >
                                            ← Prev
                                        </button>
                                        <span style={{
                                            fontSize: 11, color: '#64748b', padding: '6px 8px',
                                            fontFamily: "'Orbitron', monospace",
                                        }}>
                                            {page} / {totalPages}
                                        </span>
                                        <button
                                            disabled={page >= totalPages}
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            style={{
                                                padding: '6px 12px', borderRadius: 6, fontSize: 12,
                                                background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                                                border: 'none', cursor: page < totalPages ? 'pointer' : 'not-allowed',
                                                opacity: page >= totalPages ? 0.4 : 1,
                                            }}
                                        >
                                            Next →
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Right: Range Grid Detail */}
                    <div style={{
                        flex: 1, padding: '24px 32px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        {!spotDetail && !loadingDetail ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', height: '100%', gap: 12,
                                opacity: 0.4,
                            }}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <line x1="3" y1="9" x2="21" y2="9" />
                                    <line x1="9" y1="21" x2="9" y2="9" />
                                </svg>
                                <p style={{ color: '#64748b', fontSize: 14 }}>Select a spot to view the strategy</p>
                                <p style={{ color: '#475569', fontSize: 11 }}>
                                    Click any board in the list to see the full 13×13 range grid
                                </p>
                            </div>
                        ) : loadingDetail ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 80 }}>
                                <div style={{
                                    width: 40, height: 40, border: '3px solid rgba(0,212,255,0.2)',
                                    borderTop: '3px solid #00d4ff', borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                }} />
                                <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading strategy matrix...</p>
                                <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            </div>
                        ) : spotDetail ? (
                            <motion.div
                                key={spotDetail.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ width: '100%', maxWidth: 700 }}
                            >
                                {/* Spot Header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
                                    padding: '16px 20px',
                                    background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(124,58,237,0.05))',
                                    borderRadius: 12,
                                    border: '1px solid rgba(0,212,255,0.15)',
                                }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {(spotDetail.board || []).map((card, i) => (
                                            <CardDisplay key={i} card={card} size={32} />
                                        ))}
                                    </div>
                                    <div>
                                        <div style={{
                                            fontSize: 18, fontWeight: 800, color: '#00d4ff',
                                            fontFamily: "'Orbitron', monospace",
                                        }}>
                                            {spotDetail.heroPosition}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                            {spotDetail.stackDepth}BB {spotDetail.gameType} • {spotDetail.handCount} hands in range
                                        </div>
                                    </div>
                                    <div style={{
                                        marginLeft: 'auto',
                                        display: 'flex', gap: 6,
                                    }}>
                                        {(spotDetail.actions || []).map(a => (
                                            <span key={a} style={{
                                                padding: '3px 10px', borderRadius: 12,
                                                fontSize: 11, fontWeight: 700,
                                                background: 'rgba(255,255,255,0.06)',
                                                color: '#94a3b8',
                                                fontFamily: "'Orbitron', monospace",
                                            }}>
                                                {a}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Range Grid */}
                                <RangeGrid
                                    gridData={spotDetail.gridData}
                                    actions={spotDetail.actions}
                                    cellSize={34}
                                />
                            </motion.div>
                        ) : null}
                    </div>
                </div>
            </div>
        </>
    );
}
