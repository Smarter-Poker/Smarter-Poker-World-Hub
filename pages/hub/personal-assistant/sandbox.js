/**
 * VIRTUAL SANDBOX — Theoretical Hand Exploration
 * /hub/personal-assistant/sandbox
 *
 * A simulation and exploration environment, NOT a coach.
 * Every sandbox run is treated as a self-contained theoretical experiment.
 *
 * INTEGRITY BADGE: Not Live Play - No Real-Time Advice
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useSandboxAnalysis, useArchetypes } from '../../../src/hooks/useAssistant';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const POSITIONS = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

const VILLAIN_ARCHETYPES = [
  { id: 'gto_neutral', name: 'GTO Neutral', color: '#6b7280' },
  { id: 'tight_passive', name: 'Tight Passive', color: '#3b82f6' },
  { id: 'loose_passive', name: 'Calling Station', color: '#22c55e' },
  { id: 'tight_aggressive', name: 'Tight Agg', color: '#f59e0b' },
  { id: 'loose_aggressive', name: 'LAG', color: '#ef4444' },
  { id: 'over_bluffer', name: 'Over-Bluffer', color: '#ec4899' },
  { id: 'under_bluffer', name: 'Under-Bluffer', color: '#8b5cf6' },
  { id: 'fit_or_fold', name: 'Fit-or-Fold', color: '#64748b' },
  { id: 'icm_scared', name: 'ICM-Scared', color: '#0ea5e9' },
  { id: 'icm_pressure', name: 'ICM-Pressure', color: '#dc2626' },
];

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { symbol: 's', name: 'spades', color: '#1a1a2e' },
  { symbol: 'h', name: 'hearts', color: '#dc2626' },
  { symbol: 'd', name: 'diamonds', color: '#2563eb' },
  { symbol: 'c', name: 'clubs', color: '#16a34a' },
];

const BET_SIZING_PRESETS = [
  { id: 'standard', name: 'Standard', sizes: ['33%', '66%'] },
  { id: 'wide', name: 'Wide', sizes: ['25%', '50%', '75%', '100%'] },
  { id: 'polar', name: 'Polar', sizes: ['33%', '150%'] },
];

// ═══════════════════════════════════════════════════════════════════════════
// CARD PICKER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CardPicker({ value, onChange, label, usedCards = [] }) {
  const [isOpen, setIsOpen] = useState(false);

  const parseCard = (cardStr) => {
    if (!cardStr || cardStr.length < 2) return null;
    return {
      rank: cardStr[0],
      suit: cardStr[1],
    };
  };

  const card = parseCard(value);
  const suitData = card ? SUITS.find(s => s.symbol === card.suit) : null;

  const getSuitSymbol = (suit) => {
    switch (suit) {
      case 's': return '\u2660';
      case 'h': return '\u2665';
      case 'd': return '\u2666';
      case 'c': return '\u2663';
      default: return '';
    }
  };

  const isCardUsed = (rank, suit) => {
    return usedCards.includes(`${rank}${suit}`);
  };

  return (
    <div style={cardPickerStyles.container}>
      {label && <span style={cardPickerStyles.label}>{label}</span>}
      <div
        style={{
          ...cardPickerStyles.cardDisplay,
          background: card ? '#fff' : 'rgba(255, 255, 255, 0.1)',
          border: card ? '2px solid #333' : '2px dashed rgba(255, 255, 255, 0.3)',
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {card ? (
          <>
            <span style={{ ...cardPickerStyles.cardRank, color: suitData?.color || '#000' }}>
              {card.rank}
            </span>
            <span style={{ color: suitData?.color || '#000', fontSize: 18 }}>
              {getSuitSymbol(card.suit)}
            </span>
          </>
        ) : (
          <span style={cardPickerStyles.placeholder}>?</span>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            style={cardPickerStyles.dropdown}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div style={cardPickerStyles.grid}>
              {RANKS.map(rank => (
                <div key={rank} style={cardPickerStyles.rankRow}>
                  {SUITS.map(suit => {
                    const cardValue = `${rank}${suit.symbol}`;
                    const used = isCardUsed(rank, suit.symbol);
                    return (
                      <button
                        key={cardValue}
                        style={{
                          ...cardPickerStyles.cardOption,
                          background: used ? 'rgba(100, 100, 100, 0.3)' : '#fff',
                          opacity: used ? 0.3 : 1,
                          cursor: used ? 'not-allowed' : 'pointer',
                        }}
                        onClick={() => {
                          if (!used) {
                            onChange(cardValue);
                            setIsOpen(false);
                          }
                        }}
                        disabled={used}
                      >
                        <span style={{ color: suit.color, fontWeight: 700 }}>{rank}</span>
                        <span style={{ color: suit.color, fontSize: 10 }}>{getSuitSymbol(suit.symbol)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {value && (
              <button
                style={cardPickerStyles.clearBtn}
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const cardPickerStyles = {
  container: {
    position: 'relative',
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
  },
  cardDisplay: {
    width: 44,
    height: 60,
    borderRadius: 6,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
  },
  cardRank: {
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1,
  },
  placeholder: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: 8,
    background: '#1a2a44',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 12,
    zIndex: 1000,
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  rankRow: {
    display: 'flex',
    gap: 2,
  },
  cardOption: {
    width: 32,
    height: 36,
    borderRadius: 4,
    border: '1px solid #ddd',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    transition: 'all 0.15s ease',
  },
  clearBtn: {
    width: '100%',
    marginTop: 8,
    padding: '8px 0',
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 12,
    cursor: 'pointer',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// POKER TABLE CANVAS
// ═══════════════════════════════════════════════════════════════════════════

function PokerTableCanvas({ heroHand, heroPosition, heroStack, villains, board, potSize }) {
  const getSuitSymbol = (suit) => {
    switch (suit) {
      case 's': return '\u2660';
      case 'h': return '\u2665';
      case 'd': return '\u2666';
      case 'c': return '\u2663';
      default: return '';
    }
  };

  const getSuitColor = (suit) => {
    switch (suit) {
      case 'h': case 'd': return '#dc2626';
      default: return '#1a1a2e';
    }
  };

  const renderCard = (cardStr, size = 'normal') => {
    if (!cardStr) return null;
    const rank = cardStr[0];
    const suit = cardStr[1];
    const isSmall = size === 'small';

    return (
      <div style={{
        width: isSmall ? 28 : 36,
        height: isSmall ? 40 : 52,
        background: '#fff',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
        border: '1px solid #ccc',
      }}>
        <span style={{ color: getSuitColor(suit), fontWeight: 800, fontSize: isSmall ? 14 : 18, lineHeight: 1 }}>
          {rank}
        </span>
        <span style={{ color: getSuitColor(suit), fontSize: isSmall ? 10 : 14 }}>
          {getSuitSymbol(suit)}
        </span>
      </div>
    );
  };

  // Calculate villain positions around the table
  const getVillainPosition = (index, total) => {
    // Positions start from top-left, go clockwise, hero is always at bottom center
    const angleOffset = -90; // Start from top
    const angleStep = 180 / (total + 1);
    const angle = (angleOffset + angleStep * (index + 1)) * (Math.PI / 180);

    const radiusX = 180;
    const radiusY = 100;

    return {
      left: `calc(50% + ${Math.cos(angle) * radiusX}px)`,
      top: `calc(45% + ${Math.sin(angle) * radiusY}px)`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div style={tableStyles.container}>
      {/* Poker Table */}
      <div style={tableStyles.table}>
        {/* Table felt */}
        <div style={tableStyles.felt}>
          {/* Rail */}
          <div style={tableStyles.rail} />

          {/* Board Cards */}
          <div style={tableStyles.boardArea}>
            {/* Pot Display */}
            {potSize > 0 && (
              <div style={tableStyles.potDisplay}>
                Pot: {potSize} BB
              </div>
            )}

            {/* Community Cards */}
            <div style={tableStyles.communityCards}>
              {board.flop && board.flop.map((card, i) => (
                <div key={`flop-${i}`}>{renderCard(card)}</div>
              ))}
              {board.turn && renderCard(board.turn)}
              {board.river && renderCard(board.river)}
              {(!board.flop || board.flop.length === 0) && (
                <span style={tableStyles.noBoardText}>Set board cards below</span>
              )}
            </div>
          </div>

          {/* Villains */}
          {villains.map((villain, index) => (
            <div
              key={villain.seat}
              style={{
                ...tableStyles.playerSeat,
                ...getVillainPosition(index, villains.length),
              }}
            >
              <div style={tableStyles.villainBox}>
                <span style={tableStyles.villainArchetype}>{villain.archetype?.name || 'GTO'}</span>
                <span style={tableStyles.villainStack}>{villain.stack} BB</span>
              </div>
              {/* Face-down cards */}
              <div style={tableStyles.holeCards}>
                <div style={tableStyles.faceDownCard} />
                <div style={{ ...tableStyles.faceDownCard, marginLeft: -8 }} />
              </div>
            </div>
          ))}

          {/* Hero */}
          <div style={tableStyles.heroSeat}>
            <div style={tableStyles.heroCards}>
              {renderCard(heroHand.card1)}
              {renderCard(heroHand.card2)}
            </div>
            <div style={tableStyles.heroInfo}>
              <span style={tableStyles.heroLabel}>Hero</span>
              <span style={tableStyles.heroStack}>{heroStack} BB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const tableStyles = {
  container: {
    width: '100%',
    height: 320,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  table: {
    width: '100%',
    maxWidth: 480,
    height: 280,
    position: 'relative',
  },
  felt: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(180deg, #1e5a3a 0%, #0d3a24 100%)',
    borderRadius: '50%/40%',
    position: 'relative',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 2px 20px rgba(0, 0, 0, 0.3)',
    border: '12px solid #4a3728',
  },
  rail: {
    position: 'absolute',
    top: -12,
    left: -12,
    right: -12,
    bottom: -12,
    borderRadius: '50%/40%',
    border: '4px solid #2a1f14',
    pointerEvents: 'none',
  },
  boardArea: {
    position: 'absolute',
    top: '35%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  potDisplay: {
    background: 'rgba(0, 0, 0, 0.6)',
    padding: '6px 16px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
  },
  communityCards: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  noBoardText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    fontStyle: 'italic',
  },
  playerSeat: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  villainBox: {
    background: 'rgba(26, 42, 68, 0.95)',
    padding: '8px 12px',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  villainArchetype: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
  },
  villainStack: {
    fontSize: 12,
    fontWeight: 700,
    color: '#64b5f6',
  },
  holeCards: {
    display: 'flex',
    marginTop: 4,
  },
  faceDownCard: {
    width: 24,
    height: 34,
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d1f3c 100%)',
    borderRadius: 3,
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
  },
  heroSeat: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  heroCards: {
    display: 'flex',
    gap: 4,
  },
  heroInfo: {
    background: 'rgba(26, 42, 68, 0.95)',
    padding: '8px 16px',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    border: '2px solid #64b5f6',
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
  },
  heroStack: {
    fontSize: 13,
    fontWeight: 700,
    color: '#64b5f6',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GTO RESULTS PANEL
// ═══════════════════════════════════════════════════════════════════════════

function GTOResultsPanel({ results, isLoading }) {
  if (isLoading) {
    return (
      <div style={resultsStyles.container}>
        <div style={resultsStyles.loading}>Analyzing scenario...</div>
      </div>
    );
  }

  if (!results) {
    return (
      <div style={resultsStyles.container}>
        <div style={resultsStyles.placeholder}>
          Configure your scenario and click "Run Theoretical Analysis" to see GTO results.
        </div>
      </div>
    );
  }

  return (
    <div style={resultsStyles.container}>
      <h3 style={resultsStyles.title}>GTO Analysis Results</h3>

      {/* Primary Action */}
      <div style={resultsStyles.primaryAction}>
        <span style={resultsStyles.primaryLabel}>Primary GTO Action:</span>
        <span style={resultsStyles.primaryValue}>
          {results.primaryAction}
          <span style={resultsStyles.primaryFreq}> — {results.primaryFrequency}%</span>
        </span>
      </div>

      {/* Alternative Actions */}
      {results.alternatives && results.alternatives.length > 0 && (
        <div style={resultsStyles.alternatives}>
          <span style={resultsStyles.altLabel}>Other GTO Options:</span>
          <ul style={resultsStyles.altList}>
            {results.alternatives.map((alt, i) => (
              <li key={i} style={resultsStyles.altItem}>
                {alt.action} — <span style={resultsStyles.altFreq}>{alt.frequency}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Context Strip */}
      <div style={resultsStyles.contextStrip}>
        <span>{results.context}</span>
        <span style={resultsStyles.divider}>|</span>
        <span style={{ color: '#64b5f6' }}>{results.source}</span>
        <span style={resultsStyles.divider}>|</span>
        <span>Confidence: <span style={{ color: results.confidence === 'High' ? '#22c55e' : '#f59e0b' }}>{results.confidence}</span></span>
      </div>

      {/* Why Not Section */}
      {results.whyNot && (
        <div style={resultsStyles.whyNot}>
          <span style={resultsStyles.whyNotLabel}>Why not check more?</span>
          <p style={resultsStyles.whyNotText}>{results.whyNot}</p>
        </div>
      )}
    </div>
  );
}

const resultsStyles = {
  container: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 20,
  },
  loading: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
    padding: 40,
  },
  placeholder: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.4)',
    padding: 40,
    fontSize: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  primaryAction: {
    marginBottom: 16,
  },
  primaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginRight: 8,
  },
  primaryValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
  },
  primaryFreq: {
    color: '#22c55e',
    fontWeight: 600,
  },
  alternatives: {
    marginBottom: 16,
  },
  altLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    display: 'block',
    marginBottom: 8,
  },
  altList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  altItem: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    padding: '4px 0',
  },
  altFreq: {
    color: '#f59e0b',
  },
  contextStrip: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    padding: '12px 0',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  divider: {
    color: 'rgba(255, 255, 255, 0.2)',
  },
  whyNot: {
    marginTop: 16,
    padding: 16,
    background: 'rgba(100, 181, 246, 0.08)',
    borderRadius: 8,
    borderLeft: '3px solid #64b5f6',
  },
  whyNotLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#64b5f6',
    display: 'block',
    marginBottom: 8,
  },
  whyNotText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 1.5,
    margin: 0,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SANDBOX PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function VirtualSandboxPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Hero state
  const [heroCard1, setHeroCard1] = useState('As');
  const [heroCard2, setHeroCard2] = useState('Qd');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [heroStack, setHeroStack] = useState(100);
  const [gameType, setGameType] = useState('cash');

  // Table state
  const [numOpponents, setNumOpponents] = useState(5);
  const [villains, setVillains] = useState([
    { seat: 1, archetype: VILLAIN_ARCHETYPES[3], stack: 95 },
    { seat: 2, archetype: VILLAIN_ARCHETYPES[0], stack: 110 },
    { seat: 3, archetype: VILLAIN_ARCHETYPES[2], stack: 85 },
    { seat: 4, archetype: VILLAIN_ARCHETYPES[3], stack: 75 },
    { seat: 5, archetype: VILLAIN_ARCHETYPES[3], stack: 75 },
  ]);

  // Board state
  const [boardFlop, setBoardFlop] = useState(['Qc', '7h', '3s']);
  const [boardTurn, setBoardTurn] = useState('Ad');
  const [boardRiver, setBoardRiver] = useState(null);

  // Bet sizing
  const [betSizing, setBetSizing] = useState('standard');

  // Use the real analysis hook
  const { analyze, isAnalyzing, results, error: analysisError } = useSandboxAnalysis();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get all used cards
  const getUsedCards = useCallback(() => {
    const used = [];
    if (heroCard1) used.push(heroCard1);
    if (heroCard2) used.push(heroCard2);
    if (boardFlop) used.push(...boardFlop.filter(Boolean));
    if (boardTurn) used.push(boardTurn);
    if (boardRiver) used.push(boardRiver);
    return used;
  }, [heroCard1, heroCard2, boardFlop, boardTurn, boardRiver]);

  // Update villain archetype
  const updateVillainArchetype = (seat, archetypeId) => {
    setVillains(villains.map(v =>
      v.seat === seat
        ? { ...v, archetype: VILLAIN_ARCHETYPES.find(a => a.id === archetypeId) }
        : v
    ));
  };

  // Run analysis using real API
  const runAnalysis = async () => {
    await analyze({
      heroHand: { card1: heroCard1, card2: heroCard2 },
      heroPosition,
      heroStack,
      gameType,
      villains,
      board: {
        flop: boardFlop.filter(Boolean),
        turn: boardTurn,
        river: boardRiver,
      },
      betSizing,
      potSize: 22, // TODO: Calculate from action
    });
  };

  if (!mounted) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingText}>Loading Sandbox...</div>
      </div>
    );
  }

  return (
    <PageTransition>
      <Head>
        <title>Virtual Sandbox — Smarter.Poker</title>
        <meta name="description" content="Theoretical hand exploration with GTO analysis" />
        <meta name="viewport" content="width=800, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          .sandbox-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
          @media (max-width: 500px) { .sandbox-page { zoom: 0.5; } }
          @media (min-width: 501px) and (max-width: 700px) { .sandbox-page { zoom: 0.75; } }
          @media (min-width: 701px) and (max-width: 900px) { .sandbox-page { zoom: 0.95; } }
          @media (min-width: 901px) { .sandbox-page { zoom: 1.2; } }
          @media (min-width: 1400px) { .sandbox-page { zoom: 1.5; } }
        `}</style>
      </Head>

      <div className="sandbox-page" style={styles.container}>
        <div style={styles.bgGrid} />
        <UniversalHeader pageDepth={2} />

        {/* Top Bar */}
        <div style={styles.topBar}>
          <div style={styles.topBarLeft}>
            <span style={styles.brandText}>Smarter.Poker</span>
            <span style={styles.divider}>|</span>
            <span style={styles.pageLabel}>Virtual Sandbox</span>
            <span style={styles.pageSublabel}>— Theoretical Exploration</span>
          </div>
          <div style={styles.topBarRight}>
            <div style={styles.integrityBadge}>
              <span style={styles.lockIcon}>&#128274;</span>
              Not Live Play - No Real-Time Advice
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div style={styles.mainLayout}>
          {/* Left Panel - Controls */}
          <div style={styles.leftPanel}>
            <h3 style={styles.sectionTitle}>Sandbox Setup</h3>

            {/* Hero Settings */}
            <div style={styles.controlSection}>
              <h4 style={styles.controlTitle}>Hero Settings</h4>

              <div style={styles.controlRow}>
                <label style={styles.controlLabel}>Hand:</label>
                <div style={styles.cardRow}>
                  <CardPicker
                    value={heroCard1}
                    onChange={setHeroCard1}
                    usedCards={getUsedCards().filter(c => c !== heroCard1)}
                  />
                  <CardPicker
                    value={heroCard2}
                    onChange={setHeroCard2}
                    usedCards={getUsedCards().filter(c => c !== heroCard2)}
                  />
                </div>
              </div>

              <div style={styles.controlRow}>
                <label style={styles.controlLabel}>Position:</label>
                <select
                  style={styles.select}
                  value={heroPosition}
                  onChange={(e) => setHeroPosition(e.target.value)}
                >
                  {POSITIONS.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>

              <div style={styles.controlRow}>
                <label style={styles.controlLabel}>Stack:</label>
                <div style={styles.stackInput}>
                  <input
                    type="number"
                    style={styles.numberInput}
                    value={heroStack}
                    onChange={(e) => setHeroStack(parseInt(e.target.value) || 0)}
                    min={1}
                    max={500}
                  />
                  <span style={styles.stackSuffix}>BB</span>
                </div>
              </div>

              <div style={styles.controlRow}>
                <label style={styles.controlLabel}>Game Type:</label>
                <div style={styles.toggleGroup}>
                  <button
                    style={{
                      ...styles.toggleBtn,
                      ...(gameType === 'cash' ? styles.toggleBtnActive : {}),
                    }}
                    onClick={() => setGameType('cash')}
                  >
                    Cash (ChpEV)
                  </button>
                  <button
                    style={{
                      ...styles.toggleBtn,
                      ...(gameType === 'tournament' ? styles.toggleBtnActive : {}),
                    }}
                    onClick={() => setGameType('tournament')}
                  >
                    Tournament
                  </button>
                </div>
              </div>
            </div>

            {/* Table Setup */}
            <div style={styles.controlSection}>
              <h4 style={styles.controlTitle}>Table Setup</h4>

              <div style={styles.controlRow}>
                <label style={styles.controlLabel}>Opponents:</label>
                <select
                  style={styles.select}
                  value={numOpponents}
                  onChange={(e) => {
                    const num = parseInt(e.target.value);
                    setNumOpponents(num);
                    // Adjust villains array
                    if (num > villains.length) {
                      const newVillains = [...villains];
                      for (let i = villains.length; i < num; i++) {
                        newVillains.push({
                          seat: i + 1,
                          archetype: VILLAIN_ARCHETYPES[0],
                          stack: 100,
                        });
                      }
                      setVillains(newVillains);
                    } else {
                      setVillains(villains.slice(0, num));
                    }
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div style={styles.controlRow}>
                <label style={styles.controlLabel}>Villains:</label>
                <div style={styles.villainList}>
                  {villains.slice(0, 4).map((villain, index) => (
                    <select
                      key={villain.seat}
                      style={styles.villainSelect}
                      value={villain.archetype?.id || 'gto_neutral'}
                      onChange={(e) => updateVillainArchetype(villain.seat, e.target.value)}
                    >
                      {VILLAIN_ARCHETYPES.map(arch => (
                        <option key={arch.id} value={arch.id}>{arch.name}</option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
            </div>

            {/* Board */}
            <div style={styles.controlSection}>
              <h4 style={styles.controlTitle}>Board:</h4>
              <div style={styles.boardLinks}>
                <button style={styles.linkBtn} onClick={() => {
                  setBoardFlop([null, null, null]);
                  setBoardTurn(null);
                  setBoardRiver(null);
                }}>Clear</button>
                <span style={styles.linkDivider}>|</span>
                <button style={styles.linkBtn}>Set Flop</button>
                <span style={styles.linkDivider}>,</span>
                <button style={styles.linkBtn}>Turn</button>
                <span style={styles.linkDivider}>,</span>
                <button style={styles.linkBtn}>River</button>
              </div>

              <div style={styles.boardCards}>
                <div style={styles.boardRow}>
                  <span style={styles.boardLabel}>Flop:</span>
                  {[0, 1, 2].map(i => (
                    <CardPicker
                      key={`flop-${i}`}
                      value={boardFlop[i]}
                      onChange={(val) => {
                        const newFlop = [...boardFlop];
                        newFlop[i] = val;
                        setBoardFlop(newFlop);
                      }}
                      usedCards={getUsedCards().filter(c => c !== boardFlop[i])}
                    />
                  ))}
                </div>
                <div style={styles.boardRow}>
                  <span style={styles.boardLabel}>Turn:</span>
                  <CardPicker
                    value={boardTurn}
                    onChange={setBoardTurn}
                    usedCards={getUsedCards().filter(c => c !== boardTurn)}
                  />
                </div>
                <div style={styles.boardRow}>
                  <span style={styles.boardLabel}>River:</span>
                  <CardPicker
                    value={boardRiver}
                    onChange={setBoardRiver}
                    usedCards={getUsedCards().filter(c => c !== boardRiver)}
                  />
                </div>
              </div>
            </div>

            {/* Bet Sizing */}
            <div style={styles.controlSection}>
              <h4 style={styles.controlTitle}>Bet Sizing:</h4>
              <div style={styles.sizingLinks}>
                <button
                  style={{
                    ...styles.linkBtn,
                    color: betSizing === 'standard' ? '#64b5f6' : 'inherit',
                    textDecoration: betSizing === 'standard' ? 'underline' : 'none',
                  }}
                  onClick={() => setBetSizing('standard')}
                >
                  Standard
                </button>
                <span style={styles.linkDivider}>|</span>
                <button
                  style={{
                    ...styles.linkBtn,
                    color: betSizing === 'custom' ? '#64b5f6' : 'inherit',
                  }}
                  onClick={() => setBetSizing('custom')}
                >
                  Customize
                </button>
              </div>
            </div>

            {/* Run Button */}
            <button
              style={styles.runButton}
              onClick={runAnalysis}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing...' : 'Run Theoretical Analysis'}
            </button>
          </div>

          {/* Right Panel - Table & Results */}
          <div style={styles.rightPanel}>
            {/* Poker Table */}
            <PokerTableCanvas
              heroHand={{ card1: heroCard1, card2: heroCard2 }}
              heroPosition={heroPosition}
              heroStack={heroStack}
              villains={villains}
              board={{
                flop: boardFlop.filter(Boolean),
                turn: boardTurn,
                river: boardRiver,
              }}
              potSize={22}
            />

            {/* GTO Results */}
            <GTOResultsPanel results={results} isLoading={isAnalyzing} />

            {/* Explore Further */}
            {results && (
              <div style={styles.explorePanel}>
                <h4 style={styles.exploreTitle}>Explore Further?</h4>
                <div style={styles.exploreButtons}>
                  <button style={styles.exploreBtn}>
                    Try at 40 BB Stacks
                    <span style={styles.exploreArrow}>&#8250;</span>
                  </button>
                  <button style={styles.exploreBtn}>
                    Switch to ICM Mode
                    <span style={styles.exploreArrow}>&#8250;</span>
                  </button>
                  <button style={styles.exploreBtn}>
                    Test vs Loose-Passive
                    <span style={styles.exploreArrow}>&#8250;</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0a1628',
    fontFamily: 'Inter, -apple-system, sans-serif',
    position: 'relative',
  },
  bgGrid: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `
      linear-gradient(rgba(100, 100, 100, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(100, 100, 100, 0.02) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a1628',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.5)',
  },

  // Top Bar
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(10, 22, 40, 0.95)',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  },
  divider: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  pageLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#64b5f6',
  },
  pageSublabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  topBarRight: {},
  integrityBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'rgba(100, 181, 246, 0.1)',
    border: '1px solid rgba(100, 181, 246, 0.3)',
    borderRadius: 6,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  lockIcon: {
    fontSize: 12,
  },

  // Main Layout
  mainLayout: {
    display: 'flex',
    minHeight: 'calc(100vh - 120px)',
  },

  // Left Panel
  leftPanel: {
    width: 260,
    padding: '20px 16px',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    overflowY: 'auto',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 20,
  },
  controlSection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  controlTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 12,
  },
  controlRow: {
    marginBottom: 12,
  },
  controlLabel: {
    display: 'block',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 6,
  },
  cardRow: {
    display: 'flex',
    gap: 8,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  stackInput: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  numberInput: {
    width: 80,
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
  },
  stackSuffix: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  toggleGroup: {
    display: 'flex',
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    padding: '8px 12px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 6,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  toggleBtnActive: {
    background: '#64b5f6',
    borderColor: '#64b5f6',
    color: '#000',
    fontWeight: 600,
  },
  villainList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  villainSelect: {
    width: '100%',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
  },
  boardLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#64b5f6',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
  linkDivider: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 12,
  },
  boardCards: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  boardRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  boardLabel: {
    width: 40,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  sizingLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  runButton: {
    width: '100%',
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #1565c0, #0d47a1)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 15px rgba(21, 101, 192, 0.3)',
  },

  // Right Panel
  rightPanel: {
    flex: 1,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    overflowY: 'auto',
  },

  // Explore Panel
  explorePanel: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 16,
  },
  exploreTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 12,
  },
  exploreButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  exploreBtn: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(100, 181, 246, 0.08)',
    border: '1px solid rgba(100, 181, 246, 0.2)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  exploreArrow: {
    fontSize: 18,
    color: '#64b5f6',
  },
};
