/**
 * SOLUTIONS BROWSER — Audited PioSOLVER Strategy Artifacts
 *
 * This page intentionally renders only fields returned by the provenance-
 * complete v2 browse contract: action frequencies, hand-class EVs, local hand
 * classifications, bookmarks, decision-node metadata, and solver provenance.
 * It must never infer unavailable solver outputs or fall back to legacy rows.
 */

// TRAIN-CSS-TOKENS-BATCH4-1 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH5-54 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-47 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import RangeGrid from '../../../src/components/training/RangeGrid';
import { classifyAllHands, groupByClassification } from '../../../src/utils/pokerHandEvaluator';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus } from '../../../src/engine/EventBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { createBoundedTrainingFetch } from '../../../src/lib/training/boundedTrainingFetch';
import usePersistedFilters from '../../../src/hooks/usePersistedFilters';
import Card from '../../../src/components/training/Card';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import { SkeletonBox } from '../../../src/components/ui/SkeletonLoader';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { analyzeBoard } from '../../../src/engines/BoardTextureEngine';

const trainingFetch = createBoundedTrainingFetch(authedFetch);

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CONFIG
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const GAME_TYPES = [
  { value: 'hu_cash', label: 'Cash HU', icon: '●', description: 'Heads-Up Cash Game' },
  { value: 'postflop_complete', label: 'Cash 6-Max', icon: '◇', description: '6-Max Postflop' },
  { value: 'mtt_6max_chipev', label: 'MTT ChipEV', icon: '■', description: 'MTT ChipEV' },
];

const STACK_DEPTHS = {
  hu_cash: [40, 100, 200],
  postflop_complete: [100],
  mtt_6max_chipev: [10, 20, 40, 100],
};

const BROWSE_AUTHORITY = 'provenance_complete_piosolver_v2_only';
const BROWSE_STREET = 'flop';

const POSITIONS = ['BTN', 'SB', 'BB', 'CO', 'HJ', 'MP', 'UTG'];
const BOARD_TEXTURES = ['All', 'Monotone', 'Two-Tone', 'Rainbow', 'Paired', 'Connected'];
const TEXTURE_FILTER_COLORS = {
  All: 'var(--sp-accent-cyan)',
  Monotone: 'var(--sp-accent-purple)',
  'Two-Tone': 'var(--sp-accent-blue)',
  Rainbow: 'var(--sp-accent-green)',
  Paired: 'var(--sp-accent-amber)',
  Connected: 'var(--sp-accent-red)',
};

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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// SPOT LIST ITEM
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
        <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CLASSIFICATION SIDEBAR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--sp-fg-dim)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 10,
          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
        }}
      >
        Hand Classes
      </div>

      {groups.map((g) => {
        const isLocked = lockedClassifications && lockedClassifications.includes(g.classification);
        return (
          <div
            key={g.classification}
            role="button"
            tabIndex={0}
            aria-pressed={Boolean(isLocked)}
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
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleLock?.(g.classification); } }}
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
                  fontSize: 12,
                  fontWeight: 700,
                  color: g.color,
                }}
              >
                {isLocked ? '✓ ' : ''}
                {g.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--sp-fg-dim)',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '1px 6px',
                  borderRadius: 8,
                }}
              >
                {g.handCount} Hands
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
                      fontSize: 12,
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

function isPlainRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isAuditedListResponse(data, expected) {
  return Boolean(
    data?.success === true
    && data.authority === BROWSE_AUTHORITY
    && Array.isArray(data.spots)
    && data.spots.every((spot) => (
      spot?.source === 'PioSOLVER'
      && spot.street === BROWSE_STREET
      && spot.gameType === expected.gameType
      && Number(spot.stackDepth) === expected.stackDepth
      && Array.isArray(spot.board)
      && spot.board.length === 3
      && Boolean(spot.scenarioHash)
      && Boolean(spot.auditedAt)
    ))
    && data.page === expected.page
    && data.limit === 30
    && Number.isSafeInteger(data.returnedCount)
    && data.returnedCount === data.spots.length
    && typeof data.hasMore === 'boolean'
    && data.total === null
    && data.totalIsExact === false
  );
}

