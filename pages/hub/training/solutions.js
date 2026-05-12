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

// TRAIN-CSS-TOKENS-BATCH4-1 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH5-54 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-47 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
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
import { authedFetch } from '../../../src/lib/authUtils';
import usePersistedFilters from '../../../src/hooks/usePersistedFilters';
import Card from '../../../src/components/training/Card';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import { SkeletonBox } from '../../../src/components/ui/SkeletonLoader';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
// ── Phase 1 Engines: Board texture + hand strength for solution browsing ─
import { analyzeBoard } from '../../../src/engines/BoardTextureEngine';
import { classifyMadeHand, classifyDraws } from '../../../src/engines/HandStrengthEngine';

// Dynamic imports for new Phase 34 components (avoid SSR issues)
const BlockerScorePanel = dynamic(
  () => import('../../../src/components/training/BlockerScorePanel'),
  { ssr: false }
);
const SolverTreeViewer = dynamic(
  () => import('../../../src/components/training/SolverTreeViewer'),
  { ssr: false }
);

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const GAME_TYPES = [
  { value: 'hu_cash', label: 'Cash HU', icon: '💰', description: 'Heads-Up Cash Game' },
  { value: 'postflop_complete', label: 'Cash 6-Max', icon: '🃏', description: '6-Max Postflop' },
  { value: 'mtt_6max_icm', label: 'MTT ICM', icon: '🏆', description: 'MTT 6-Max ICM' },
  { value: 'mtt_6max_chipev', label: 'MTT ChipEV', icon: '📊', description: 'MTT ChipEV' },
  { value: 'turn_spin', label: 'Spins', icon: '🎯', description: 'Spin & Go' },
];

const STACK_DEPTHS = {
  hu_cash: [20, 40, 60, 80, 100, 200],
  postflop_complete: [100],
  mtt_6max_icm: [10, 20, 40, 60, 80, 100],
  mtt_6max_chipev: [10, 20, 40, 80, 100],
  turn_spin: [10, 20, 40, 60],
};

const POSITIONS = ['BTN', 'SB', 'BB', 'CO', 'HJ', 'MP', 'UTG'];

const ACTION_COLORS = {
  r: 'var(--sp-accent-red)',
  R: 'var(--sp-accent-red)',
  b: 'var(--sp-accent-red)',
  B: 'var(--sp-accent-red)',
  c: 'var(--sp-accent-green)',
  C: 'var(--sp-accent-green)',
  x: 'var(--sp-accent-blue)',
  X: 'var(--sp-accent-blue)',
  f: 'var(--sp-fg-dim)',
  F: 'var(--sp-fg-dim)',
};

