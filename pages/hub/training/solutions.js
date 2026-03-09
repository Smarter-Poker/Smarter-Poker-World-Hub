/**
 * 🔍 SOLUTIONS BROWSER — GTO Wizard-Style Solver Strategy Browser
 * ═══════════════════════════════════════════════════════════════════════════
 * Browse pre-solved GTO solutions from the PIO solver database.
 * Phase 15 Features:
 *   - Game Tree Explorer with Node Breadcrumbs
 *   - Card Selector Modal for Turn/River navigation
 *   - Hand Classification Sidebar (Made Hands / Draws / Air)
 *   - Runout Heatmap (Hot/Cold turn card analysis)
 *   - Range vs Range Equity Matchup bar
 *   - Action/Classification color mode toggle
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import RangeGrid from '../../../src/components/training/RangeGrid';
import CardSelectorModal from '../../../src/components/training/CardSelectorModal';
import RunoutHeatmap from '../../../src/components/training/RunoutHeatmap';
import EquityMatchup from '../../../src/components/training/EquityMatchup';
import RangeReport from '../../../src/components/training/RangeReport';
import SolverLineSummary from '../../../src/components/training/SolverLineSummary';
import { classifyAllHands, groupByClassification } from '../../../src/utils/pokerHandEvaluator';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import usePersistedFilters from '../../../src/hooks/usePersistedFilters';

// Dynamic imports for new Phase 34 components (avoid SSR issues)
const BlockerScorePanel = dynamic(() => import('../../../src/components/training/BlockerScorePanel'), { ssr: false });
const SolverTreeViewer = dynamic(() => import('../../../src/components/training/SolverTreeViewer'), { ssr: false });

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HELPER — Retrieve Bearer token from localStorage
// ═══════════════════════════════════════════════════════════════════════════
function getAuthHeaders() {
    try {
        const stored = typeof window !== 'undefined'
            ? JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')
            : {};
        const token = stored.access_token;
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    } catch {
        return {};
    }
}

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

const ACTION_COLORS = {
    'r': '#ef4444', 'R': '#ef4444',
    'b': '#ef4444', 'B': '#ef4444',
    'c': '#22c55e', 'C': '#22c55e',
    'x': '#3b82f6', 'X': '#3b82f6',
    'f': '#64748b', 'F': '#64748b',
};

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

function SpotCard({ spot, isSelected, onClick, isBookmarked, onToggleBookmark }) {
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
            <div style={{ display: 'flex', gap: 2 }}>
                {(spot.board || []).map((card, i) => (
                    <CardDisplay key={i} card={card} size={22} />
                ))}
            </div>
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
            {/* Bookmark star */}
            <button
                onClick={(e) => { e.stopPropagation(); onToggleBookmark && onToggleBookmark(spot); }}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 16, padding: 2, lineHeight: 1,
                    color: isBookmarked ? '#fbbf24' : '#334155',
                    transition: 'color 0.15s',
                }}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark this spot'}
            >
                {isBookmarked ? '★' : '☆'}
            </button>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════