function isAuditedSpot(spot) {
  const provenance = spot?.provenance;
  const handEVs = isPlainRecord(spot?.handEVs) ? Object.values(spot.handEVs) : [];
  const gridRows = isPlainRecord(spot?.gridData) ? Object.values(spot.gridData).filter(Boolean) : [];
  const decisionNode = spot?.decisionNode;
  return Boolean(
    spot
    && Boolean(spot.id)
    && Boolean(spot.scenarioHash)
    && spot.source === 'PioSOLVER'
    && spot.street === BROWSE_STREET
    && Array.isArray(spot.board)
    && spot.board.length === 3
    && new Set(spot.board).size === 3
    && spot.board.every((card) => /^[2-9TJQKA][cdhs]$/.test(String(card)))
    && Array.isArray(spot.actions)
    && spot.actions.length >= 2
    && new Set(spot.actions).size === spot.actions.length
    && spot.actions.every((action) => typeof action === 'string' && action.length > 0)
    && isPlainRecord(spot.gridData)
    && gridRows.length > 0
    && Number.isSafeInteger(spot.handCount)
    && spot.handCount === gridRows.length
    && handEVs.length > 0
    && handEVs.every(Number.isFinite)
    && isPlainRecord(decisionNode)
    && decisionNode.node === spot.node
    && decisionNode.actorRole === spot.actorRole
    && Number.isFinite(decisionNode.potBb)
    && decisionNode.potBb > 0
    && Number.isFinite(decisionNode.effectiveStackBb)
    && decisionNode.effectiveStackBb > 0
    && provenance?.verified === true
    && provenance.source === 'PioSOLVER'
    && provenance.qualityStatus === 'validated'
    && Boolean(provenance.solverVersion)
    && ['M1', 'M2'].includes(String(provenance.machineId || ''))
    && /^[0-9a-f]{40}$/i.test(String(provenance.pipelineCommit || ''))
    && Boolean(provenance.manifestVersion)
    && Boolean(provenance.auditedAt)
    && provenance.auditedAt === spot.auditedAt
  );
}

function formatAuditedAt(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Verified Timestamp Unavailable' : parsed.toLocaleString();
}

function AuditedProvenanceSeal({ spot = null }) {
  const provenance = spot?.provenance;
  return (
    <div
      data-testid={spot ? 'solver-provenance-seal' : 'solver-catalog-authority-seal'}
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        marginTop: spot ? 0 : 12,
        marginBottom: spot ? 12 : 0,
        background: 'linear-gradient(135deg, rgba(0,212,255,0.10), rgba(34,197,94,0.06))',
        border: '1px solid rgba(0,212,255,0.28)',
        borderRadius: 8,
        color: 'var(--sp-fg-muted)',
        flexWrap: 'wrap',
      }}
    >
      <span aria-hidden="true" style={{ color: 'var(--sp-accent-green)', fontSize: 18 }}>◆</span>
      <div style={{ flex: '1 1 220px' }}>
        <div style={{ color: 'var(--sp-fg)', fontSize: 12, fontWeight: 800, letterSpacing: 0.7 }}>
          Audited PioSOLVER • Provenance-Complete V2 Only
        </div>
        <div style={{ color: 'var(--sp-fg-dim)', fontSize: 12, marginTop: 2 }}>
          {spot
            ? `Validated On ${formatAuditedAt(provenance?.auditedAt)}`
            : 'Legacy, Partial, And Unverified Solver Rows Are Never Displayed.'}
        </div>
      </div>
      {spot && (
        <div style={{ fontSize: 12, color: 'var(--sp-accent-cyan)', textAlign: 'right' }}>
          <div>Solver {provenance.solverVersion} • Machine {provenance.machineId}</div>
          <div>Manifest {provenance.manifestVersion} • Pipeline {provenance.pipelineCommit.slice(0, 8)}</div>
        </div>
      )}
    </div>
  );
}

