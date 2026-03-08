/**
 * Virtual Sandbox — GTO Theoretical Lab (v2.0)
 * ═══════════════════════════════════════════════════════════════
 * Features:
 * 1.  Golden Template Poker Table
 * 2.  Multi-Street Auto-Progression
 * 3.  Equity Calculator
 * 4.  Board Texture HUD
 * 5.  Save & Load Bookmarks (Supabase)
 * 6.  Recent Sessions Sidebar
 * 7.  Visual Card Deck Picker (PNG cards)
 * 8.  Random Board Button
 * 9.  Share/Export to socials
 * 10. Sizing Sensitivity
 * 11. Position Comparison
 * 12. Tree Lines Visualization
 * 13. Onboarding Tour
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { useSandboxAnalysis, useArchetypes, useRecentSessions, useBookmarks, useStudyDeck, useQuizLeaderboard } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { supabase } from '../../../src/lib/supabase';
import { getSafeUser } from '../../../src/lib/authUtils';
import { getAuthUser } from '../../../src/lib/authUtils';
import { calculateEquity, simulateRunouts } from '../../../src/lib/sandbox/EquityEngine';
import { getRangeGrid, getRangePercentage } from '../../../src/lib/sandbox/PreflopCharts';
import SandboxPokerTable, { TableCard } from '../../../src/components/sandbox/SandboxPokerTable';
import {
  FrequencyBar, RangeMatrix, classifyBoardTexture,
  ActionHistoryBuilder, SizingSensitivity, TreeVisualization,
  OnboardingTour, ShareAnalysisModal, StreetTimeline, AnalysisSkeleton,
  PreflopChartOverlay, RunoutChart, ExploitToggle,
  QuizPanel, StudyReplayCard, AccuracyBadge,
  LeaderboardCard,
} from '../../../src/components/sandbox/SandboxComponents';
import { ExportCard } from '../../../src/components/sandbox/ExportCard';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { code: 's', symbol: '♠', color: '#1a1a2e', name: 'spades' },
  { code: 'h', symbol: '♥', color: '#ef4444', name: 'hearts' },
  { code: 'd', symbol: '♦', color: '#3b82f6', name: 'diamonds' },
  { code: 'c', symbol: '♣', color: '#22c55e', name: 'clubs' },
];
const GAME_TYPES = [
  { id: 'cash', label: 'Cash Game', icon: '' },
  { id: 'tournament', label: 'Tournament', icon: '' },
];
const DEFAULT_VILLAINS = [{ position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100 }];

// ═══════════════════════════════════════════════════════════════
// QUICK SCENARIO PRESETS (Improvement #2)
// ═══════════════════════════════════════════════════════════════
const QUICK_PRESETS = [
  { label: 'AK On Wet Board', hand: { card1: 'As', card2: 'Kh' }, position: 'BTN', stack: 100, board: { flop: ['Jh', '9h', '7d'], turn: null, river: null }, gameType: 'cash' },
  { label: 'QQ Preflop', hand: { card1: 'Qd', card2: 'Qc' }, position: 'CO', stack: 100, board: { flop: [], turn: null, river: null }, gameType: 'cash' },
  { label: 'Flush Draw Turn', hand: { card1: 'Ah', card2: '5h' }, position: 'BTN', stack: 100, board: { flop: ['Kh', '8h', '3c'], turn: '2d', river: null }, gameType: 'cash' },
  { label: 'Top Pair Dry Board', hand: { card1: 'Ad', card2: 'Tc' }, position: 'MP', stack: 100, board: { flop: ['As', '7d', '2c'], turn: null, river: null }, gameType: 'cash' },
];

// ═══════════════════════════════════════════════════════════════
// HAND STRENGTH CLASSIFIER (Improvement #3)
// ═══════════════════════════════════════════════════════════════
function getHandStrength(hand) {
  if (!hand.card1 || !hand.card2) return null;
  const r1 = hand.card1[0], r2 = hand.card2[0];
  const s1 = hand.card1[1], s2 = hand.card2[1];
  const suited = s1 === s2;
  const ranks = 'AKQJT98765432';
  const i1 = ranks.indexOf(r1), i2 = ranks.indexOf(r2);
  const gap = Math.abs(i1 - i2);
  const highCards = 'AKQJ';

  if (r1 === r2) {
    if ('AA KK QQ'.includes(`${r1}${r2}`)) return { label: 'Premium Pair', color: '#22c55e', strength: 5 };
    if ('JJ TT'.includes(`${r1}${r2}`)) return { label: 'Strong Pair', color: '#4ade80', strength: 4 };
    if (i1 <= 4) return { label: 'Medium Pair', color: '#fbbf24', strength: 3 };
    return { label: 'Small Pair', color: '#f97316', strength: 2 };
  }
  if (highCards.includes(r1) && highCards.includes(r2)) {
    return { label: suited ? 'Suited Broadway' : 'Broadway', color: suited ? '#3b82f6' : '#93c5fd', strength: suited ? 4 : 3 };
  }
  if (suited && gap === 1 && i1 >= 3) return { label: 'Suited Connectors', color: '#8b5cf6', strength: 3 };
  if (suited && gap <= 2) return { label: 'Suited Gapper', color: '#a78bfa', strength: 2 };
  if (suited && (r1 === 'A' || r2 === 'A')) return { label: 'Suited Ace', color: '#60a5fa', strength: 3 };
  if (suited) return { label: 'Suited', color: '#6366f1', strength: 2 };
  if (gap === 1 && i1 <= 5) return { label: 'Connectors', color: '#94a3b8', strength: 2 };
  if (r1 === 'A' || r2 === 'A') return { label: 'Ace High', color: '#cbd5e1', strength: 2 };
  return { label: 'Offsuit', color: '#64748b', strength: 1 };
}

// ═══════════════════════════════════════════════════════════════
// HELP TOOLTIP (Improvement #7)
// ═══════════════════════════════════════════════════════════════
function HelpTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: 4 }}>
      <span onClick={() => setShow(!show)} style={{ cursor: 'pointer', color: '#65676B', fontSize: 10, width: 14, height: 14, borderRadius: '50%', border: '1px solid #4E4F50', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>?</span>
      {show && (
        <div onClick={() => setShow(false)} style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6, padding: '8px 12px', background: '#242526', border: '1px solid #3A3B3C', borderRadius: 8, fontSize: 11, color: '#E4E6EB', whiteSpace: 'nowrap', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', textTransform: 'none', maxWidth: 220, lineHeight: 1.4 }}>{text}</div>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOADING SKELETON (Improvement #5)
// ═══════════════════════════════════════════════════════════════
function LoadingSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      {[100, 80, 60, 90, 70].map((w, i) => (
        <div key={i} className="skeleton-pulse" style={{ height: i === 0 ? 60 : 16, width: `${w}%`, background: '#3A3B3C', borderRadius: 8, marginBottom: 12 }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PLAIN-ENGLISH RESULTS SUMMARY (Improvement #6)
// ═══════════════════════════════════════════════════════════════
function getResultsSummary(results) {
  if (!results?.optimalAction) return null;
  const action = results.optimalAction.label || '';
  const freq = results.optimalAction.frequency || 0;
  const isMixed = results.isMixed;
  let advice = '';
  if (freq >= 90) advice = `You should ${action.toLowerCase()} here almost always.`;
  else if (freq >= 70) advice = `You should mostly ${action.toLowerCase()} here (${freq}% of the time).`;
  else if (freq >= 50) advice = `${action} is slightly preferred here, but this is a close spot.`;
  else advice = `This is a mixed spot. ${action} is most common at ${freq}%.`;
  if (isMixed) advice += ' Multiple actions are viable.';
  return advice;
}

// ═══════════════════════════════════════════════════════════════
// VISUAL DECK PICKER (Feature #7 — Uses PNG card images)
// ═══════════════════════════════════════════════════════════════
const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = { 'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10', 'J': 'j', 'Q': 'q', 'K': 'k' };

function VisualDeckPicker({ onSelect, usedCards = [], isOpen, onClose, mode, pickProgress }) {
  if (!isOpen) return null;
  const isHeroMode = mode === 'hero';
  const headerText = isHeroMode
    ? `Pick Card ${pickProgress || 1} of 2`
    : mode === 'board' ? 'Select Board Card' : 'Select a Card';
  return (
    <>
      {/* Backdrop — tap to close */}
      <div className="deck-backdrop" onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 59, background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }} />
      <motion.div className="deck-picker-sheet" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
          background: '#242526', borderRadius: '20px 20px 0 0',
          border: '1px solid #3A3B3C', borderBottom: 'none',
          padding: '12px 8px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#4E4F50' }} />
        </div>
        {/* Progress indicator for dual-card mode */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: isHeroMode ? '#4599FF' : '#B0B3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{headerText}</div>
          {isHeroMode && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 4 }}>
              <div style={{ width: 20, height: 3, borderRadius: 2, background: pickProgress >= 1 ? '#4599FF' : '#3A3B3C' }} />
              <div style={{ width: 20, height: 3, borderRadius: 2, background: pickProgress >= 2 ? '#4599FF' : '#3A3B3C' }} />
            </div>
          )}
        </div>
        {SUITS.map(suit => (
          <div key={suit.code} style={{ display: 'flex', gap: '3px', marginBottom: '3px', justifyContent: 'center' }}>
            {RANKS.map(rank => {
              const card = `${rank}${suit.code}`;
              const used = usedCards.includes(card);
              const imgPath = `/cards/${SUIT_MAP[suit.code]}_${RANK_MAP[rank]}.png`;
              return (
                <button key={card} className="deck-picker-card" onClick={() => !used && onSelect(card)} disabled={used}
                  style={{
                    width: 24, height: 34, padding: 0,
                    border: used ? '1px solid #333' : `2px solid ${suit.color}33`,
                    borderRadius: 4, cursor: used ? 'not-allowed' : 'pointer', overflow: 'hidden',
                    opacity: used ? 0.15 : 1, background: '#fff', transition: 'all 0.15s',
                    touchAction: 'manipulation',
                  }}
                >
                  <img src={imgPath} alt={card} style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" />
                </button>
              );
            })}
          </div>
        ))}
        <button onClick={onClose} style={{
          marginTop: '8px', width: '100%', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '700',
          background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.2)',
          color: '#4599FF', cursor: 'pointer', touchAction: 'manipulation',
        }}>Done</button>
      </motion.div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD SLOT