function ClassificationSidebar({ groups, actions, lockedClassifications, onToggleLock }) {
    if (!groups || groups.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
                width: 240, maxHeight: 500, overflowY: 'auto',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: 12,
            }}
        >
            <div style={{
                fontSize: 11, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: 1,
                marginBottom: 10, fontFamily: "'Orbitron', monospace",
            }}>
                Hand Classes
            </div>

            {groups.map(g => {
                const isLocked = lockedClassifications && lockedClassifications.includes(g.classification);
                return (
                    <div key={g.classification} style={{
                        marginBottom: 10, padding: '8px 10px',
                        background: isLocked ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                        borderRadius: 8,
                        borderLeft: `3px solid ${g.color}`,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                    }}
                        onClick={() => onToggleLock && onToggleLock(g.classification)}
                    >
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 4,
                        }}>
                            <span style={{
                                fontSize: 11, fontWeight: 700, color: g.color,
                            }}>
                                {isLocked ? '✓ ' : ''}{g.label}
                            </span>
                            <span style={{
                                fontSize: 9, color: '#64748b',
                                background: 'rgba(255,255,255,0.04)',
                                padding: '1px 6px', borderRadius: 8,
                            }}>
                                {g.handCount} hands
                            </span>
                        </div>
                        {/* Action Summary */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {Object.entries(g.actionSummary || {})
                                .filter(([_, pct]) => pct > 0)
                                .sort((a, b) => b[1] - a[1])
                                .map(([action, pct]) => (
                                    <span key={action} style={{
                                        fontSize: 9, fontWeight: 600,
                                        color: ACTION_COLORS[action] || '#888',
                                        background: 'rgba(255,255,255,0.04)',
                                        padding: '1px 5px', borderRadius: 4,
                                    }}>
                                        {action.toUpperCase()} {pct}%
                                    </span>
                                ))}
                        </div>
                    </div>
                );
            })}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE BREADCRUMB
// ═══════════════════════════════════════════════════════════════════════════