function AuditedStrategyReport({ spot, classificationGroups }) {
  const evSummary = useMemo(() => {
    const values = Object.values(spot?.handEVs || {}).filter(Number.isFinite);
    if (values.length === 0) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      count: values.length,
      mean: total / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    };
  }, [spot]);

  const decisionNode = spot?.decisionNode || {};
  return (
    <div
      data-testid="audited-strategy-report"
      style={{
        width: '100%',
        padding: 18,
        background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
        border: '1px solid rgba(0,212,255,0.18)',
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--sp-accent-cyan)', marginBottom: 4 }}>
        Audited Strategy Report
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--sp-fg-dim)' }}>
        Action Frequencies And Hand EVs Come From This Verified V2 Artifact. Hand Labels Are Derived Locally From The Displayed Flop.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
        {[
          ['Decision Node', decisionNode.node || spot.node || 'Unavailable'],
          ['Acting Seat', decisionNode.actorRole || spot.actorRole || 'Unavailable'],
          ['Pot', Number.isFinite(decisionNode.potBb) ? `${decisionNode.potBb.toFixed(2)} BB` : 'Unavailable'],
          ['Effective Stack', Number.isFinite(decisionNode.effectiveStackBb) ? `${decisionNode.effectiveStackBb.toFixed(2)} BB` : 'Unavailable'],
          ['Strategy Hand Classes', String(spot.handCount)],
          ['Hand EV Coverage', evSummary ? `${evSummary.count} Classes` : 'Unavailable'],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{label}</div>
            <div style={{ marginTop: 3, fontSize: 12, color: 'var(--sp-fg)', fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div>
          </div>
        ))}
      </div>

      {evSummary && (
        <div style={{ marginBottom: 14, padding: 10, background: 'rgba(34,197,94,0.045)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginBottom: 4 }}>Returned Hand-Class EV Values (BB)</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, fontWeight: 700 }}>
            <span>Mean {evSummary.mean.toFixed(2)}</span>
            <span>Low {evSummary.minimum.toFixed(2)}</span>
            <span>High {evSummary.maximum.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Locally Derived Hand Classifications
      </div>
      {classificationGroups.length > 0 ? classificationGroups.map((group) => (
        <div key={group.classification} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ width: 110, color: group.color, fontSize: 12, fontWeight: 700 }}>{group.label}</span>
          <span style={{ color: 'var(--sp-fg-muted)', fontSize: 12 }}>{group.handCount} Hand Classes</span>
          <span style={{ marginLeft: 'auto', color: 'var(--sp-fg-dim)', fontSize: 12 }}>
            {Object.entries(group.actionSummary || {})
              .filter(([, percent]) => percent > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([action, percent]) => `${action.toUpperCase()} ${Number(percent).toFixed(0)}%`)
              .join(' • ') || 'No Action Frequency'}
          </span>
        </div>
      )) : (
        <p style={{ color: 'var(--sp-fg-dim)', fontSize: 12 }}>No Local Classification Could Be Derived For This Audited Flop.</p>
      )}
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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

  return <SolutionsBrowserInner />;
}

function SolutionsBrowserInner() {
  useTrainingBus('solutions-browser');
  const router = useRouter();

  const { filters, setFilter } = usePersistedFilters('solutions-browser', {
    gameType: 'hu_cash',
    stackDepth: 100,
    position: '',
    colorMode: 'action',
    rxTexture: 'All',
  });

  const requestedGameType = filters.gameType;
  const gameType = Object.prototype.hasOwnProperty.call(STACK_DEPTHS, requestedGameType)
    ? requestedGameType
    : 'hu_cash';
  const validStacks = STACK_DEPTHS[gameType];
  const requestedStackDepth = Number(filters.stackDepth);
  const stackDepth = validStacks.includes(requestedStackDepth)
    ? requestedStackDepth
    : (validStacks.includes(100) ? 100 : validStacks[0]);
  const position = POSITIONS.includes(filters.position) ? filters.position : '';
  const colorMode = ['action', 'classification'].includes(filters.colorMode)
    ? filters.colorMode
    : 'action';
  const boardTexture = BOARD_TEXTURES.includes(filters.rxTexture) ? filters.rxTexture : 'All';

  const setGameType = (v) => setFilter('gameType', v);
  const setStackDepth = (v) => setFilter('stackDepth', v);
  const setPosition = (v) => setFilter('position', v);
  const setColorMode = (v) => setFilter('colorMode', v);

  const [page, setPage] = useState(1);

  // Data
  const [spots, setSpots] = useState([]);
  const [returnedCount, setReturnedCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Selected spot detail
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [spotDetail, setSpotDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Phase 15: Color mode & classification
  const [classificationData, setClassificationData] = useState(null);
  const [classificationGroups, setClassificationGroups] = useState([]);

  const [activeTab, setActiveTab] = useState('grid');
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);

  // Available stack depths for current game type
  const availableStacks = useMemo(() => STACK_DEPTHS[gameType] || [100], [gameType]);

  // Normalize any obsolete values left in persisted filters without issuing an
  // invalid catalog request first.
  useEffect(() => {
    if (requestedGameType !== gameType) setFilter('gameType', gameType);
    if (Number(filters.stackDepth) !== stackDepth) setFilter('stackDepth', stackDepth);
    if (filters.position && !position) setFilter('position', '');
    if (filters.colorMode !== colorMode) setFilter('colorMode', colorMode);
    if (filters.rxTexture !== boardTexture) setFilter('rxTexture', boardTexture);
  }, [boardTexture, colorMode, filters.colorMode, filters.position, filters.rxTexture, filters.stackDepth, gameType, position, requestedGameType, setFilter, stackDepth]);

  useEffect(() => {
    detailRequestId.current += 1;
    setPage(1);
    setSelectedSpot(null);
    setSpotDetail(null);
    setLoadingDetail(false);
    setDetailError(null);
    setClassificationData(null);
    setClassificationGroups([]);
    setActiveTab('grid');
  }, [gameType, stackDepth]);

  useEffect(() => {
    detailRequestId.current += 1;
    setSelectedSpot(null);
    setSpotDetail(null);
    setLoadingDetail(false);
    setDetailError(null);
    setClassificationData(null);
    setClassificationGroups([]);
    setActiveTab('grid');
  }, [page, position]);

  // Phase 16: Range Locking
  const [lockedClassifications, setLockedClassifications] = useState([]);

  // Phase 16: Bookmarks
  const [bookmarkedHashes, setBookmarkedHashes] = useState(new Set());
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [bookmarkError, setBookmarkError] = useState(null);

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
    } catch (error) {
      const message = error?.message || String(error);
      console.warn('[Solutions] Board classification engine unavailable; using local fallback:', message);
    }

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
        const res = await trainingFetch('/api/training/bookmark-solution');
        const data = await res.json();
        if (!res.ok || data?.success !== true || !Array.isArray(data.bookmarks)) {
          throw new Error(data?.error || `HTTP error! status: ${res.status}`);
        }
        setBookmarkedHashes(new Set(data.bookmarks.map((b) => b.scenario_hash)));
        setBookmarkError(null);
      } catch (e) {
        console.warn('[Solutions] Bookmarks fetch failed:', e);
        setBookmarkError('Bookmarks Could Not Be Loaded. Retry When Your Connection Is Available.');
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
        setBookmarkError(null);
        const res = await trainingFetch('/api/training/bookmark-solution', {
          method: 'POST',
          
          body: JSON.stringify({ scenarioHash: hash, spotId: spot.id, action }),
        });
        const body = await res.json().catch(() => null);
        const validSave = action !== 'save' || Boolean(body?.bookmarkId);
        const validAction = isBookmarked
          ? body?.action === 'deleted'
          : body?.action === 'saved' || body?.action === 'updated';
        if (!res.ok || body?.success !== true || !validAction || !validSave) {
          throw new Error(body?.error || `HTTP error! status: ${res.status}`);
        }
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
        setBookmarkError('Bookmark Change Was Not Saved. Your Display Has Not Been Changed.');
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
    const requestId = ++listRequestId.current;
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        gameType,
        stackDepth: stackDepth.toString(),
        street: BROWSE_STREET,
        page: page.toString(),
        limit: '30',
      });
      if (position) params.set('position', position);

      const res = await trainingFetch(`/api/training/browse-solutions?${params}`);
      if (res.status === 401) {
        await router.replace('/auth/login?redirect=/hub/training/solutions');
        return;
      }
      const data = await res.json().catch(() => null);
      if (requestId !== listRequestId.current) return;
      if (!res.ok || !isAuditedListResponse(data, { gameType, stackDepth, page })) {
        throw new Error(data?.error || 'Audited solver catalog response did not pass validation');
      }
      setSpots(data.spots);
      setReturnedCount(data.returnedCount);
      setHasMore(data.hasMore);
    } catch (err) {
      if (requestId !== listRequestId.current) return;
      console.warn('[Solutions] Fetch error:', err);
      setSpots([]);
      setReturnedCount(0);
      setHasMore(false);
      setFetchError('Audited PioSOLVER Artifacts Are Temporarily Unavailable. No Unverified Fallback Will Be Shown.');
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [gameType, stackDepth, position, page, router]);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  // Fetch full spot detail (with 13×13 grid)
  const loadSpotDetail = useCallback(async (spotId) => {
    const requestId = ++detailRequestId.current;
    setLoadingDetail(true);
    setSelectedSpot(spotId);
    setSpotDetail(null);
    setDetailError(null);
    setActiveTab('grid');
    try {
      const res = await trainingFetch(`/api/training/browse-solutions?spotId=${spotId}`);
      if (res.status === 401) {
        await router.replace('/auth/login?redirect=/hub/training/solutions');
        return;
      }
      const data = await res.json().catch(() => null);
      if (requestId !== detailRequestId.current) return;
      if (!res.ok || data?.success !== true || !isAuditedSpot(data.spot)) {
        throw new Error(data?.error || 'Solver artifact did not pass provenance validation');
      }
      setSpotDetail(data.spot);
    } catch (err) {
      if (requestId !== detailRequestId.current) return;
      console.warn('[Solutions] Detail fetch error:', err);
      setDetailError('This Artifact Could Not Be Verified. No Legacy Or Partial Strategy Will Be Displayed.');
    } finally {
      if (requestId === detailRequestId.current) setLoadingDetail(false);
    }
  }, [router]);

  const visibleSpots = spots
    .filter((spot) => {
      if (!showBookmarksOnly) return true;
      const hash = spot.scenarioHash || spot.scenario_hash;
      return hash && bookmarkedHashes.has(hash);
    })
    .filter((spot) => {
      if (boardTexture === 'All') return true;
      const boardCards = spot.board || [];
      return classifyBoardTexture(boardCards).includes(boardTexture);
    });

  return (
    <>
      <Head>
        <title>GTO Solutions Browser | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Browse provenance-complete PioSOLVER v2 flop artifacts with audited action frequencies and hand-class EVs."
        />
      </Head>

      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
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
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              GTO Solutions
            </h1>
            <span
              style={{
                fontSize: 12,
                color: 'var(--sp-fg-dim)',
                background: 'rgba(255,255,255,0.04)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 600,
              }}
            >
              Flop • Page {page} • {returnedCount} Returned
            </span>
          </div>

          <AuditedProvenanceSeal />

          {/* Filters Row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
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
                  fontSize: 12,
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
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s',
                    background:
                      stackDepth === sd ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                    color: stackDepth === sd ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
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
                  fontSize: 12,
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
                  fontSize: 12,
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
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: position === p ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                    color: position === p ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Phase 17: Board Texture Filter */}
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--sp-fg-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>This Page Texture:</span>
              {BOARD_TEXTURES.map((tex) => (
                <button
                  key={tex}
                  onClick={() => {
                    setFilter('rxTexture', tex);
                    setPage(1);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 12,
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
            minHeight: 'calc(100dvh - 160px)',
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
                  {fetchError
                    ? 'The Audited Solver Catalog Is Unavailable'
                    : 'No Provenance-Complete Flop Artifacts Found'}
                </p>
                <p style={{ color: 'var(--sp-fg-faint)', fontSize: 12, marginTop: 4 }}>
                  {fetchError
                    ? 'No Legacy Or Partially Audited Row Has Been Substituted.'
                    : 'Try A Different Verified Family, Stack Depth, Or Position.'}
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
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      background: !showBookmarksOnly
                        ? 'rgba(0,212,255,0.15)'
                        : 'rgba(255,255,255,0.04)',
                      color: !showBookmarksOnly ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                      transition: 'all 0.15s',
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
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
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      background: showBookmarksOnly
                        ? 'rgba(251,191,36,0.15)'
                        : 'rgba(255,255,255,0.04)',
                      color: showBookmarksOnly ? 'var(--sp-accent-amber)' : 'var(--sp-fg-dim)',
                      transition: 'all 0.15s',
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}
                  >
                    ★ BOOKMARKS
                  </button>
                </div>
                {visibleSpots.length === 0 ? (
                  <div role="status" style={{ padding: '28px 12px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--sp-fg-dim)', fontSize: 12, margin: 0 }}>
                      No Returned Spots Match This Page Filter
                    </p>
                    <p style={{ color: 'var(--sp-fg-faint)', fontSize: 12, marginTop: 5 }}>
                      Clear The Bookmark Or Texture Filter. Use Next To Inspect Another Audited Page When Available.
                    </p>
                  </div>
                ) : visibleSpots.map((spot) => (
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
                {(page > 1 || hasMore) && (
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
                        fontSize: 12,
                        color: 'var(--sp-fg-dim)',
                        padding: '6px 8px',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      }}
                    >
                      Page {page} • {returnedCount} Returned
                    </span>
                    <button
                      disabled={!hasMore}
                      onClick={() => setPage((currentPage) => currentPage + 1)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        background: 'rgba(255,255,255,0.06)',
                        color: 'var(--sp-fg-muted)',
                        border: 'none',
                        cursor: hasMore ? 'pointer' : 'not-allowed',
                        opacity: hasMore ? 1 : 0.4,
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
            {detailError && !loadingDetail ? (
              <div role="alert" style={{ padding: 32, textAlign: 'center', maxWidth: 440 }}>
                <p style={{ color: 'var(--sp-accent-red)', fontSize: 13, fontWeight: 700, margin: 0 }}>
                  Artifact Verification Failed
                </p>
                <p style={{ color: 'var(--sp-fg-dim)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
                  {detailError}
                </p>
                {selectedSpot && (
                  <button
                    onClick={() => loadSpotDetail(selectedSpot)}
                    style={{
                      marginTop: 8,
                      padding: '7px 14px',
                      border: '1px solid rgba(0,212,255,0.3)',
                      borderRadius: 7,
                      background: 'rgba(0,212,255,0.08)',
                      color: 'var(--sp-accent-cyan)',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Retry Audited Lookup
                  </button>
                )}
              </div>
            ) : !spotDetail && !loadingDetail ? (
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
                <p style={{ color: 'var(--sp-fg-dim)', fontSize: 14 }}>Select An Audited Flop Artifact</p>
                <p style={{ color: 'var(--sp-fg-faint)', fontSize: 12 }}>
                  Inspect Its 13×13 Strategy Grid, Actual Hand EVs, And Verified Provenance.
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
                <p style={{ color: 'var(--sp-fg-muted)', fontSize: 13 }}>Verifying PioSOLVER V2 Artifact...</p>
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
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      }}
                    >
                      {spotDetail.heroPosition}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', marginTop: 2 }}>
                      {spotDetail.stackDepth}BB {spotDetail.gameType} • {spotDetail.handCount} Hand Classes With Strategy
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(spotDetail.actions || []).map((a) => (
                      <span
                        key={a}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.06)',
                          color: 'var(--sp-fg-muted)',
                          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        }}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>

                <AuditedProvenanceSeal spot={spotDetail} />

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
                      { key: 'ev', label: 'Hand EV' },
                      { key: 'report', label: 'Audited Report' },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        aria-label={`View ${tab.label}`}
                        aria-pressed={activeTab === tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          fontSize: 12,
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

                  {/* Color Mode Toggle */}
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
                              fontSize: 12,
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
                      </div>
                    )}
                  </div>
                </div>

                {/* Main Content Area */}
                {activeTab === 'grid' ? (
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
                    <RangeGrid
                      gridData={spotDetail.gridData}
                      actions={spotDetail.actions}
                      cellSize={34}
                      classificationData={classificationData}
                      colorMode={colorMode}
                      handEVs={spotDetail.handEVs}
                      lockedClassifications={lockedClassifications}
                    />

                    {classificationGroups.length > 0 && (
                      <ClassificationSidebar
                        groups={classificationGroups}
                        actions={spotDetail.actions}
                        lockedClassifications={lockedClassifications}
                        onToggleLock={toggleClassificationLock}
                      />
                    )}
                  </div>
                ) : activeTab === 'ev' ? (
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sp-accent-cyan)',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        marginBottom: 12,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      Audited Hand-Class EV (BB)
                    </div>
                    <RangeGrid
                      gridData={spotDetail.gridData}
                      actions={spotDetail.actions}
                      cellSize={34}
                      colorMode="action"
                      handEVs={spotDetail.handEVs}
                      showEVOverlay
                    />
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)',
                        fontSize: 12,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      Each Number Is The Mean Hand-Class EV Exported In This Verified V2 Artifact. Empty Cells Stay Empty; No Missing Metric Is Inferred.
                    </div>
                  </div>
                ) : activeTab === 'report' ? (
                  <AuditedStrategyReport
                    spot={spotDetail}
                    classificationGroups={classificationGroups}
                  />
                ) : null}
              </motion.div>
            ) : null}
          </div>
        </div>
      </div>

      {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchSpots(); }} />}
      {bookmarkError && <ErrorBanner message={bookmarkError} onRetry={() => setBookmarkError(null)} />}
      <ConnectionToast />
    </>
  );
}