// Card rendering uses shared Card.tsx custom PNG deck

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
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', gap: 2 }}>
        {(spot.board || []).map((card, i) => (
          <Card key={i} rank={card[0]?.toUpperCase()} suit={card[1]?.toLowerCase()} size="tiny" />
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: isSelected ? 'var(--sp-accent-cyan)' : 'var(--sp-fg)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {spot.heroPosition} • {spot.board?.join(' ') || 'Preflop'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
          {spot.stackDepth}BB • {spot.gameType}
        </div>
      </div>
      {/* Bookmark star */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleBookmark && onToggleBookmark(spot);
        }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          padding: 2,
          lineHeight: 1,
          color: isBookmarked ? 'var(--sp-accent-amber)' : 'var(--sp-fg-faint)',
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
        width: 240,
        maxHeight: 500,
        overflowY: 'auto',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--sp-fg-dim)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 10,
          fontFamily: "'Orbitron', monospace",
        }}
      >
        Hand Classes
      </div>

      {groups.map((g) => {
        const isLocked = lockedClassifications && lockedClassifications.includes(g.classification);
        return (
          <div
            key={g.classification}
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              background: isLocked ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              borderLeft: `3px solid ${g.color}`,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onClick={() => onToggleLock && onToggleLock(g.classification)}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: g.color,
                }}
              >
                {isLocked ? '✓ ' : ''}
                {g.label}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--sp-fg-dim)',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '1px 6px',
                  borderRadius: 8,
                }}
              >
                {g.handCount} hands
              </span>
            </div>
            {/* Action Summary */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(g.actionSummary || {})
                .filter(([_, pct]) => pct > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([action, pct]) => (
                  <span
                    key={action}
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: ACTION_COLORS[action] || '#888',
                      background: 'rgba(255,255,255,0.04)',
                      padding: '1px 5px',
                      borderRadius: 4,
                    }}
                  >
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        marginBottom: 12,
        overflowX: 'auto',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: 'var(--sp-fg-dim)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          whiteSpace: 'nowrap',
          fontFamily: "'Orbitron', monospace",
        }}
      >
        TREE
      </span>
      {treePath.map((node, i) => (
        <React.Fragment key={i}>
          <span style={{ color: 'var(--sp-fg-faint)', fontSize: 12 }}>›</span>
          <button
            onClick={() => onNavigateBack(i)}
            style={{
              background:
                i === treePath.length - 1 ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
              border:
                i === treePath.length - 1
                  ? '1px solid rgba(0,212,255,0.3)'
                  : '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '3px 8px',
              color: i === treePath.length - 1 ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 600,
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
  // Wrap main component in an error boundary pattern since it's a top-level page
  const [renderError, setRenderError] = useState(null);

  if (renderError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ff4444' }}>
        <h2>Error Loading Solutions Browser</h2>
        <p>{renderError.message}</p>
        <button onClick={() => setRenderError(null)} style={{ padding: '8px 16px', background: '#333', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer', marginTop: 10 }}>Retry</button>
      </div>
    );
  }

  return <SolutionsBrowserInner setError={setRenderError} />;
}

function SolutionsBrowserInner({ setError }) {
  useTrainingBus('solutions-browser');
  const router = useRouter();

  const { filters, setFilter } = usePersistedFilters('solutions-browser', {
    gameType: 'hu_cash',
    stackDepth: 100,
    position: '',
    colorMode: 'action',
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
  const [fetchError, setFetchError] = useState(null);

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
  const [showEVOverlay, setShowEVOverlay] = useState(false);

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

  // Phase 17: Board Texture Filter
  const [boardTexture, setBoardTexture] = useState(filters.rxTexture || 'All');
  const BOARD_TEXTURES = ['All', 'Monotone', 'Two-Tone', 'Rainbow', 'Paired', 'Connected'];
  const TEXTURE_FILTER_COLORS = {
    All: 'var(--sp-accent-cyan)',
    Monotone: 'var(--sp-accent-purple)',
    'Two-Tone': 'var(--sp-accent-blue)',
    Rainbow: 'var(--sp-accent-green)',
    Paired: 'var(--sp-accent-amber)',
    Connected: 'var(--sp-accent-red)',
  };

  // Board texture classifier — uses Phase 1 BoardTextureEngine for rich analysis
  function classifyBoardTexture(boardCards) {
    if (!boardCards || boardCards.length < 3) return [];

    // Try engine first for comprehensive texture analysis
    try {
      const engineResult = analyzeBoard(boardCards);
      if (engineResult) {
        const tags = [];
        // Flush texture
        if (engineResult.flushTexture === 'monotone') tags.push('Monotone');
        else if (engineResult.flushTexture === 'two-tone') tags.push('Two-Tone');
        else tags.push('Rainbow');
        // Pairing
        if (engineResult.paired) tags.push('Paired');
        // Connectivity
        if (engineResult.connectivity === 'connected' || engineResult.straightPossible) tags.push('Connected');
        // Engine extras for advanced filtering
        if (engineResult.wetness >= 0.7) tags.push('Wet');
        if (engineResult.wetness <= 0.3) tags.push('Dry');
        if (engineResult.highCard) tags.push(engineResult.highCard >= 12 ? 'High' : 'Low');
        return tags;
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

    // Inline fallback
    const suits = boardCards.slice(0, 3).map((c) => (typeof c === 'string' ? c[c.length - 1] : ''));
    const ranks = boardCards.slice(0, 3).map((c) => {
      if (typeof c !== 'string') return 0;
      const r = c[0];
      return 'AKQJT98765432'.indexOf(r);
    });
    const tags = [];
    const uniqueSuits = new Set(suits).size;
    if (uniqueSuits === 1) tags.push('Monotone');
    else if (uniqueSuits === 2) tags.push('Two-Tone');
    else tags.push('Rainbow');
    const uniqueRanks = new Set(ranks).size;
    if (uniqueRanks < boardCards.slice(0, 3).length) tags.push('Paired');
    const sorted = [...ranks].filter((r) => r >= 0).sort((a, b) => a - b);
    if (sorted.length >= 3 && sorted[sorted.length - 1] - sorted[0] <= 4) tags.push('Connected');
    return tags;
  }

  // Fetch bookmarks on mount
  useEffect(() => {
    async function loadBookmarks() {
      try {
        const res = await authedFetch('/api/training/bookmark-solution');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        if (data.success && data.bookmarks) {
          setBookmarkedHashes(new Set(data.bookmarks.map((b) => b.scenario_hash)));
        }
      } catch (e) {
        console.warn('[Solutions] Bookmarks fetch failed:', e);
      }
    }
    loadBookmarks();

    // Listen for external bookmark updates (e.g. from Sandbox)
    eventBus?.on?.('pa-data-updated', loadBookmarks);
    return () => eventBus?.off?.('pa-data-updated', loadBookmarks);
  }, []);

  // Toggle bookmark
  const toggleBookmark = useCallback(
    async (spot) => {
      const hash = spot.scenarioHash || spot.scenario_hash;
      if (!hash) return;
      const isBookmarked = bookmarkedHashes.has(hash);
      const action = isBookmarked ? 'delete' : 'save';
      try {
        const res = await authedFetch('/api/training/bookmark-solution', {
          method: 'POST',
          
          body: JSON.stringify({ scenarioHash: hash, spotId: spot.id, action }),
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        setBookmarkedHashes((prev) => {
          const next = new Set(prev);
          if (isBookmarked) next.delete(hash);
          else next.add(hash);
          return next;
        });
        // Broadcast so other pages (like Sandbox) can sync
        eventBus?.emit?.('pa-data-updated', {}, 'SolutionsBrowser');
      } catch (e) {
        console.warn('[Solutions] Bookmark toggle failed:', e);
      }
    },
    [bookmarkedHashes]
  );

  // Toggle range lock
  const toggleClassificationLock = useCallback((classification) => {
    setLockedClassifications((prev) => {
      if (prev.includes(classification)) {
        return prev.filter((c) => c !== classification);
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
        console.warn('[Solutions] Classification error:', e);
        // Do not crash the app, just fallback to empty classification
        setClassificationData({});
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
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        gameType,
        stackDepth: stackDepth.toString(),
        page: page.toString(),
        limit: '30',
      });
      if (position) params.set('position', position);

      const res = await authedFetch(`/api/training/browse-solutions?${params}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      if (data.success) {
        setSpots(data.spots || []);
        setTotalSpots(data.total || 0);
        setTotalPages(data.totalPages || 0);
      } else {
        setSpots([]);
        setTotalSpots(0);
        setTotalPages(0);
      }
    } catch (err) {
      console.warn('[Solutions] Fetch error:', err);
      setFetchError('Failed to load solutions. Please try again.');
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
      const res = await authedFetch(`/api/training/browse-solutions?spotId=${spotId}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.success && data.spot) {
        setSpotDetail(data.spot);
        // Initialize tree path with root node
        setTreePath([
          {
            label: `${data.spot.heroPosition} • ${data.spot.board?.join(' ')}`,
            spotDetail: data.spot,
            spotId,
          },
        ]);
      }
    } catch (err) {
      console.warn('[Solutions] Detail fetch error:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Phase 15: Navigate to child node (tree hopping)
  const navigateToChild = useCallback(
    async (nextCard) => {
      if (!spotDetail?.scenarioHash) return;
      setLoadingDetail(true);
      setShowCardSelector(false);

      try {
        const params = new URLSearchParams({
          scenarioHash: spotDetail.scenarioHash,
          nextCard,
        });
        const res = await authedFetch(`/api/training/tree-navigate?${params}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();

        if (data.success && data.childSpot) {
          setSpotDetail(data.childSpot);
          setTreePath((prev) => [
            ...prev,
            {
              label: `${nextCard.toUpperCase()} → ${data.childSpot.heroPosition}`,
              spotDetail: data.childSpot,
              scenarioHash: data.childSpot.scenarioHash,
            },
          ]);
          setActiveTab('grid');
          setRunoutData({});
        } else {
          console.warn('[Solutions] No child node found for', nextCard);
        }
      } catch (err) {
        console.warn('[Solutions] Tree navigate error:', err);
      } finally {
        setLoadingDetail(false);
      }
    },
    [spotDetail]
  );

  // Navigate back in tree
  const navigateBack = useCallback(
    (index) => {
      if (index < treePath.length - 1) {
        const node = treePath[index];
        setTreePath((prev) => prev.slice(0, index + 1));
        if (node.spotDetail) {
          setSpotDetail(node.spotDetail);
          setActiveTab('grid');
          setRunoutData({});
        }
      }
    },
    [treePath]
  );

  // Phase 15: Fetch runout data
  const fetchRunoutData = useCallback(async () => {
    if (!spotDetail?.scenarioHash) return;
    setLoadingRunout(true);
    try {
      const res = await authedFetch(
        `/api/training/runout-report?scenarioHash=${spotDetail.scenarioHash}`
      );
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setRunoutData(data.runouts || {});
      }
    } catch (err) {
      console.warn('[Solutions] Runout fetch error:', err);
    } finally {
      setLoadingRunout(false);
    }
  }, [spotDetail?.scenarioHash]);

  // Auto-fetch runout when switching to runout tab
  useEffect(() => {
    if (activeTab === 'runout' && Object.keys(runoutData || {}).length === 0 && spotDetail) {
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
        <meta
          name="description"
          content="Browse pre-solved GTO strategies for every poker spot. View optimal action frequencies for all 1326 hand combos."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--sp-fg-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ← Training
            </button>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), #7c3aed)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              GTO Solutions
            </h1>
            <span
              style={{
                fontSize: 10,
                color: 'var(--sp-fg-dim)',
                background: 'rgba(255,255,255,0.04)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 600,
              }}
            >
              {totalSpots.toLocaleString()} spots
            </span>
          </div>

          {/* Filters Row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GAME_TYPES.map((gt) => (
              <button
                key={gt.value}
                aria-label={`Filter by ${gt.label}`}
                aria-pressed={gameType === gt.value}
                onClick={() => setGameType(gt.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.2s',
                  background:
                    gameType === gt.value
                      ? 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), #7c3aed)'
                      : 'rgba(255,255,255,0.06)',
                  color: gameType === gt.value ? '#fff' : 'var(--sp-fg-muted)',
                }}
              >
                {gt.icon} {gt.label}
              </button>
            ))}
          </div>

          {/* Stack Depth + Position Row */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--sp-fg-dim)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Stack:
              </span>
              {availableStacks.map((sd) => (
                <button
                  key={sd}
                  onClick={() => {
                    setStackDepth(sd);
                    setPage(1);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s',
                    background:
                      stackDepth === sd ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                    color: stackDepth === sd ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                    fontFamily: "'Orbitron', monospace",
                  }}
                >
                  {sd}BB
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--sp-fg-dim)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Position:
              </span>
              <button
                aria-label="Filter by All positions"
                aria-pressed={!position}
                onClick={() => {
                  setPosition('');
                  setPage(1);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: !position ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                  color: !position ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                }}
              >
                ALL
              </button>
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  aria-label={`Filter by position ${p}`}
                  aria-pressed={position === p}
                  onClick={() => {
                    setPosition(p);
                    setPage(1);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: position === p ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                    color: position === p ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                    fontFamily: "'Orbitron', monospace",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Phase 17: Board Texture Filter */}
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--sp-fg-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Texture:</span>
              {BOARD_TEXTURES.map((tex) => (
                <button
                  key={tex}
                  onClick={() => {
                    setBoardTexture(tex);
                    saveFilter('rxTexture', tex);
                    setPage(1);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: boardTexture === tex
                      ? `${TEXTURE_FILTER_COLORS[tex]}20`
                      : 'rgba(255,255,255,0.04)',
                    color: boardTexture === tex ? TEXTURE_FILTER_COLORS[tex] : 'var(--sp-fg-faint)',
                    transition: 'all 0.15s',
                  }}
                >
                  {tex}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            minHeight: 'calc(100vh - 160px)',
            width: '100%',
          }}
        >
          {/* Left: Spot List */}
          <div
            style={{
              flex: '1 1 320px',
              maxWidth: '100%',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              overflowY: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: activeTab === 'grid' ? 'auto' : 'auto',
            }}
          >
            {loading ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <SkeletonBox width={48} height={48} style={{ borderRadius: 8, flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <SkeletonBox width={`${60 + i * 8}%`} height={14} />
                      <SkeletonBox width={`${40 + i * 5}%`} height={10} />
                    </div>
                  </div>
                ))}
              </div>
            ) : spots.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <p style={{ color: 'var(--sp-fg-dim)', fontSize: 13 }}>
                  No spots found for this configuration
                </p>
                <p style={{ color: 'var(--sp-fg-faint)', fontSize: 11, marginTop: 4 }}>
                  Try a different game type or stack depth
                </p>
              </div>
            ) : (
              <>
                {/* Bookmarks Filter Toggle */}
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    padding: '4px 0 8px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    marginBottom: 4,
                  }}
                >
                  <button
                    aria-label="Show all spots"
                    aria-pressed={!showBookmarksOnly}
                    onClick={() => setShowBookmarksOnly(false)}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      background: !showBookmarksOnly
                        ? 'rgba(0,212,255,0.15)'
                        : 'rgba(255,255,255,0.04)',
                      color: !showBookmarksOnly ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                      transition: 'all 0.15s',
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    ALL SPOTS
                  </button>
                  <button
                    aria-label="Show bookmarked spots only"
                    aria-pressed={showBookmarksOnly}
                    onClick={() => setShowBookmarksOnly(true)}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      background: showBookmarksOnly
                        ? 'rgba(251,191,36,0.15)'
                        : 'rgba(255,255,255,0.04)',
                      color: showBookmarksOnly ? 'var(--sp-accent-amber)' : 'var(--sp-fg-dim)',
                      transition: 'all 0.15s',
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    ★ BOOKMARKS
                  </button>
                </div>
                {spots
                  .filter((s) => {
                    if (!showBookmarksOnly) return true;
                    const h = s.scenarioHash || s.scenario_hash;
                    return h && bookmarkedHashes.has(h);
                  })
                  .filter((s) => {
                    if (boardTexture === 'All') return true;
                    const boardCards = s.board || s.boardCards || [];
                    if (boardCards.length < 3) return true; // can't classify without flop
                    const tags = classifyBoardTexture(boardCards);
                    return tags.includes(boardTexture);
                  })
                  .map((spot) => (
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
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '12px 0',
                      marginTop: 4,
                    }}
                  >
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        background: 'rgba(255,255,255,0.06)',
                        color: 'var(--sp-fg-muted)',
                        border: 'none',
                        cursor: page > 1 ? 'pointer' : 'not-allowed',
                        opacity: page <= 1 ? 0.4 : 1,
                      }}
                    >
                      ← Prev
                    </button>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--sp-fg-dim)',
                        padding: '6px 8px',
                        fontFamily: "'Orbitron', monospace",
                      }}
                    >
                      {page} / {totalPages}
                    </span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        background: 'rgba(255,255,255,0.06)',
                        color: 'var(--sp-fg-muted)',
                        border: 'none',
                        cursor: page < totalPages ? 'pointer' : 'not-allowed',
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
          <div
            style={{
              flex: '1 1 320px',
              minWidth: 280,
              padding: '24px 32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              overflowY: 'auto',
              maxWidth: '100%',
            }}
          >
            {!spotDetail && !loadingDetail ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 12,
                  opacity: 0.4,
                }}
              >
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                <p style={{ color: 'var(--sp-fg-dim)', fontSize: 14 }}>Select a spot to view the strategy</p>
                <p style={{ color: 'var(--sp-fg-faint)', fontSize: 11 }}>
                  Click any board in the list to see the full 13×13 range grid
                </p>
              </div>
            ) : loadingDetail ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  paddingTop: 80,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    border: '3px solid rgba(0,212,255,0.2)',
                    borderTop: '3px solid #00d4ff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <p style={{ color: 'var(--sp-fg-muted)', fontSize: 13 }}>Loading strategy matrix...</p>
                <style>{`
                  @keyframes spin {
                    to {
                      transform: rotate(360deg);
                    }
                  }
                `}</style>
              </div>
            ) : spotDetail ? (
              <motion.div
                key={spotDetail.id || spotDetail.scenarioHash}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ width: '100%', maxWidth: 900 }}
              >
                {/* Node Breadcrumb */}
                <NodeBreadcrumb treePath={treePath} onNavigateBack={navigateBack} />

                {/* Spot Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    marginBottom: 12,
                    padding: '16px 20px',
                    background:
                      'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(124,58,237,0.05))',
                    borderRadius: 12,
                    border: '1px solid rgba(0,212,255,0.15)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(spotDetail.board || []).map((card, i) => (
                      <Card
                        key={i}
                        rank={card[0]?.toUpperCase()}
                        suit={card[1]?.toLowerCase()}
                        size="tiny"
                      />
                    ))}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--sp-accent-cyan)',
                        fontFamily: "'Orbitron', monospace",
                      }}
                    >
                      {spotDetail.heroPosition}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', marginTop: 2 }}>
                      {spotDetail.stackDepth}BB {spotDetail.gameType} • {spotDetail.handCount} hands
                      in range
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(spotDetail.actions || []).map((a) => (
                      <span
                        key={a}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.06)',
                          color: 'var(--sp-fg-muted)',
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
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
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        aria-label={`View ${tab.label}`}
                        aria-pressed={activeTab === tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'all 0.15s',
                          background:
                            activeTab === tab.key
                              ? 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), #7c3aed)'
                              : 'rgba(255,255,255,0.06)',
                          color: activeTab === tab.key ? '#fff' : 'var(--sp-fg-muted)',
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Color Mode Toggle + Tree Navigate */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {activeTab === 'grid' && (
                      <div
                        style={{
                          display: 'flex',
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        {[
                          { key: 'action', label: 'Action' },
                          { key: 'classification', label: 'Hand Type' },
                        ].map((mode) => (
                          <button
                            key={mode.key}
                            aria-label={`Color by ${mode.label}`}
                            aria-pressed={colorMode === mode.key}
                            onClick={() => setColorMode(mode.key)}
                            style={{
                              padding: '4px 10px',
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: 'none',
                              background:
                                colorMode === mode.key ? 'rgba(0,212,255,0.2)' : 'transparent',
                              color: colorMode === mode.key ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {mode.label}
                          </button>
                        ))}
                        <div
                          style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }}
                        />
                        <button
                          onClick={() => setShowEVOverlay(!showEVOverlay)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: 'none',
                            background: showEVOverlay ? 'rgba(74, 222, 128, 0.2)' : 'transparent',
                            color: showEVOverlay ? 'var(--sp-accent-green)' : 'var(--sp-fg-dim)',
                            transition: 'all 0.15s',
                          }}
                        >
                          +EV Views
                        </button>
                      </div>
                    )}

                    {/* Navigate to Next Street */}
                    {spotDetail.board && spotDetail.board.length < 5 && (
                      <button
                        onClick={() => setShowCardSelector(true)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: '1px solid rgba(0,212,255,0.3)',
                          background:
                            'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(124,58,237,0.05))',
                          color: 'var(--sp-accent-cyan)',
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
                    <div
                      style={{
                        display: 'flex',
                        gap: 16,
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        width: '100%',
                      }}
                    >
                      {/* Range Grid */}
                      <RangeGrid
                        gridData={spotDetail.gridData}
                        actions={spotDetail.actions}
                        cellSize={34}
                        classificationData={classificationData}
                        colorMode={colorMode}
                        handEVs={spotDetail.handEVs || null}
                        lockedClassifications={lockedClassifications}
                        showEVOverlay={showEVOverlay && activeTab === 'grid'}
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
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sp-accent-cyan)',
                        fontFamily: "'Orbitron', monospace",
                        marginBottom: 12,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      EV by Action (BB)
                    </div>
                    <RangeGrid
                      gridData={spotDetail.gridData}
                      actions={spotDetail.actions}
                      cellSize={34}
                      colorMode="ev"
                      handEVs={spotDetail.handEVs || null}
                    />
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)',
                        fontSize: 10,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      Green = positive EV, Red = negative. Values in Big-Blinds.
                    </div>
                  </div>
                ) : activeTab === 'equity' ? (
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sp-accent-green)',
                        fontFamily: "'Orbitron', monospace",
                        marginBottom: 12,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      Raw Equity %
                    </div>
                    <RangeGrid
                      gridData={spotDetail.gridData}
                      actions={spotDetail.actions}
                      cellSize={34}
                      colorMode="equity"
                      handEVs={spotDetail.handEVs || null}
                    />
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)',
                        fontSize: 10,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      Shows raw pot equity per hand combo against villain's range.
                    </div>
                  </div>
                ) : activeTab === 'eqr' ? (
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sp-accent-purple)',
                        fontFamily: "'Orbitron', monospace",
                        marginBottom: 12,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      Equity Realization Ratio
                    </div>
                    <RangeGrid
                      gridData={spotDetail.gridData}
                      actions={spotDetail.actions}
                      cellSize={34}
                      colorMode="eqr"
                      handEVs={spotDetail.handEVs || null}
                    />
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)',
                        fontSize: 10,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      EQR = EV / Equity. Values &gt;1.0 overperform, &lt;1.0 underperform.
                    </div>
                  </div>
                ) : activeTab === 'blockers' ? (
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sp-accent-red)',
                        fontFamily: "'Orbitron', monospace",
                        marginBottom: 12,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      Card Removal Heatmap
                    </div>
                    <RangeGrid
                      gridData={spotDetail.gridData}
                      actions={spotDetail.actions}
                      cellSize={34}
                      colorMode="blocker"
                      heldCardsForBlockers={
                        spotDetail.heroCards
                          ? spotDetail.heroCards
                          : spotDetail.board
                            ? spotDetail.board.slice(0, 2)
                            : []
                      }
                    />
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)',
                        fontSize: 10,
                        color: 'var(--sp-fg-dim)',
                        marginBottom: 16,
                      }}
                    >
                      Displays the percentage of combos in villain's range blocked by hero's cards.
                      Red = Heavily Blocked.
                    </div>
                    <BlockerScorePanel
                      board={spotDetail.board}
                      gridData={spotDetail.gridData}
                      actions={spotDetail.actions}
                      heldCards={
                        spotDetail.heroCards
                          ? spotDetail.heroCards
                          : spotDetail.board
                            ? spotDetail.board.slice(0, 2)
                            : []
                      }
                    />
                  </div>
                ) : activeTab === 'tree' ? (
                  <div style={{ width: '100%' }}>
                    <SolverTreeViewer
                      spotDetail={spotDetail}
                      width={Math.min(
                        800,
                        typeof window !== 'undefined' ? window.innerWidth - 100 : 600
                      )}
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
                  <div
                    style={{
                      marginTop: 16,
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--sp-fg-dim)',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 8,
                        fontFamily: "'Orbitron', monospace",
                      }}
                    >
                      Navigate Action →
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {spotDetail.actions.map((action) => (
                        <button
                          key={action}
                          onClick={() => {
                            if (spotDetail.board && spotDetail.board.length < 5) {
                              setShowCardSelector(true);
                            }
                          }}
                          style={{
                            padding: '6px 16px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: `1px solid ${(ACTION_COLORS[action] || '#888') + '55'}`,
                            background: `${ACTION_COLORS[action] || '#888'}15`,
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
      </div>

      {/* Card Selector Modal */}
      <CardSelectorModal
        isOpen={showCardSelector}
        onClose={() => setShowCardSelector(false)}
        onSelectCard={navigateToChild}
        deadCards={deadCards}
        title={spotDetail?.board?.length === 3 ? 'Select Turn Card' : 'Select River Card'}
      />
      {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchSpots(); }} />}
      <ConnectionToast />
    </>
  );
}