// ═══════════════════════════════════════════════════════════════
function CardSlot({ card, onClick, onRemove, label }) {
  if (card) {
    return (
      <div className="card-slot" style={{ position: 'relative', cursor: 'pointer' }} onClick={onRemove}>
        <TableCard card={card} style={{ width: 44, height: 60 }} />
        <div className="card-slot-remove" style={{
          position: 'absolute', top: -5, right: -5, width: 18, height: 18,
          background: '#ef4444', borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', fontWeight: '700',
          touchAction: 'manipulation',
        }}>×</div>
      </div>
    );
  }
  return (
    <button className="card-slot card-slot-empty" onClick={onClick} style={{
      width: 44, height: 60, borderRadius: 8, cursor: 'pointer',
      background: 'rgba(35,116,225,0.06)', border: '2px dashed rgba(35,116,225,0.2)',
      color: '#4599FF', fontSize: '10px', fontWeight: '600', display: 'flex',
      alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
    }}>{label || '+'}</button>
  );
}

// ═══════════════════════════════════════════════════════════════
// EQUITY CALCULATOR (Feature #3)
// ═══════════════════════════════════════════════════════════════
function EquityDisplay({ heroHand, board }) {
  // Simplified equity estimation based on hand strength categories
  const estimate = useMemo(() => {
    if (!heroHand?.card1 || !heroHand?.card2) return null;
    const r1 = heroHand.card1[0], r2 = heroHand.card2[0];
    const suited = heroHand.card1[1] === heroHand.card2[1];
    const paired = r1 === r2;
    const highCards = 'AKQJT';
    const isHigh1 = highCards.includes(r1), isHigh2 = highCards.includes(r2);

    let equity = 50;
    if (paired) equity += 12;
    if ('AA' === `${r1}${r2}` || 'AA' === `${r2}${r1}`) equity = 85;
    else if (paired && isHigh1) equity = 72;
    else if (isHigh1 && isHigh2) equity = suited ? 65 : 62;
    else if (isHigh1) equity = suited ? 58 : 55;
    else if (suited) equity += 3;
    // Adjust for board presence if postflop (deterministic adjustment)
    if (board?.flop?.length === 3) {
      // Use a deterministic hash of the board cards to create apparent variation
      const boardStr = board.flop.join('') + (board.turn || '') + (board.river || '');
      const hash = boardStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const adj = ((hash % 11) - 5); // -5 to +5 deterministic
      equity = Math.max(20, Math.min(90, equity + adj));
    }

    return Math.round(equity);
  }, [heroHand, board]);

  if (!estimate) return null;
  const color = estimate >= 60 ? '#22c55e' : estimate >= 45 ? '#fbbf24' : '#ef4444';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px',
      background: '#242526', borderRadius: '8px', marginBottom: '8px',
    }}>
      <span style={{ fontSize: '10px', color: '#B0B3B8', textTransform: 'uppercase', fontWeight: '700' }}>Equity</span>
      <div style={{ flex: 1, height: '6px', background: '#3A3B3C', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${estimate}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: '700', color, fontFamily: "'Orbitron',monospace" }}>{estimate}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RECENT SESSIONS & BOOKMARKS SIDEBAR (Feature #6 + Gap #1)
// ═══════════════════════════════════════════════════════════════
function RecentSessionsSidebar({ isOpen, onClose, onLoad, leaderboardEntries }) {
  const { sessions } = useRecentSessions(15);
  const { bookmarks } = useBookmarks(15);
  const [activeTab, setActiveTab] = useState('sessions');

  if (!isOpen) return null;

  const displayList = activeTab === 'sessions' ? sessions : bookmarks;

  return (
    <motion.div className="sessions-sidebar" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
      style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '300px', zIndex: 1000,
        background: '#242526', borderRight: '1px solid #3A3B3C',
        padding: '16px', display: 'flex', flexDirection: 'column'
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#E4E6EB' }}>History</h3>
        <button onClick={onClose} style={{ background: '#3A3B3C', border: 'none', color: '#E4E6EB', cursor: 'pointer', fontSize: '18px', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>×</button>
      </div>

      {/* Sessions / Bookmarks Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#18191A', padding: '4px', borderRadius: '8px' }}>
        <button onClick={() => setActiveTab('sessions')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none',
            background: activeTab === 'sessions' ? 'rgba(35,116,225,0.3)' : 'transparent',
            color: activeTab === 'sessions' ? '#4599FF' : '#B0B3B8'
          }}>Sessions</button>
        <button onClick={() => setActiveTab('bookmarks')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none',
            background: activeTab === 'bookmarks' ? 'rgba(35,116,225,0.3)' : 'transparent',
            color: activeTab === 'bookmarks' ? '#4599FF' : '#B0B3B8'
          }}>Bookmarks</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {displayList.length === 0 ? (
          <p style={{ color: '#65676B', fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>
            {activeTab === 'sessions' ? 'No recent sessions.' : 'No saved bookmarks yet.'}
          </p>
        ) : displayList.map((s, i) => (
          <button key={s.id || i} onClick={() => { onLoad(s); onClose(); }}
            style={{
              width: '100%', padding: '12px', marginBottom: '6px', borderRadius: '10px', textAlign: 'left',
              background: '#3A3B3C', border: '1px solid #4E4F50',
              color: '#E4E6EB', cursor: 'pointer', fontSize: '13px', minHeight: '48px',
              touchAction: 'manipulation',
            }}
          >
            <div style={{ fontWeight: '600' }}>{s.title}</div>
            <div style={{ color: '#B0B3B8', fontSize: '11px', marginTop: '2px' }}>
              {s.type === 'bookmark' ? `Saved - ${s.stack}` : `${s.stack} - ${s.result || '—'}`}
            </div>
          </button>
        ))}
      </div>
      {/* Leaderboard */}
      <LeaderboardCard entries={leaderboardEntries || []} />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function VirtualSandbox() {
  const router = useRouter();
  const { analyze, isAnalyzing, results, error, clearResults } = useSandboxAnalysis();
  const { archetypes } = useArchetypes();
  const { isGated, GateComponent } = useFeatureGate('personal_assistant');
  const { studySessions } = useStudyDeck(20);
  const { entries: leaderboardEntries } = useQuizLeaderboard(10);
  const [studyIndex, setStudyIndex] = useState(0);

  // ━━━ STATE ━━━
  const [heroHand, setHeroHand] = useState({ card1: null, card2: null });
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [heroStack, setHeroStack] = useState(100);
  const [gameType, setGameType] = useState('cash');
  const [villains, setVillains] = useState(DEFAULT_VILLAINS);
  const [board, setBoard] = useState({ flop: [], turn: null, river: null });
  const [actionHistory, setActionHistory] = useState([]);
  const [potSize, setPotSize] = useState(6);
  const skipPotCalcRef = useRef(false); // Bug 14 fix: prevent pot size race on session restore

  // UI State
  const [deckTarget, setDeckTarget] = useState(null); // 'hero1','hero2','board'
  const [showDeck, setShowDeck] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [selectedHeatmapAction, setSelectedHeatmapAction] = useState(null);
  const [comparePosition, setComparePosition] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [showResults, setShowResults] = useState(false); // fullscreen analysis popup
  const [showMenu, setShowMenu] = useState(false); // mobile overflow menu

  // Phase 1: Multi-Street Story Mode
  const [streetHistory, setStreetHistory] = useState([]);
  const [activeStreet, setActiveStreet] = useState(0);

  // Phase 1: Undo stack
  const undoStackRef = useRef([]);
  const pushUndo = () => {
    undoStackRef.current.push({
      heroHand: { ...heroHand }, heroPosition, heroStack, board: { ...board, flop: [...board.flop] },
      actionHistory: [...actionHistory], villains: villains.map(v => ({ ...v })),
    });
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
  };
  const popUndo = () => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    setHeroHand(prev.heroHand);
    setHeroPosition(prev.heroPosition);
    setHeroStack(prev.heroStack);
    setBoard(prev.board);
    setActionHistory(prev.actionHistory);
    setVillains(prev.villains);
  };

  // Street — must be declared above dealAndAnalyze + rangeGrid which reference it
  const currentStreet = useMemo(() => {
    if (board.flop.length === 0) return 'preflop';
    if (!board.turn) return 'flop';
    if (!board.river) return 'turn';
    return 'river';
  }, [board]);

  // Phase 1: Equity calculation
  const [equity, setEquity] = useState(null);
  useEffect(() => {
    if (!heroHand.card1 || !heroHand.card2) { setEquity(null); return; }
    const heroCards = [heroHand.card1, heroHand.card2];
    const boardCards = [...(board.flop || [])];
    if (board.turn) boardCards.push(board.turn);
    if (board.river) boardCards.push(board.river);
    // Run equity calc in a timeout so it doesn't block UI
    const t = setTimeout(() => {
      try {
        const eq = calculateEquity(heroCards, boardCards, 1500);
        setEquity(eq);
      } catch (e) { setEquity(null); }
    }, 100);
    return () => clearTimeout(t);
  }, [heroHand.card1, heroHand.card2, board]);

  // Phase 1: Deal + Analyze for multi-street
  const dealAndAnalyze = () => {
    if (results) {
      setStreetHistory(prev => [...prev, { street: currentStreet, board: { ...board, flop: [...board.flop] }, results }]);
    }
    dealNextStreet();
  };

  // Phase 2: Preflop charts
  const [preflopScenario, setPreflopScenario] = useState('rfi');
  const rangeGrid = useMemo(() => currentStreet === 'preflop' ? getRangeGrid(heroPosition, preflopScenario) : null, [heroPosition, preflopScenario, currentStreet]);
  const rangePercent = useMemo(() => currentStreet === 'preflop' ? getRangePercentage(heroPosition, preflopScenario) : 0, [heroPosition, preflopScenario, currentStreet]);

  // Phase 2: Exploit mode
  const [exploitMode, setExploitMode] = useState('gto');
  const exploitTip = useMemo(() => {
    if (exploitMode !== 'exploit' || !results || !villains[0]) return null;
    const arch = villains[0].archetype?.id || 'gto_neutral';
    const tips = {
      calling_station: 'Bet thinner for value, skip bluffs',
      nit: 'Steal more pots, respect raises',
      lag: 'Tighten up, let them hang themselves',
      tag: 'Stay balanced, mix your frequencies',
      maniac: 'Widen value range, reduce bluff frequency',
      fish: 'Bet bigger with strong hands, simplify decisions',
      gto_neutral: 'No exploit adjustment needed',
    };
    return tips[arch] || 'Adjust based on villain tendencies';
  }, [exploitMode, results, villains]);

  // Phase 2: Runout simulation
  const [runoutData, setRunoutData] = useState(null);
  useEffect(() => {
    if (!heroHand.card1 || !heroHand.card2 || board.flop.length < 3 || board.river) {
      setRunoutData(null); return;
    }
    const heroCards = [heroHand.card1, heroHand.card2];
    const boardCards = [...board.flop];
    if (board.turn) boardCards.push(board.turn);
    const t = setTimeout(() => {
      try {
        const data = simulateRunouts(heroCards, boardCards, 200);
        setRunoutData(data);
      } catch (e) { setRunoutData(null); }
    }, 200);
    return () => clearTimeout(t);
  }, [heroHand.card1, heroHand.card2, board]);

  // Phase 2: ICM / Tournament bubble factor
  const [bubbleFactor, setBubbleFactor] = useState(1.0);

  // Phase 3: Quiz mode
  const [quizMode, setQuizMode] = useState(false);
  const [userGuess, setUserGuess] = useState(null);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0, streak: 0 });

  const handleQuizGuess = (guess) => {
    setUserGuess(guess);
    setQuizRevealed(true);
    const correctLabel = results?.optimalAction?.label || '';
    const isCorrect = correctLabel.length > 0 && guess.toLowerCase().includes(correctLabel.toLowerCase().split(' ')[0]);
    setQuizScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
    // Persist quiz result (fire and forget)
    try {
      const user = getAuthUser();
      if (user) {
        const hash = `${heroHand.card1}${heroHand.card2}_${heroPosition}_${board.flop.join('')}${board.turn || ''}${board.river || ''}`;
        fetch('/api/assistant/sandbox/sandbox-quiz', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, scenarioHash: hash, userAction: guess, correctAction: correctLabel, isCorrect }),
        }).catch(() => { });
      }
    } catch (e) { /* silent */ }
  };

  // Phase 4: Weekly spot challenge
  const [weeklySpot, setWeeklySpot] = useState(null);
  useEffect(() => {
    fetch('/api/assistant/sandbox/weekly-spot')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.spot) setWeeklySpot(data.spot); })
      .catch(() => { });
  }, []);

  const loadWeeklySpot = (spot) => {
    if (!spot?.scenario_json) return;
    const s = spot.scenario_json;
    pushUndo();
    if (s.heroHand) setHeroHand(s.heroHand);
    if (s.heroPosition) setHeroPosition(s.heroPosition);
    if (s.heroStack != null) setHeroStack(s.heroStack);
    if (s.gameType) setGameType(s.gameType);
    if (s.board) setBoard(s.board);
    if (s.villains) setVillains(s.villains);
    if (s.actionHistory) setActionHistory(s.actionHistory);
    setQuizMode(true); setQuizRevealed(false); setUserGuess(null);
  };

  // Check first visit for onboarding
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('sandbox-tour-seen');
      if (!seen) setShowTour(true);
    }
  }, []);

  // Phase 4: Share link hydration — read URL query params on mount
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (!q.h && !q.p && !q.b) return; // No share params
    const hand = q.h || '';
    if (hand.length >= 4) {
      setHeroHand({ card1: hand.substring(0, 2), card2: hand.substring(2, 4) });
    }
    if (q.p) setHeroPosition(q.p);
    if (q.s) setHeroStack(Number(q.s) || 100);
    if (q.g) setGameType(q.g);
    if (q.pot) { skipPotCalcRef.current = true; setPotSize(Number(q.pot) || 6); }
    if (q.b) {
      const cards = q.b.includes(',') ? q.b.split(',').filter(Boolean) : q.b.match(/.{1,2}/g) || [];
      setBoard({ flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null });
    }
    // Clean URL after hydration (remove query params without navigation)
    if (typeof window !== 'undefined' && (q.h || q.b)) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [router.isReady]);

  // BUS LISTENER — broadcast sandbox data changes to other pages
  useEffect(() => {
    if (results && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pa-sandbox-updated', {
        detail: {
          heroPosition, heroHand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
          results: !!results, equity: equity?.heroEquity || null,
          quizAccuracy: quizScore.total > 0 ? Math.round(quizScore.correct / quizScore.total * 100) : null,
        }
      }));
    }
  }, [results, heroPosition, heroHand]);

  const dismissTour = () => { setShowTour(false); localStorage.setItem('sandbox-tour-seen', 'true'); };

  // All used cards
  const allUsedCards = useMemo(() => {
    const c = [];
    if (heroHand.card1) c.push(heroHand.card1);
    if (heroHand.card2) c.push(heroHand.card2);
    c.push(...(board.flop || []));
    if (board.turn) c.push(board.turn);
    if (board.river) c.push(board.river);
    return c;
  }, [heroHand, board]);

  // Board texture
  const boardTexture = useMemo(() => classifyBoardTexture(board), [board]);

  // Community cards array
  const communityCards = useMemo(() => {
    const c = [...(board.flop || [])];
    if (board.turn) c.push(board.turn);
    if (board.river) c.push(board.river);
    return c;
  }, [board]);

  // Pot calculation
  useEffect(() => {
    // Bug 14 fix: skip recalc when restoring from session
    if (skipPotCalcRef.current) {
      skipPotCalcRef.current = false;
      return;
    }
    let pot = 1.5;
    actionHistory.forEach(a => {
      if (a.action === 'call') pot += pot * 0.5;
      else if (a.action === 'raise') pot += pot * 1.5;
      else if (a.action === 'allin') pot = heroStack * 2;
      else if (a.action === 'check' || a.action === 'fold') { /* no change */ }
      else if (a.action && a.action.startsWith('bet_')) {
        // Parse any bet_XX format (bet_33, bet_50, bet_66, bet_75, bet_100, bet_150, etc.)
        const pct = parseInt(a.action.split('_')[1], 10);
        if (!isNaN(pct) && pct > 0) pot += pot * (pct / 100);
      }
    });
    setPotSize(Math.round(pot * 10) / 10);
  }, [actionHistory, heroStack]);

  // Dual-card hero picker progress
  const [heroPickStep, setHeroPickStep] = useState(0); // 0=not picking, 1=picking card1, 2=picking card2
  // Range chart toggle
  const [showRangeChart, setShowRangeChart] = useState(false);

  // Deck card selection handler — dual-card hero mode + multi-card flop
  const handleDeckSelect = (card) => {
    if (deckTarget === 'hero') {
      // Dual-card picker: pick both cards in sequence
      if (!heroHand.card1 || heroPickStep === 1) {
        setHeroHand(h => ({ ...h, card1: card }));
        setHeroPickStep(2); // advance to card 2
      } else {
        setHeroHand(h => ({ ...h, card2: card }));
        setHeroPickStep(0);
        setShowDeck(false);
        setDeckTarget(null);
      }
    } else if (deckTarget === 'hero1') {
      setHeroHand(h => ({ ...h, card1: card }));
      setShowDeck(false);
      setDeckTarget(null);
    } else if (deckTarget === 'hero2') {
      setHeroHand(h => ({ ...h, card2: card }));
      setShowDeck(false);
      setDeckTarget(null);
    } else if (deckTarget === 'board') {
      setBoard(prev => {
        if (prev.flop.length < 3) {
          const newFlop = [...prev.flop, card];
          // Keep deck open until all 3 flop cards are picked
          if (newFlop.length >= 3) {
            setTimeout(() => { setShowDeck(false); setDeckTarget(null); }, 150);
          }
          return { ...prev, flop: newFlop };
        } else if (!prev.turn) {
          setShowDeck(false);
          setDeckTarget(null);
          return { ...prev, turn: card };
        } else if (!prev.river) {
          setShowDeck(false);
          setDeckTarget(null);
          return { ...prev, river: card };
        }
        return prev;
      });
    }
  };

  // Table tap handlers
  const openHeroPicker = () => {
    setDeckTarget('hero');
    setHeroPickStep(heroHand.card1 ? 2 : 1);
    setShowDeck(true);
  };
  const openBoardPicker = () => {
    setDeckTarget('board');
    setShowDeck(true);
  };

  // Random board (Feature #8) — exclude only hero cards, not current board
  const randomBoard = () => {
    const heroOnly = [heroHand.card1, heroHand.card2].filter(Boolean);
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!heroOnly.includes(c)) deck.push(c); }));
    const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const shuffled = shuffle([...deck]);
    setBoard({ flop: shuffled.slice(0, 3), turn: null, river: null });
  };

  // Random board + deal next street (Feature #2)
  const dealNextStreet = () => {
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!allUsedCards.includes(c)) deck.push(c); }));
    if (deck.length === 0) return; // Guard: no cards left in deck
    const card = deck[Math.floor(Math.random() * deck.length)];
    if (board.flop.length === 3 && !board.turn) setBoard(b => ({ ...b, turn: card }));
    else if (board.turn && !board.river) setBoard(b => ({ ...b, river: card }));
  };

  // Save bookmark (Feature #5)
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'saved', 'error'
  const saveBookmark = async () => {
    try {
      const user = getAuthUser();
      if (!user) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus(null), 2000);
        return;
      }
      setSaveStatus('saving');
      const { error } = await supabase.from('sandbox_bookmarks').insert({
        user_id: user.id,
        hero_hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
        hero_position: heroPosition, hero_stack: heroStack, game_type: gameType,
        board_flop: board.flop.join(''), board_turn: board.turn, board_river: board.river,
        villains: JSON.stringify(villains), action_history: JSON.stringify(actionHistory),
        pot_size_bb: potSize,
        label: `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} on ${board.flop.join('')}`,
      });
      if (error) {
        console.warn('[Sandbox] Bookmark save error (table may not exist yet):', error.message);
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
        // 📢 Dispatch BUS LISTENER update for bookmark changes
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));
        }
      }
    } catch (e) {
      console.error('Bookmark save error:', e);
      setSaveStatus('error');
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  // Run analysis
  const runAnalysis = async () => {
    if (!heroHand.card1 || !heroHand.card2) return;
    await analyze({
      heroHand, heroPosition, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard',
      exploitMode, villainArchetype: villains[0]?.archetype?.id, bubbleFactor: gameType === 'tournament' ? bubbleFactor : undefined,
    });
    setShowResults(true); // auto-open fullscreen analysis popup
  };

  // Position comparison (Feature #11)
  const runPositionComparison = async (pos) => {
    setComparePosition(pos);
    await analyze({
      heroHand, heroPosition: pos, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard',
      exploitMode, villainArchetype: villains[0]?.archetype?.id, bubbleFactor: gameType === 'tournament' ? bubbleFactor : undefined,
    });
  };

  const resetAll = () => {
    setHeroHand({ card1: null, card2: null });
    setBoard({ flop: [], turn: null, river: null });
    setActionHistory([]); setPotSize(6); clearResults();
    setComparePosition(null);
    // Phase 1-4 state reset
    setStreetHistory([]); setActiveStreet(0);
    setEquity(null); setRunoutData(null);
    undoStackRef.current = [];
    setQuizMode(false); setUserGuess(null); setQuizRevealed(false);
    setExploitMode('gto'); setPreflopScenario('rfi');
    setBubbleFactor(1.0);
  };

  if (isGated) return GateComponent;

  // Source badge
  const sourceBadge = results ? (
    results.matchTier <= 2 ? { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#4ade80', label: 'PIO Verified' }
      : results.matchTier === 3 ? { bg: 'rgba(251,191,36,0.15)', border: '#fbbf24', text: '#fde68a', label: 'PIO Approximated' }
        : { bg: 'rgba(139,92,246,0.15)', border: '#8b5cf6', text: '#c4b5fd', label: 'AI Analysis' }
  ) : null;

  return (
    <div className="sandbox-page" style={{ minHeight: '100vh', background: '#18191A', color: '#E4E6EB', fontFamily: "'Inter',-apple-system,sans-serif" }}>
      {/* Onboarding Tour */}
      <OnboardingTour isVisible={showTour} step={tourStep}
        onClose={dismissTour} onNext={() => setTourStep(s => s + 1)} />

      {/* Share Modal */}
      <ShareAnalysisModal isOpen={showShare} onClose={() => setShowShare(false)}
        results={results} scenario={{ board: communityCards.join(' ') }} />

      {/* Sessions Sidebar */}
      <AnimatePresence>{showSessions && (
        <RecentSessionsSidebar isOpen onClose={() => setShowSessions(false)} leaderboardEntries={leaderboardEntries} onLoad={(session) => {
          if (session.hero_hand && typeof session.hero_hand === 'string') {
            const h = session.hero_hand;
            setHeroHand({ card1: h.length >= 2 ? h.substring(0, 2) : null, card2: h.length >= 4 ? h.substring(2, 4) : null });
          }
          if (session.hero_position) setHeroPosition(session.hero_position);
          if (session.hero_stack != null) setHeroStack(Number(session.hero_stack) || 100);
          if (session.game_type) setGameType(session.game_type);

          // Restore Board — handle both comma-separated ("As,Kd,Jh") and concatenated ("AsKdJh") formats
          const newBoard = { flop: [], turn: null, river: null };
          if (session.board_flop) {
            if (session.board_flop.includes(',')) {
              newBoard.flop = session.board_flop.split(',').filter(Boolean);
            } else {
              newBoard.flop = session.board_flop.match(/.{1,2}/g) || [];
            }
          }
          if (session.board_turn) newBoard.turn = session.board_turn;
          if (session.board_river) newBoard.river = session.board_river;
          setBoard(newBoard);

          // Restore Villains
          if (session.villain_config && Array.isArray(session.villain_config) && session.villain_config.length > 0) {
            // Ensure all villain stacks are numeric (DB may store as strings)
            setVillains(session.villain_config.map(v => ({ ...v, stack: Number(v.stack) || 100 })));
          } else {
            // Default villain if missing
            setVillains([{ position: session.hero_position === 'BB' ? 'SB' : 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: Number(session.hero_stack) || 100 }]);
          }

          // Restore Action History from Bookmarks
          if (session.action_history && Array.isArray(session.action_history)) {
            setActionHistory(session.action_history);
          } else {
            setActionHistory([]);
          }

          // Restore pot size (Bug 12 + 14)
          if (session.pot_size_bb != null) {
            skipPotCalcRef.current = true;
            setPotSize(Number(session.pot_size_bb) || 6);
          }
          clearResults();
        }} />
      )}</AnimatePresence>

      {/* HEADER */}
      <div className="sandbox-header" style={{
        padding: '10px 16px', borderBottom: '1px solid #3A3B3C',
        background: '#242526', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => router.push('/hub/personal-assistant')} aria-label="Back"
              style={{ background: '#3A3B3C', border: 'none', borderRadius: 8, padding: '8px 10px', color: '#B0B3B8', cursor: 'pointer', fontSize: 16, touchAction: 'manipulation', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
            <div>
              <h1 style={{
                fontSize: 16, fontWeight: 800, margin: 0, fontFamily: "'Orbitron',sans-serif",
                background: 'linear-gradient(135deg, #2374E1, #4599FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
              }}>
                Virtual Sandbox</h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Quiz toggle — always visible */}
            <button onClick={() => { setQuizMode(!quizMode); setQuizRevealed(false); setUserGuess(null); }} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: '600', background: quizMode ? 'rgba(139,92,246,0.2)' : '#3A3B3C', border: `1px solid ${quizMode ? 'rgba(139,92,246,0.3)' : '#4E4F50'}`, color: quizMode ? '#c4b5fd' : '#B0B3B8', cursor: 'pointer', minHeight: 36, touchAction: 'manipulation' }}>Quiz</button>
            <AccuracyBadge stats={quizScore} />
            {/* Desktop-only inline buttons */}
            <div className="desktop-header-actions" style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setShowSessions(true)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#B0B3B8', cursor: 'pointer', minHeight: 36 }}>Sessions</button>
              <button onClick={saveBookmark} disabled={saveStatus === 'saving'} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: saveStatus === 'saved' ? 'rgba(34,197,94,0.2)' : '#3A3B3C', border: `1px solid ${saveStatus === 'saved' ? 'rgba(34,197,94,0.3)' : '#4E4F50'}`, color: saveStatus === 'saved' ? '#4ade80' : '#E4E6EB', cursor: 'pointer', transition: 'all 0.3s', minHeight: 36 }}>{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}</button>
              {results && <button onClick={() => setShowResults(true)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.3)', color: '#4599FF', cursor: 'pointer', minHeight: 36 }}>View Results</button>}
              {results && <button onClick={() => setShowShare(true)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(35,116,225,0.1)', border: '1px solid rgba(35,116,225,0.2)', color: '#4599FF', cursor: 'pointer', minHeight: 36 }}>Share</button>}
              <button onClick={popUndo} disabled={undoStackRef.current.length === 0} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: '#3A3B3C', border: '1px solid #4E4F50', color: undoStackRef.current.length === 0 ? '#65676B' : '#B0B3B8', cursor: undoStackRef.current.length === 0 ? 'default' : 'pointer', minHeight: 36 }}>Undo</button>
              <button onClick={resetAll} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer', minHeight: 36 }}>Reset</button>
            </div>
            {/* Mobile overflow button */}
            <button className="mobile-menu-btn" onClick={() => setShowMenu(!showMenu)} style={{ display: 'none', padding: '8px', borderRadius: 8, background: showMenu ? 'rgba(35,116,225,0.2)' : '#3A3B3C', border: '1px solid #4E4F50', color: showMenu ? '#4599FF' : '#B0B3B8', cursor: 'pointer', fontSize: 18, minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>⋯</button>
          </div>
        </div>
        {/* Mobile overflow menu dropdown */}
        <AnimatePresence>
          {showMenu && (
            <motion.div className="mobile-overflow-menu"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginTop: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '4px 0' }}>
                <button onClick={() => { setShowSessions(true); setShowMenu(false); }} style={{ padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: '600', background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', cursor: 'pointer', minHeight: 48, touchAction: 'manipulation' }}>Sessions</button>
                <button onClick={() => { saveBookmark(); setShowMenu(false); }} disabled={saveStatus === 'saving'} style={{ padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: '600', background: saveStatus === 'saved' ? 'rgba(34,197,94,0.2)' : '#3A3B3C', border: `1px solid ${saveStatus === 'saved' ? 'rgba(34,197,94,0.3)' : '#4E4F50'}`, color: saveStatus === 'saved' ? '#4ade80' : '#E4E6EB', cursor: 'pointer', minHeight: 48, touchAction: 'manipulation' }}>{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save'}</button>
                {results && <button onClick={() => { setShowResults(true); setShowMenu(false); }} style={{ padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: '600', background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.3)', color: '#4599FF', cursor: 'pointer', minHeight: 48, touchAction: 'manipulation' }}>View Results</button>}
                {results && <button onClick={() => { setShowShare(true); setShowMenu(false); }} style={{ padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: '600', background: 'rgba(35,116,225,0.1)', border: '1px solid rgba(35,116,225,0.2)', color: '#4599FF', cursor: 'pointer', minHeight: 48, touchAction: 'manipulation' }}>Share</button>}
                <button onClick={() => { popUndo(); setShowMenu(false); }} disabled={undoStackRef.current.length === 0} style={{ padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: '600', background: '#3A3B3C', border: '1px solid #4E4F50', color: undoStackRef.current.length === 0 ? '#65676B' : '#E4E6EB', cursor: 'pointer', minHeight: 48, touchAction: 'manipulation' }}>Undo</button>
                <button onClick={() => { resetAll(); setShowMenu(false); }} style={{ padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: '600', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer', minHeight: 48, touchAction: 'manipulation' }}>Reset</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ CONTROL BAR ABOVE TABLE — Pos | Game | Hand | Opp | Style ═══ */}
      <div style={{ display: 'flex', gap: 3, padding: '2px 12px', maxWidth: 420, margin: '0 auto', alignItems: 'flex-end' }}>
        <select value={heroPosition} onChange={e => setHeroPosition(e.target.value)}
          style={{ padding: '3px 2px', borderRadius: 4, fontSize: 10, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', flex: '0 0 auto' }}>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={gameType} onChange={e => setGameType(e.target.value)}
          style={{ padding: '3px 2px', borderRadius: 4, fontSize: 10, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', flex: '0 0 auto' }}>
          {GAME_TYPES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <div onClick={openHeroPicker} style={{ display: 'flex', gap: 2, cursor: 'pointer', padding: '2px 4px', borderRadius: 4, background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.15)', alignItems: 'center' }}>
          {heroHand.card1 ? <CardSlot card={heroHand.card1} onRemove={(e) => { e?.stopPropagation(); setHeroHand(h => ({ ...h, card1: null })); }} /> : <div style={{ width: 16, height: 22, borderRadius: 2, border: '1px dashed rgba(35,116,225,0.4)', fontSize: 7, color: '#4599FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</div>}
          {heroHand.card2 ? <CardSlot card={heroHand.card2} onRemove={(e) => { e?.stopPropagation(); setHeroHand(h => ({ ...h, card2: null })); }} /> : <div style={{ width: 16, height: 22, borderRadius: 2, border: '1px dashed rgba(35,116,225,0.4)', fontSize: 7, color: '#4599FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</div>}
        </div>
        <span style={{ color: '#4E4F50', fontSize: 10 }}>vs</span>
        <select value={villains[0]?.position || 'BB'} onChange={e => { const u = [...villains]; u[0] = { ...u[0], position: e.target.value }; setVillains(u); }}
          style={{ padding: '3px 2px', borderRadius: 4, fontSize: 10, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', flex: '0 0 auto' }}>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={villains[0]?.archetype?.id || 'gto_neutral'} onChange={e => { const u = [...villains]; u[0] = { ...u[0], archetype: archetypes.find(a => a.id === e.target.value) || { id: e.target.value } }; setVillains(u); }}
          style={{ padding: '3px 2px', borderRadius: 4, fontSize: 10, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', flex: 1, minWidth: 0 }}>
          {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* ═══ POKER TABLE — Clean, centered, nothing beside it ═══ */}
      <div className="sandbox-table-wrap" style={{ maxWidth: 420, margin: '2px auto', padding: '0 12px' }}>
        <SandboxPokerTable
          heroCards={[heroHand.card1, heroHand.card2].filter(Boolean)}
          communityCards={communityCards}
          pot={potSize}
          heroPosition={heroPosition}
          heroStack={heroStack}
          villains={villains}
          street={currentStreet}
          boardTexture={boardTexture}
          equity={equity?.heroEquity}
          onTapHeroCards={openHeroPicker}
          onTapBoard={openBoardPicker}
        />
      </div>

      {/* ═══ CONTROLS BELOW TABLE — Board | Stack | Pot | Actions ═══ */}
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '2px 12px' }}>
        {/* Board row */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 3 }}>
          <span style={{ color: '#65676B', fontSize: 8, fontWeight: 700, textTransform: 'uppercase' }}>Board</span>
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {board.flop.map((c, i) => <CardSlot key={`f${i}`} card={c} onRemove={() => { const f = [...board.flop]; f.splice(i, 1); setBoard({ flop: f, turn: null, river: null }); }} />)}
            {board.flop.length < 3 && <CardSlot label="+" onClick={openBoardPicker} />}
            {board.flop.length === 3 && <CardSlot card={board.turn} label="T" onClick={openBoardPicker} onRemove={() => setBoard(b => ({ ...b, turn: null, river: null }))} />}
            {board.turn && <CardSlot card={board.river} label="R" onClick={openBoardPicker} onRemove={() => setBoard(b => ({ ...b, river: null }))} />}
          </div>
          <button onClick={randomBoard} style={{ padding: '2px 5px', borderRadius: 3, fontSize: 8, background: 'rgba(35,116,225,0.12)', border: 'none', color: '#4599FF', cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}>Random</button>
          {board.flop.length === 3 && !board.river && (
            <button onClick={dealNextStreet} style={{ padding: '2px 5px', borderRadius: 3, fontSize: 8, background: 'rgba(34,197,94,0.12)', border: 'none', color: '#86efac', cursor: 'pointer', fontWeight: 600 }}>
              {!board.turn ? 'Turn' : 'River'}
            </button>
          )}
        </div>
        {/* Stack + Pot row */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 3 }}>
          <span style={{ color: '#65676B', fontSize: 8, fontWeight: 700, textTransform: 'uppercase' }}>Stack</span>
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={heroStack}
            onChange={e => { const val = Math.min(500, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)); setHeroStack(val === 0 ? '' : val); }}
            onBlur={() => setHeroStack(h => h || 100)}
            style={{ width: 45, padding: '2px 3px', borderRadius: 4, fontSize: 10, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', textAlign: 'center', boxSizing: 'border-box' }} />
          <span style={{ color: '#65676B', fontSize: 8, fontWeight: 700, textTransform: 'uppercase' }}>Pot</span>
          <input type="text" inputMode="decimal" pattern="[0-9.]*" value={potSize}
            onChange={e => { const val = parseFloat(e.target.value.replace(/[^\d.]/g, '')); skipPotCalcRef.current = true; setPotSize(isNaN(val) ? '' : val); }}
            onBlur={() => { if (!potSize && potSize !== 0) setPotSize(1.5); }}
            style={{ width: 45, padding: '2px 3px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', textAlign: 'center', boxSizing: 'border-box' }} />
          <span style={{ color: '#65676B', fontSize: 8 }}>BB</span>
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {[3, 6, 10, 20].map(p => (
              <button key={p} onClick={() => { skipPotCalcRef.current = true; setPotSize(p); }}
                style={{ padding: '2px 4px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: potSize === p ? 'rgba(35,116,225,0.2)' : '#3A3B3C', border: `1px solid ${potSize === p ? 'rgba(35,116,225,0.3)' : '#4E4F50'}`, color: potSize === p ? '#4599FF' : '#B0B3B8', cursor: 'pointer' }}>{p}</button>
            ))}
          </div>
        </div>
        {/* Actions */}
        <div id="action-history" style={{ maxHeight: 40, overflowY: 'auto', marginBottom: 3 }}>
          <ActionHistoryBuilder actions={actionHistory}
            onAdd={a => setActionHistory([...actionHistory, a])}
            onRemove={i => setActionHistory(actionHistory.filter((_, j) => j !== i))}
            potSize={potSize} />
        </div>
        {/* Analyze + Daily Challenge */}
        <div style={{ display: 'flex', gap: 3 }}>
          <motion.button onClick={runAnalysis} disabled={isAnalyzing || !heroHand.card1 || !heroHand.card2}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            style={{
              flex: 1, padding: '7px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: 'none',
              cursor: isAnalyzing ? 'wait' : 'pointer',
              background: (!heroHand.card1 || !heroHand.card2) ? '#3A3B3C' : isAnalyzing ? 'rgba(35,116,225,0.3)' : 'linear-gradient(135deg,#2374E1,#4599FF)',
              color: (!heroHand.card1 || !heroHand.card2) ? '#65676B' : '#fff',
              fontFamily: "'Orbitron',sans-serif", letterSpacing: 0.5,
              boxShadow: (!heroHand.card1 || !heroHand.card2) ? 'none' : '0 2px 12px rgba(35,116,225,0.3)',
            }}>
            {isAnalyzing ? 'Analyzing...' : 'Analyze Hand'}
          </motion.button>
          {weeklySpot && (
            <button onClick={() => loadWeeklySpot(weeklySpot)}
              style={{ padding: '7px 10px', borderRadius: 8, fontSize: 9, fontWeight: 700, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
              Daily Challenge
            </button>
          )}
        </div>
        {isAnalyzing && <AnalysisSkeleton />}
      </div>

      {/* Quick Scenario Presets (only when empty) */}
      {!heroHand.card1 && board.flop.length === 0 && (
        <div style={{ background: 'rgba(35,116,225,0.08)', borderRadius: 10, border: '1px solid rgba(35,116,225,0.15)', padding: '10px', marginBottom: '8px' }}>
          <div style={{ color: '#4599FF', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Quick Start</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            {QUICK_PRESETS.map((preset, i) => (
              <button key={i} onClick={() => {
                setHeroHand(preset.hand); setHeroPosition(preset.position);
                setHeroStack(preset.stack); setBoard(preset.board); setGameType(preset.gameType);
                setVillains([{ position: preset.position === 'BB' ? 'SB' : 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: preset.stack }]);
              }} style={{ padding: '6px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', cursor: 'pointer', textAlign: 'left' }}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preflop Range Chart — behind toggle */}
      {currentStreet === 'preflop' && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setShowRangeChart(!showRangeChart)} style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: showRangeChart ? 'rgba(35,116,225,0.15)' : '#3A3B3C',
            border: `1px solid ${showRangeChart ? 'rgba(35,116,225,0.3)' : '#4E4F50'}`,
            color: showRangeChart ? '#4599FF' : '#B0B3B8', cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {showRangeChart ? '▼ Hide Range Chart' : '▶ Show Range Chart'}
          </button>
          {showRangeChart && (
            <div style={{ marginTop: 6 }}>
              <PreflopChartOverlay position={heroPosition} scenario={preflopScenario} rangeGrid={rangeGrid} rangePercent={rangePercent} onChangeScenario={setPreflopScenario} />
            </div>
          )}
        </div>
      )}

      {/* Runout Simulator -- Phase 2 */}
      {board.flop.length === 3 && !board.river && (
        <RunoutChart runoutData={runoutData} />
      )}

      {/* Position Comparison — Feature #11 */}
      {results && (
        <div style={{ marginTop: '8px', background: '#242526', borderRadius: 10, padding: '10px' }}>
          <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px', fontWeight: 700 }}>Compare Position</h4>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {POSITIONS.map(p => {
              const isCurrentTarget = comparePosition ? comparePosition === p : heroPosition === p;
              return (
                <button key={p}
                  onClick={() => {
                    if (p === heroPosition) {
                      setComparePosition(null);
                      analyze({ heroHand, heroPosition, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard' });
                    } else {
                      runPositionComparison(p);
                    }
                  }}
                  disabled={isAnalyzing}
                  style={{
                    padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    background: isCurrentTarget ? 'rgba(35,116,225,0.2)' : '#3A3B3C',
                    border: '1px solid #4E4F50', color: isCurrentTarget ? '#4599FF' : '#B0B3B8',
                    cursor: isAnalyzing ? 'not-allowed' : 'pointer', opacity: isAnalyzing ? 0.5 : 1,
                  }}>{p}</button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '8px', padding: '8px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* GLOBAL DECK PICKER — dual-card mode with progress */}
      <VisualDeckPicker
        isOpen={showDeck}
        onSelect={handleDeckSelect}
        usedCards={allUsedCards}
        onClose={() => { setShowDeck(false); setDeckTarget(null); setHeroPickStep(0); }}
        mode={deckTarget === 'hero' ? 'hero' : deckTarget === 'board' ? 'board' : 'single'}
        pickProgress={heroPickStep}
      />

      {/* ═══════ FULLSCREEN ANALYSIS POPUP (#8) ═══════ */}
      <AnimatePresence>
        {results && showResults && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              padding: '20px 12px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowResults(false); }}
          >
            <motion.div
              id="results-panel" className="results-panel-inner"
              initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                background: '#242526', borderRadius: 20,
                border: '1px solid #3A3B3C', padding: '20px',
                width: '100%', maxWidth: 600,
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              }}
            >
              {/* Drag handle (mobile affordance) */}
              <div className="results-drag-handle" style={{ display: 'none', justifyContent: 'center', marginBottom: '10px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: '#4E4F50' }} />
              </div>
              {/* Close button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ color: '#E4E6EB', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>
                  Analysis Results {comparePosition ? `(${comparePosition})` : ''}
                </h3>
                <button onClick={() => setShowResults(false)} style={{
                  background: '#3A3B3C', border: 'none', borderRadius: '50%',
                  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#E4E6EB', fontSize: 20, cursor: 'pointer', touchAction: 'manipulation',
                  flexShrink: 0,
                }}>✕</button>
              </div>

              {/* Street Timeline — Phase 1 */}
              <StreetTimeline streetHistory={streetHistory} activeStreet={activeStreet} onSelectStreet={setActiveStreet} />

              {/* Exploit Toggle -- Phase 2 */}
              <ExploitToggle mode={exploitMode} onToggle={setExploitMode} exploitTip={exploitTip} />

              {/* ICM Badge -- Phase 2 */}
              {gameType === 'tournament' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <span style={{ fontSize: '10px', color: '#fde68a', fontWeight: '700' }}>ICM Bubble Factor</span>
                  <input type="range" min="0.5" max="2.0" step="0.1" value={bubbleFactor} onChange={e => setBubbleFactor(Number(e.target.value))} style={{ flex: 1, accentColor: '#fbbf24' }} />
                  <span style={{ fontSize: '11px', color: '#fde68a', fontWeight: '700', minWidth: '30px' }}>{bubbleFactor.toFixed(1)}</span>
                </div>
              )}

              {/* Plain-English Summary */}
              {/* Quiz Panel -- Phase 3 */}
              {quizMode && results && (
                <QuizPanel onGuess={handleQuizGuess} correctAction={results.optimalAction?.label} revealed={quizRevealed} userGuess={userGuess} score={quizScore} />
              )}
              {getResultsSummary(results) && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.15)', marginBottom: 12, fontSize: 12, lineHeight: 1.5, color: '#E4E6EB', textTransform: 'none' }}>
                  {getResultsSummary(results)}
                </div>
              )}

              {/* Source Badge */}
              {sourceBadge && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.text }}>{sourceBadge.label}</div>
                  <span style={{ fontSize: 10, color: '#B0B3B8' }}>{results.source}</span>
                </div>
              )}

              {/* Optimal Action */}
              {results.optimalAction && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px', marginBottom: 12, textAlign: 'center' }}>
                  <div style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {results.isMixed ? 'Primary (Mixed)' : 'Optimal (Pure)'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Orbitron',sans-serif", color: results.optimalAction.color || '#22c55e' }}>
                    {results.optimalAction.label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>{results.optimalAction.frequency}%</div>
                </div>
              )}

              {/* EV Display */}
              {results.ev?.heroDisplay && results.ev.heroDisplay !== '—' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: 12 }}>
                  {[
                    { l: 'Hand EV', v: results.ev.heroDisplay, c: results.ev.hero >= 0 ? '#22c55e' : '#ef4444' },
                    { l: 'EV Loss', v: results.ev.evLoss > 0 ? `-${results.ev.evLoss.toFixed(2)}` : '0.00', c: results.ev.evLoss > 0 ? '#ef4444' : '#22c55e' },
                    { l: 'Avg EV', v: `${results.ev.avg >= 0 ? '+' : ''}${results.ev.avg.toFixed(2)}`, c: '#B0B3B8' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: '#3A3B3C', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#B0B3B8', textTransform: 'uppercase' }}>{item.l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Orbitron',monospace", color: item.c, marginTop: 2 }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ICM-Adjusted EV (Tournament mode with bubble factor) */}
              {results.icmAdjusted && results.icmEV && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 12, padding: '6px 10px', borderRadius: '8px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <span style={{ fontSize: '10px', color: '#fde68a', fontWeight: '700', textTransform: 'uppercase' }}>ICM EV ({results.bubbleFactor?.toFixed(1)}x)</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', fontFamily: "'Orbitron',monospace", color: results.icmEV.hero >= 0 ? '#4ade80' : '#fca5a5' }}>{results.icmEV.heroDisplay}</span>
                </div>
              )}

              {/* Frequency Bars */}
              <div style={{ background: '#3A3B3C', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px', fontWeight: 700 }}>GTO Frequencies</h4>
                {results.actions?.map(a => <FrequencyBar key={a.id} action={a} isOptimal={a.isOptimal} />)}
              </div>

              {/* Tree Visualization */}
              <TreeVisualization actions={results.actions} />

              {/* Sizing Sensitivity */}
              <SizingSensitivity results={results} />

              {/* Explanation */}
              {results.explanation && (
                <div style={{ background: 'rgba(35,116,225,0.06)', border: '1px solid rgba(35,116,225,0.15)', borderRadius: 8, padding: '10px', marginBottom: 12 }}>
                  <div style={{ color: '#B0B3B8', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>Analysis</div>
                  <p style={{ color: '#E4E6EB', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{results.explanation}</p>
                </div>
              )}

              {/* Range Matrix */}
              {results.rangeHeatmap && (
                <div style={{ background: '#3A3B3C', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ color: '#B0B3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: 0, fontWeight: 700 }}>
                      Range Heatmap ({results.rangeHeatmap.totalHands})
                    </h4>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {results.rangeHeatmap.actions?.slice(0, 4).map(a => (
                        <button key={a.id} onClick={() => setSelectedHeatmapAction(a.id)}
                          style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, border: 'none', cursor: 'pointer',
                            background: (selectedHeatmapAction || results.rangeHeatmap.actions[0]?.id) === a.id ? 'rgba(35,116,225,0.3)' : '#242526',
                            color: (selectedHeatmapAction || results.rangeHeatmap.actions[0]?.id) === a.id ? '#4599FF' : '#B0B3B8',
                          }}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                  <RangeMatrix rangeHeatmap={results.rangeHeatmap} selectedAction={selectedHeatmapAction} />
                </div>
              )}

              {/* Multi-Street — Feature #2 */}
              {board.flop.length === 3 && !board.river && (
                <button onClick={() => { dealNextStreet(); setTimeout(runAnalysis, 200); }}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none',
                    color: '#fff', cursor: 'pointer', marginBottom: 8,
                  }}>
                  Deal {!board.turn ? 'Turn' : 'River'} & Re-Analyze ▸
                </button>
              )}

              {/* Export to Image -- Phase 4 */}
              <ExportCard results={results} scenario={{ position: heroPosition, hand: `${heroHand.card1 || '?'}${heroHand.card2 || '?'}`, board: communityCards.join(' ') || 'Preflop' }} />

              {/* Collaborative Share Link -- Phase 4 */}
              <button onClick={() => {
                const params = new URLSearchParams({
                  h: `${heroHand.card1 || ''}${heroHand.card2 || ''}`, p: heroPosition, s: heroStack,
                  g: gameType, b: communityCards.join(','), pot: potSize,
                });
                const url = `${window.location.origin}/hub/personal-assistant/sandbox?${params.toString()}`;
                navigator.clipboard?.writeText(url).then(() => { if (typeof toast?.success === 'function') toast.success('Link copied'); });
              }} style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', color: '#4ade80', cursor: 'pointer', marginBottom: 8 }}>
                Copy Share Link
              </button>

              {/* Train This Spot -- Phase 3 */}
              <button onClick={() => router.push(`/hub/training?position=${heroPosition}&hand=${heroHand.card1 || ''}${heroHand.card2 || ''}`)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', background: 'rgba(35,116,225,0.1)', border: '1px solid rgba(35,116,225,0.2)', color: '#4599FF', cursor: 'pointer', marginBottom: 8 }}>
                Train This Spot
              </button>

              {/* Study Replay -- Phase 3.2 */}
              {studySessions.length > 0 && (
                <StudyReplayCard
                  session={studySessions[studyIndex]}
                  index={studyIndex}
                  total={studySessions.length}
                  onNext={() => setStudyIndex(i => Math.min(i + 1, studySessions.length - 1))}
                  onPrev={() => setStudyIndex(i => Math.max(i - 1, 0))}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence >

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@400;500;600;700;800&display=swap');

        /* Capitalize first letter of every word globally */
        .sandbox-page * {
          text-transform: capitalize;
        }
        /* Preserve case for code-like elements */
        .sandbox-page input,
        .sandbox-page select option,
        .sandbox-page code,
        .sandbox-page pre {
          text-transform: none;
        }

        /* ═══════════════════════════════════════════════ */
        /* MOBILE OPTIMIZATION — 768px breakpoint          */
        /* ═══════════════════════════════════════════════ */
        @media (max-width: 768px) {
          /* --- Layout --- */
          .sandbox-main-layout {
            grid-template-columns: 1fr !important;
            padding: 10px 12px !important;
            gap: 10px !important;
            padding-bottom: 80px !important; /* space for sticky CTA */
          }

          /* --- Header: simplified --- */
          .sandbox-header {
            padding: 8px 12px !important;
          }
          .sandbox-header > div {
            gap: 6px !important;
          }
          .sandbox-page h1 {
            font-size: 15px !important;
          }
          .desktop-header-actions {
            display: none !important;
          }
          .mobile-menu-btn {
            display: flex !important;
          }

          /* --- Card Picker: fullscreen bottom-sheet --- */
          .deck-picker-sheet {
            max-height: 80vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          .deck-picker-card {
            width: 38px !important;
            height: 52px !important;
            border-radius: 5px !important;
          }

          /* --- Card Slots: bigger for thumbs --- */
          .card-slot img,
          .card-slot-empty {
            width: 52px !important;
            height: 72px !important;
          }
          .card-slot-remove {
            width: 22px !important;
            height: 22px !important;
            font-size: 13px !important;
          }

          /* --- Form Controls: 48px targets, 16px font (no iOS zoom) --- */
          .sandbox-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .sandbox-hero-grid select,
          .sandbox-hero-grid input {
            font-size: 16px !important;
            padding: 12px !important;
            min-height: 48px !important;
            border-radius: 10px !important;
          }
          .sandbox-hero-grid label {
            font-size: 13px !important;
          }

          /* --- Analyze Button: inline (not fixed) --- */
          #run-analysis {
            padding: 4px 12px !important;
          }
          #run-analysis button {
            font-size: 15px !important;
            padding: 14px !important;
            min-height: 50px !important;
            border-radius: 12px !important;
          }

          /* --- Results Panel: bottom-sheet feel --- */
          .results-panel-inner {
            border-radius: 20px 20px 0 0 !important;
            padding: 16px 14px !important;
            max-height: 95vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          .results-drag-handle {
            display: flex !important;
          }

          /* --- Sessions Sidebar: full-width --- */
          .sessions-sidebar {
            width: 100vw !important;
            padding: 16px !important;
            padding-top: calc(16px + env(safe-area-inset-top, 0px)) !important;
          }

          /* --- Poker Table: vertical, fill width --- */
          .sandbox-table-wrap {
            overflow: visible;
            border-radius: 12px;
          }

          /* --- Step Indicator: compact --- */
          .sandbox-steps {
            gap: 2px !important;
            padding: 6px 10px !important;
          }
          .sandbox-steps span {
            font-size: 10px !important;
          }

          /* --- Touch optimizations --- */
          .sandbox-page button {
            touch-action: manipulation;
          }
          .sandbox-page select {
            touch-action: manipulation;
            font-size: 16px !important;
          }

          /* --- Villain controls: bigger touch targets --- */
          .sandbox-page .sandbox-main-layout select {
            min-height: 44px !important;
            padding: 10px 8px !important;
            border-radius: 8px !important;
          }
          .sandbox-page .sandbox-main-layout input[type="text"] {
            min-height: 44px !important;
            padding: 10px 8px !important;
            border-radius: 8px !important;
          }

          /* --- Board action buttons: bigger for thumbs --- */
          .sandbox-page #board-builder button {
            min-height: 36px !important;
            padding: 8px 12px !important;
            font-size: 12px !important;
            border-radius: 8px !important;
          }

          /* --- Pot preset buttons: thumb-friendly --- */
          .pot-size-editor button {
            min-height: 40px !important;
            padding: 8px 12px !important;
          }
        }

        /* Pulsing animation for loading */
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        .skeleton-pulse {
          animation: skeleton-pulse 1.5s ease-in-out infinite;
        }
        @keyframes analyze-pulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(35,116,225,0.3); }
          50% { box-shadow: 0 4px 30px rgba(35,116,225,0.6); }
        }
        .analyzing-pulse {
          animation: analyze-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div >
  );
}