function NodeBreadcrumb({ treePath, onNavigateBack }) {
    if (!treePath || treePath.length === 0) return null;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 8, marginBottom: 12,
            overflowX: 'auto',
            border: '1px solid rgba(255,255,255,0.06)',
        }}>
            <span style={{
                fontSize: 9, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: 1,
                whiteSpace: 'nowrap',
                fontFamily: "'Orbitron', monospace",
            }}>
                TREE
            </span>
            {treePath.map((node, i) => (
                <React.Fragment key={i}>
                    <span style={{ color: '#475569', fontSize: 12 }}>›</span>
                    <button
                        onClick={() => onNavigateBack(i)}
                        style={{
                            background: i === treePath.length - 1
                                ? 'rgba(0,212,255,0.15)'
                                : 'rgba(255,255,255,0.04)',
                            border: i === treePath.length - 1
                                ? '1px solid rgba(0,212,255,0.3)'
                                : '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 6, padding: '3px 8px',
                            color: i === treePath.length - 1 ? '#00d4ff' : '#94a3b8',
                            cursor: 'pointer', fontSize: 10, fontWeight: 600,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {node.label}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function SolutionsBrowser() {
    useTrainingBus('solutions-browser');
    const router = useRouter();

    const { filters, setFilter } = usePersistedFilters('solutions-browser', {
        gameType: 'hu_cash',
        stackDepth: 100,
        position: '',
        colorMode: 'action'
    });

    const gameType = filters.gameType;
    const stackDepth = Number(filters.stackDepth);
    const position = filters.position;
    const colorMode = filters.colorMode;

    const setGameType = (v) => setFilter('gameType', v);
    const setStackDepth = (v) => setFilter('stackDepth', v);
    const setPosition = (v) => setFilter('position', v);
    const setColorMode = (v) => setFilter('colorMode', v);

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

    // Phase 15: Color mode & classification
    const [classificationData, setClassificationData] = useState(null);
    const [classificationGroups, setClassificationGroups] = useState([]);

    // Phase 15: Game Tree Explorer
    const [treePath, setTreePath] = useState([]);
    const [showCardSelector, setShowCardSelector] = useState(false);

    // Phase 15: Runout Heatmap
    const [activeTab, setActiveTab] = useState('grid'); // 'grid' | 'runout'
    const [runoutData, setRunoutData] = useState({});
    const [loadingRunout, setLoadingRunout] = useState(false);

    // Available stack depths for current game type
    const availableStacks = useMemo(() => STACK_DEPTHS[gameType] || [100], [gameType]);

    // Reset stack depth when game type changes
    useEffect(() => {
        const stacks = STACK_DEPTHS[gameType] || [100];
        if (!stacks.includes(stackDepth)) {
            setStackDepth(stacks[stacks.length - 1]);
        }
        setPage(1);
        setSelectedSpot(null);
        setSpotDetail(null);
        setTreePath([]);
        setClassificationData(null);
        setClassificationGroups([]);
        setRunoutData({});
        setActiveTab('grid');
    }, [gameType]);

    // Phase 16: Range Locking
    const [lockedClassifications, setLockedClassifications] = useState([]);

    // Phase 16: Bookmarks
    const [bookmarkedHashes, setBookmarkedHashes] = useState(new Set());
    const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

    // Fetch bookmarks on mount
    useEffect(() => {
        async function loadBookmarks() {
            try {
                const res = await fetch('/api/training/bookmark-solution', {
                    headers: getAuthHeaders(),
                });
                const data = await res.json();
                if (data.success && data.bookmarks) {
                    setBookmarkedHashes(new Set(data.bookmarks.map(b => b.scenario_hash)));
                }
            } catch (e) {
                console.warn('[Solutions] Bookmarks fetch failed:', e);
            }
        }
        loadBookmarks();

        // Listen for external bookmark updates (e.g. from Sandbox)
        window.addEventListener('pa-data-updated', loadBookmarks);
        return () => window.removeEventListener('pa-data-updated', loadBookmarks);
    }, []);

    // Toggle bookmark
    const toggleBookmark = useCallback(async (spot) => {
        const hash = spot.scenarioHash || spot.scenario_hash;
        if (!hash) return;
        const isBookmarked = bookmarkedHashes.has(hash);
        const action = isBookmarked ? 'delete' : 'save';
        try {
            await fetch('/api/training/bookmark-solution', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ scenarioHash: hash, spotId: spot.id, action }),
            });
            setBookmarkedHashes(prev => {
                const next = new Set(prev);
                if (isBookmarked) next.delete(hash);
                else next.add(hash);
                return next;
            });
            // Broadcast so other pages (like Sandbox) can sync
            eventBus.emit('pa-data-updated', {}, 'SolutionsBrowser');
        } catch (e) {
            console.warn('[Solutions] Bookmark toggle failed:', e);
        }
    }, [bookmarkedHashes]);

    // Toggle range lock
    const toggleClassificationLock = useCallback((classification) => {
        setLockedClassifications(prev => {
            if (prev.includes(classification)) {
                return prev.filter(c => c !== classification);
            }
            return [...prev, classification];
        });
    }, []);

    // Reset locked classifications when spot changes
    useEffect(() => {
        setLockedClassifications([]);
    }, [spotDetail]);

    // Compute classification when spot detail changes
    useEffect(() => {
        if (spotDetail?.board && spotDetail.board.length >= 3) {
            try {
                const classified = classifyAllHands(spotDetail.board);
                setClassificationData(classified);
                const groups = groupByClassification(classified, spotDetail.gridData);
                setClassificationGroups(groups);
            } catch (e) {
                console.error('[Solutions] Classification error:', e);
                setClassificationData(null);
                setClassificationGroups([]);
            }
        } else {
            setClassificationData(null);
            setClassificationGroups([]);
        }
    }, [spotDetail]);

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

            const res = await fetch(`/api/training/browse-solutions?${params}`, {
                headers: getAuthHeaders(),
            });
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
        setActiveTab('grid');
        setRunoutData({});
        try {
            const res = await fetch(`/api/training/browse-solutions?spotId=${spotId}`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success && data.spot) {
                setSpotDetail(data.spot);
                // Initialize tree path with root node
                setTreePath([{
                    label: `${data.spot.heroPosition} • ${data.spot.board?.join(' ')}`,
                    spotDetail: data.spot,
                    spotId,
                }]);
            }
        } catch (err) {
            console.error('[Solutions] Detail fetch error:', err);
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    // Phase 15: Navigate to child node (tree hopping)
    const navigateToChild = useCallback(async (nextCard) => {
        if (!spotDetail?.scenarioHash) return;
        setLoadingDetail(true);
        setShowCardSelector(false);

        try {
            const params = new URLSearchParams({
                scenarioHash: spotDetail.scenarioHash,
                nextCard,
            });
            const res = await fetch(`/api/training/tree-navigate?${params}`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();

            if (data.success && data.childSpot) {
                setSpotDetail(data.childSpot);
                setTreePath(prev => [...prev, {
                    label: `${nextCard.toUpperCase()} → ${data.childSpot.heroPosition}`,
                    spotDetail: data.childSpot,
                    scenarioHash: data.childSpot.scenarioHash,
                }]);
                setActiveTab('grid');
                setRunoutData({});
            } else {
                console.warn('[Solutions] No child node found for', nextCard);
            }
        } catch (err) {
            console.error('[Solutions] Tree navigate error:', err);
        } finally {
            setLoadingDetail(false);
        }
    }, [spotDetail]);

    // Navigate back in tree
    const navigateBack = useCallback((index) => {
        if (index < treePath.length - 1) {
            const node = treePath[index];
            setTreePath(prev => prev.slice(0, index + 1));
            if (node.spotDetail) {
                setSpotDetail(node.spotDetail);
                setActiveTab('grid');
                setRunoutData({});
            }
        }
    }, [treePath]);

    // Phase 15: Fetch runout data
    const fetchRunoutData = useCallback(async () => {
        if (!spotDetail?.scenarioHash) return;
        setLoadingRunout(true);
        try {
            const res = await fetch(`/api/training/runout-report?scenarioHash=${spotDetail.scenarioHash}`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                setRunoutData(data.runouts || {});
            }
        } catch (err) {
            console.error('[Solutions] Runout fetch error:', err);
        } finally {
            setLoadingRunout(false);
        }
    }, [spotDetail?.scenarioHash]);

    // Auto-fetch runout when switching to runout tab
    useEffect(() => {
        if (activeTab === 'runout' && Object.keys(runoutData).length === 0 && spotDetail) {
            fetchRunoutData();
        }
    }, [activeTab, runoutData, spotDetail, fetchRunoutData]);

    // Dead cards for card selector
    const deadCards = useMemo(() => {
        return spotDetail?.board || [];
    }, [spotDetail]);

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
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
                    flexWrap: 'wrap',
                    minHeight: 'calc(100vh - 160px)',
                    width: '100%',
                }}>
                    {/* Left: Spot List */}
                    <div style={{
                        flex: '1 1 320px', maxWidth: '100%',
                        borderRight: '1px solid rgba(255,255,255,0.06)',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        overflowY: 'auto', padding: 12,
                        display: 'flex', flexDirection: 'column', gap: 4,
                        maxHeight: activeTab === 'grid' ? 'auto' : 'auto',
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
                                {/* Bookmarks Filter Toggle */}
                                <div style={{
                                    display: 'flex', gap: 6, padding: '4px 0 8px',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    marginBottom: 4,
                                }}>
                                    <button
                                        onClick={() => setShowBookmarksOnly(false)}
                                        style={{
                                            flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10,
                                            fontWeight: 700, cursor: 'pointer', border: 'none',
                                            background: !showBookmarksOnly ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                                            color: !showBookmarksOnly ? '#00d4ff' : '#64748b',
                                            transition: 'all 0.15s',
                                            fontFamily: "'Orbitron', monospace",
                                        }}
                                    >
                                        ALL SPOTS
                                    </button>
                                    <button
                                        onClick={() => setShowBookmarksOnly(true)}
                                        style={{
                                            flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10,
                                            fontWeight: 700, cursor: 'pointer', border: 'none',
                                            background: showBookmarksOnly ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
                                            color: showBookmarksOnly ? '#fbbf24' : '#64748b',
                                            transition: 'all 0.15s',
                                            fontFamily: "'Orbitron', monospace",
                                        }}
                                    >
                                        ★ BOOKMARKS
                                    </button>
                                </div>
                                {spots.filter(s => {
                                    if (!showBookmarksOnly) return true;
                                    const h = s.scenarioHash || s.scenario_hash;
                                    return h && bookmarkedHashes.has(h);
                                }).map(spot => (
                                    <SpotCard
                                        key={spot.id}
                                        spot={spot}
                                        isSelected={selectedSpot === spot.id}
                                        onClick={() => loadSpotDetail(spot.id)}
                                        isBookmarked={bookmarkedHashes.has(spot.scenarioHash || spot.scenario_hash)}
                                        onToggleBookmark={toggleBookmark}
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

                    {/* Right: Detail Panel */}
                    <div style={{
                        flex: '1 1 320px', minWidth: 280, padding: '24px 32px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        overflowY: 'auto', maxWidth: '100%',
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
                                key={spotDetail.id || spotDetail.scenarioHash}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ width: '100%', maxWidth: 900 }}
                            >
                                {/* Node Breadcrumb */}
                                <NodeBreadcrumb
                                    treePath={treePath}
                                    onNavigateBack={navigateBack}
                                />

                                {/* Spot Header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12,
                                    padding: '16px 20px',
                                    background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(124,58,237,0.05))',
                                    borderRadius: 12,
                                    border: '1px solid rgba(0,212,255,0.15)',
                                    flexWrap: 'wrap',
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
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

                                {/* Range Equity Matchup */}
                                {spotDetail.rangeEquity && (
                                    <div style={{ marginBottom: 12 }}>
                                        <EquityMatchup
                                            heroEquity={spotDetail.rangeEquity.hero}
                                            villainEquity={spotDetail.rangeEquity.villain}
                                            heroPosition={spotDetail.heroPosition || 'Hero'}
                                            villainPosition="Villain"
                                        />
                                    </div>
                                )}

                                {/* Tab Switcher + Color Mode Toggle */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    marginBottom: 12,
                                    flexWrap: 'wrap', gap: 8,
                                }}>
                                    {/* View Tabs */}
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {[
                                            { key: 'grid', label: '13×13 Grid' },
                                            { key: 'ev', label: 'EV View' },
                                            { key: 'equity', label: 'Equity' },
                                            { key: 'eqr', label: 'EQR' },
                                            { key: 'runout', label: 'Runout' },
                                            { key: 'blockers', label: 'Blockers' },
                                            { key: 'tree', label: 'Tree' },
                                            { key: 'report', label: 'Report' },
                                        ].map(tab => (
                                            <button
                                                key={tab.key}
                                                onClick={() => setActiveTab(tab.key)}
                                                style={{
                                                    padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                                    cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                                    background: activeTab === tab.key
                                                        ? 'linear-gradient(135deg, #00d4ff, #7c3aed)'
                                                        : 'rgba(255,255,255,0.06)',
                                                    color: activeTab === tab.key ? '#fff' : '#94a3b8',
                                                }}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Color Mode Toggle + Tree Navigate */}
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {activeTab === 'grid' && (
                                            <div style={{
                                                display: 'flex',
                                                background: 'rgba(255,255,255,0.04)',
                                                borderRadius: 8,
                                                overflow: 'hidden',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                            }}>
                                                {[
                                                    { key: 'action', label: 'Action' },
                                                    { key: 'classification', label: 'Hand Type' },
                                                ].map(mode => (
                                                    <button
                                                        key={mode.key}
                                                        onClick={() => setColorMode(mode.key)}
                                                        style={{
                                                            padding: '4px 10px', fontSize: 10, fontWeight: 600,
                                                            cursor: 'pointer', border: 'none',
                                                            background: colorMode === mode.key
                                                                ? 'rgba(0,212,255,0.2)'
                                                                : 'transparent',
                                                            color: colorMode === mode.key ? '#00d4ff' : '#64748b',
                                                            transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        {mode.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Navigate to Next Street */}
                                        {spotDetail.board && spotDetail.board.length < 5 && (
                                            <button
                                                onClick={() => setShowCardSelector(true)}
                                                style={{
                                                    padding: '5px 12px', borderRadius: 8,
                                                    fontSize: 11, fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: '1px solid rgba(0,212,255,0.3)',
                                                    background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(124,58,237,0.05))',
                                                    color: '#00d4ff',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {spotDetail.board.length === 3 ? '→ Turn' : '→ River'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Main Content Area */}
                                {activeTab === 'grid' ? (
                                    <>
                                        <div style={{
                                            display: 'flex', gap: 16,
                                            alignItems: 'flex-start',
                                            justifyContent: 'center',
                                            flexWrap: 'wrap',
                                            width: '100%'
                                        }}>
                                            {/* Range Grid */}
                                            <RangeGrid
                                                gridData={spotDetail.gridData}
                                                actions={spotDetail.actions}
                                                cellSize={34}
                                                classificationData={classificationData}
                                                colorMode={colorMode}
                                                handEVs={spotDetail.handEVs || null}
                                                lockedClassifications={lockedClassifications}
                                            />

                                            {/* Classification Sidebar (when in classification mode) */}
                                            {classificationGroups.length > 0 && (
                                                <ClassificationSidebar
                                                    groups={classificationGroups}
                                                    actions={spotDetail.actions}
                                                    lockedClassifications={lockedClassifications}
                                                    onToggleLock={toggleClassificationLock}
                                                />
                                            )}
                                        </div>

                                        {/* Solver Line Summary — below grid */}
                                        <div style={{ width: '100%', maxWidth: 900, marginTop: 14 }}>
                                            <SolverLineSummary
                                                gridData={spotDetail.gridData}
                                                classificationGroups={classificationGroups}
                                                board={spotDetail.board || []}
                                                actions={spotDetail.actions || []}
                                                heroPosition={spotDetail.heroPosition || 'Hero'}
                                            />
                                        </div>
                                    </>
                                ) : activeTab === 'runout' ? (
                                    <RunoutHeatmap
                                        runoutData={runoutData}
                                        deadCards={deadCards}
                                        loading={loadingRunout}
                                        onCardClick={(card) => navigateToChild(card)}
                                    />
                                ) : activeTab === 'ev' ? (
                                    <div style={{ width: '100%' }}>
                                        <div style={{
                                            fontSize: 12, fontWeight: 700, color: '#00d4ff',
                                            fontFamily: "'Orbitron', monospace", marginBottom: 12,
                                            textTransform: 'uppercase', letterSpacing: 1,
                                        }}>EV by Action (BB)</div>
                                        <RangeGrid
                                            gridData={spotDetail.gridData}
                                            actions={spotDetail.actions}
                                            cellSize={34}
                                            colorMode="ev"
                                            handEVs={spotDetail.handEVs || null}
                                        />
                                        <div style={{
                                            marginTop: 10, padding: '8px 12px', borderRadius: 8,
                                            background: 'rgba(255,255,255,0.02)', fontSize: 10, color: '#64748b',
                                        }}>
                                            Green = positive EV, Red = negative. Values in big blinds.
                                        </div>
                                    </div>
                                ) : activeTab === 'equity' ? (
                                    <div style={{ width: '100%' }}>
                                        <div style={{
                                            fontSize: 12, fontWeight: 700, color: '#22c55e',
                                            fontFamily: "'Orbitron', monospace", marginBottom: 12,
                                            textTransform: 'uppercase', letterSpacing: 1,
                                        }}>Raw Equity %</div>
                                        <RangeGrid
                                            gridData={spotDetail.gridData}
                                            actions={spotDetail.actions}
                                            cellSize={34}
                                            colorMode="equity"
                                            handEVs={spotDetail.handEVs || null}
                                        />
                                        <div style={{
                                            marginTop: 10, padding: '8px 12px', borderRadius: 8,
                                            background: 'rgba(255,255,255,0.02)', fontSize: 10, color: '#64748b',
                                        }}>
                                            Shows raw pot equity per hand combo against villain's range.
                                        </div>
                                    </div>
                                ) : activeTab === 'eqr' ? (
                                    <div style={{ width: '100%' }}>
                                        <div style={{
                                            fontSize: 12, fontWeight: 700, color: '#a855f7',
                                            fontFamily: "'Orbitron', monospace", marginBottom: 12,
                                            textTransform: 'uppercase', letterSpacing: 1,
                                        }}>Equity Realization Ratio</div>
                                        <RangeGrid
                                            gridData={spotDetail.gridData}
                                            actions={spotDetail.actions}
                                            cellSize={34}
                                            colorMode="eqr"
                                            handEVs={spotDetail.handEVs || null}
                                        />
                                        <div style={{
                                            marginTop: 10, padding: '8px 12px', borderRadius: 8,
                                            background: 'rgba(255,255,255,0.02)', fontSize: 10, color: '#64748b',
                                        }}>
                                            EQR = EV / Equity. Values &gt;1.0 overperform, &lt;1.0 underperform.
                                        </div>
                                    </div>
                                ) : activeTab === 'blockers' ? (
                                    <div style={{ width: '100%' }}>
                                        <BlockerScorePanel
                                            board={spotDetail.board}
                                            gridData={spotDetail.gridData}
                                            actions={spotDetail.actions}
                                            heldCards={spotDetail.heroCards || (spotDetail.board || []).slice(0, 2)}
                                        />
                                    </div>
                                ) : activeTab === 'tree' ? (
                                    <div style={{ width: '100%' }}>
                                        <SolverTreeViewer
                                            spotDetail={spotDetail}
                                            width={Math.min(800, typeof window !== 'undefined' ? window.innerWidth - 100 : 600)}
                                            height={400}
                                        />
                                    </div>
                                ) : activeTab === 'report' ? (
                                    <RangeReport
                                        classificationGroups={classificationGroups}
                                        gridData={spotDetail.gridData || {}}
                                        board={spotDetail.board || []}
                                        handEVs={spotDetail.handEVs || {}}
                                    />
                                ) : null}

                                {/* Action Buttons (for tree navigation) */}
                                {activeTab === 'grid' && spotDetail.actions && spotDetail.actions.length > 0 && (
                                    <div style={{
                                        marginTop: 16, padding: '12px 16px',
                                        background: 'rgba(255,255,255,0.02)',
                                        borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                        <div style={{
                                            fontSize: 10, fontWeight: 700, color: '#64748b',
                                            textTransform: 'uppercase', letterSpacing: 1,
                                            marginBottom: 8,
                                            fontFamily: "'Orbitron', monospace",
                                        }}>
                                            Navigate Action →
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {spotDetail.actions.map(action => (
                                                <button
                                                    key={action}
                                                    onClick={() => {
                                                        if (spotDetail.board && spotDetail.board.length < 5) {
                                                            setShowCardSelector(true);
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '6px 16px', borderRadius: 8,
                                                        fontSize: 12, fontWeight: 700,
                                                        cursor: 'pointer',
                                                        border: `1px solid ${(ACTION_COLORS[action] || '#888') + '55'}`,
                                                        background: `${(ACTION_COLORS[action] || '#888')}15`,
                                                        color: ACTION_COLORS[action] || '#888',
                                                        transition: 'all 0.15s',
                                                        fontFamily: "'Orbitron', monospace",
                                                    }}
                                                >
                                                    {action}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        ) : null}
                    </div>
                </div>
            </div >

            {/* Card Selector Modal */}
            <CardSelectorModal
                isOpen={showCardSelector}
                onClose={() => setShowCardSelector(false)}
                onSelectCard={navigateToChild}
                deadCards={deadCards}
                title={spotDetail?.board?.length === 3 ? 'Select Turn Card' : 'Select River Card'}
            />
        </>
    );
}
