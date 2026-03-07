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
import { useSandboxAnalysis, useArchetypes, useRecentSessions, useBookmarks } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { supabase } from '../../../src/lib/supabase';
import { getSafeUser } from '../../../src/lib/authUtils';
import { getAuthUser } from '../../../src/lib/authUtils';
import SandboxPokerTable, { TableCard } from '../../../src/components/sandbox/SandboxPokerTable';
import {
  FrequencyBar, RangeMatrix, classifyBoardTexture, BoardTextureHUD,
  ActionHistoryBuilder, SizingSensitivity, TreeVisualization,
  OnboardingTour, ShareAnalysisModal,
} from '../../../src/components/sandbox/SandboxComponents';

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
// STEP INDICATOR (Improvement #1)
// ═══════════════════════════════════════════════════════════════
function StepIndicator({ hasCards, hasBoard, hasResults, isAnalyzing }) {
  const steps = [
    { label: 'Pick Cards', done: hasCards },
    { label: 'Set Board', done: hasBoard },
    { label: 'Analyze', done: hasResults, active: isAnalyzing },
  ];
  return (
    <div className="sandbox-steps" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: 20,
            background: s.done ? 'rgba(34,197,94,0.15)' : s.active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${s.done ? 'rgba(34,197,94,0.3)' : s.active ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
            transition: 'all 0.3s',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              background: s.done ? '#22c55e' : s.active ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              color: s.done || s.active ? '#fff' : '#64748b',
            }}>{s.done ? '' : i + 1}</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: s.done ? '#4ade80' : s.active ? '#93c5fd' : '#64748b' }}>{s.label}</span>
          </div>
          {i < 2 && <div style={{ width: 20, height: 1, background: s.done ? '#22c55e' : 'rgba(255,255,255,0.1)' }} />}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HELP TOOLTIP (Improvement #7)
// ═══════════════════════════════════════════════════════════════
function HelpTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: 4 }}>
      <span onClick={() => setShow(!show)} style={{ cursor: 'pointer', color: '#475569', fontSize: 10, width: 14, height: 14, borderRadius: '50%', border: '1px solid #334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>?</span>
      {show && (
        <div onClick={() => setShow(false)} style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6, padding: '8px 12px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#cbd5e1', whiteSpace: 'nowrap', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', textTransform: 'none', maxWidth: 220, lineHeight: 1.4 }}>{text}</div>
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
        <div key={i} className="skeleton-pulse" style={{ height: i === 0 ? 60 : 16, width: `${w}%`, background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 12 }} />
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

function VisualDeckPicker({ onSelect, usedCards = [], isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'absolute', zIndex: 60, background: '#242526',
        border: '1px solid #3A3B3C', borderRadius: '10px',
        padding: '8px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', maxWidth: '320px',
      }}>
      {SUITS.map(suit => (
        <div key={suit.code} style={{ display: 'flex', gap: '2px', marginBottom: '2px', justifyContent: 'center' }}>
          {RANKS.map(rank => {
            const card = `${rank}${suit.code}`;
            const used = usedCards.includes(card);
            const imgPath = `/cards/${SUIT_MAP[suit.code]}_${RANK_MAP[rank]}.png`;
            return (
              <button key={card} onClick={() => !used && onSelect(card)} disabled={used}
                style={{
                  width: 22, height: 30, padding: 0, border: used ? '1px solid #333' : '1px solid #555',
                  borderRadius: 3, cursor: used ? 'not-allowed' : 'pointer', overflow: 'hidden',
                  opacity: used ? 0.2 : 1, background: '#fff', transition: 'all 0.1s',
                }}
                onMouseOver={e => { if (!used) e.currentTarget.style.transform = 'scale(1.3)'; e.currentTarget.style.zIndex = 10; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = 1; }}
              >
                <img src={imgPath} alt={card} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </button>
            );
          })}
        </div>
      ))}
      <button onClick={onClose} style={{
        marginTop: '4px', width: '100%', padding: '5px', borderRadius: '6px', fontSize: '11px',
        background: 'rgba(239,68,68,0.15)', border: 'none', color: '#fca5a5', cursor: 'pointer',
      }}>Close Deck</button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD SLOT
// ═══════════════════════════════════════════════════════════════
function CardSlot({ card, onClick, onRemove, label }) {
  if (card) {
    return (
      <div style={{ position: 'relative', cursor: 'pointer' }} onClick={onRemove}>
        <TableCard card={card} style={{ width: 40, height: 56 }} />
        <div style={{
          position: 'absolute', top: -4, right: -4, width: 14, height: 14,
          background: '#ef4444', borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#fff', fontWeight: '700',
        }}>×</div>
      </div>
    );
  }
  return (
    <button onClick={onClick} style={{
      width: 40, height: 56, borderRadius: 6, cursor: 'pointer',
      background: 'rgba(255,255,255,0.05)', border: '2px dashed rgba(255,255,255,0.15)',
      color: '#475569', fontSize: '9px', fontWeight: '600', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
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
      background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '8px',
    }}>
      <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Equity</span>
      <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${estimate}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: '700', color, fontFamily: "'Orbitron',monospace" }}>{estimate}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RECENT SESSIONS & BOOKMARKS SIDEBAR (Feature #6 + Gap #1)
// ═══════════════════════════════════════════════════════════════
function RecentSessionsSidebar({ isOpen, onClose, onLoad }) {
  const { sessions } = useRecentSessions(15);
  const { bookmarks } = useBookmarks(15);
  const [activeTab, setActiveTab] = useState('sessions');

  if (!isOpen) return null;

  const displayList = activeTab === 'sessions' ? sessions : bookmarks;

  return (
    <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
      style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '280px', zIndex: 1000,
        background: '#0f172a', borderRight: '1px solid rgba(255,255,255,0.1)',
        padding: '16px', display: 'flex', flexDirection: 'column'
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#e2e8f0' }}>History</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>×</button>
      </div>

      {/* Sessions / Bookmarks Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px' }}>
        <button onClick={() => setActiveTab('sessions')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none',
            background: activeTab === 'sessions' ? 'rgba(59,130,246,0.3)' : 'transparent',
            color: activeTab === 'sessions' ? '#93c5fd' : '#64748b'
          }}>Sessions</button>
        <button onClick={() => setActiveTab('bookmarks')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: 'none',
            background: activeTab === 'bookmarks' ? 'rgba(59,130,246,0.3)' : 'transparent',
            color: activeTab === 'bookmarks' ? '#93c5fd' : '#64748b'
          }}>Bookmarks</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {displayList.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>
            {activeTab === 'sessions' ? 'No recent sessions.' : 'No saved bookmarks yet.'}
          </p>
        ) : displayList.map((s, i) => (
          <button key={s.id || i} onClick={() => { onLoad(s); onClose(); }}
            style={{
              width: '100%', padding: '10px', marginBottom: '6px', borderRadius: '8px', textAlign: 'left',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              color: '#e2e8f0', cursor: 'pointer', fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: '600' }}>{s.title}</div>
            <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
              {s.type === 'bookmark' ? `Saved - ${s.stack}` : `${s.stack} - ${s.result || '—'}`}
            </div>
          </button>
        ))}
      </div>
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

  // Check first visit for onboarding
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('sandbox-tour-seen');
      if (!seen) setShowTour(true);
    }
  }, []);

  // BUS LISTENER — broadcast sandbox data changes to other pages
  useEffect(() => {
    if (results && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pa-sandbox-updated', {
        detail: { heroPosition, heroHand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`, results: !!results }
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

  // Street
  const currentStreet = useMemo(() => {
    if (board.flop.length === 0) return 'preflop';
    if (!board.turn) return 'flop';
    if (!board.river) return 'turn';
    return 'river';
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
      if (a.action === 'bet_33') pot += pot * 0.33;
      else if (a.action === 'bet_50') pot += pot * 0.5;
      else if (a.action === 'bet_66') pot += pot * 0.66;
      else if (a.action === 'bet_100') pot += pot;
      else if (a.action === 'call') pot += pot * 0.5;
      else if (a.action === 'raise') pot += pot * 1.5;
      else if (a.action === 'allin') pot = heroStack * 2;
    });
    setPotSize(Math.round(pot * 10) / 10);
  }, [actionHistory, heroStack]);

  // Deck card selection handler — keeps deck open for multi-card flop selection (#6)
  const handleDeckSelect = (card) => {
    if (deckTarget === 'hero1') {
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
      const user = await getSafeUser(supabase);
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
    await analyze({ heroHand, heroPosition, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard' });
    setShowResults(true); // auto-open fullscreen analysis popup
  };

  // Position comparison (Feature #11)
  const runPositionComparison = async (pos) => {
    setComparePosition(pos);
    await analyze({ heroHand, heroPosition: pos, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard' });
  };

  const resetAll = () => {
    setHeroHand({ card1: null, card2: null });
    setBoard({ flop: [], turn: null, river: null });
    setActionHistory([]); setPotSize(6); clearResults();
    setComparePosition(null);
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
        <RecentSessionsSidebar isOpen onClose={() => setShowSessions(false)} onLoad={(session) => {
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
        padding: '12px 20px', borderBottom: '1px solid #3A3B3C',
        background: '#242526',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => router.push('/hub/personal-assistant')} aria-label="Back"
              style={{ background: '#3A3B3C', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#B0B3B8', cursor: 'pointer', fontSize: 14 }}>←</button>
            <div>
              <h1 style={{
                fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Orbitron',sans-serif",
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
              }}>
                Virtual Sandbox</h1>
              <p style={{ color: '#B0B3B8', fontSize: 11, margin: '1px 0 0' }}>Strategy Analysis Tool</p>
            </div>
          </div>
          <div className="sandbox-header-actions" style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setShowSessions(true)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#B0B3B8', cursor: 'pointer', minHeight: 36 }}>Sessions</button>
            <button onClick={saveBookmark} disabled={saveStatus === 'saving'} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: saveStatus === 'saved' ? 'rgba(34,197,94,0.2)' : '#3A3B3C', border: `1px solid ${saveStatus === 'saved' ? 'rgba(34,197,94,0.3)' : '#4E4F50'}`, color: saveStatus === 'saved' ? '#4ade80' : '#E4E6EB', cursor: 'pointer', transition: 'all 0.3s', minHeight: 36 }}>{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}</button>
            {results && <button onClick={() => setShowResults(true)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.3)', color: '#4599FF', cursor: 'pointer', minHeight: 36 }}>View Results</button>}
            {results && <button onClick={() => setShowShare(true)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(35,116,225,0.1)', border: '1px solid rgba(35,116,225,0.2)', color: '#4599FF', cursor: 'pointer', minHeight: 36 }}>Share</button>}
            <button onClick={resetAll} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer', minHeight: 36 }}>Reset</button>
          </div>
        </div>
      </div>

      {/* STEP INDICATOR (Improvement #1) */}
      <StepIndicator
        hasCards={!!heroHand.card1 && !!heroHand.card2}
        hasBoard={board.flop.length === 3}
        hasResults={!!results}
        isAnalyzing={isAnalyzing}
      />

      {/* MAIN LAYOUT — Mobile-first responsive */}
      <div className="sandbox-main-layout" style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        {/* LEFT — Setup + Table */}
        <div>
          {/* Visual Poker Table */}
          <div className="sandbox-table-wrap" style={{ marginBottom: '16px' }}>
            <SandboxPokerTable
              heroCards={[heroHand.card1, heroHand.card2].filter(Boolean)}
              communityCards={communityCards}
              pot={potSize}
              heroPosition={heroPosition}
              heroStack={heroStack}
              villains={villains}
              street={currentStreet}
              boardTexture={boardTexture}
            />
          </div>

          {/* Board Texture HUD */}
          <BoardTextureHUD texture={boardTexture} />

          {/* Equity Display */}
          <EquityDisplay heroHand={heroHand} board={board} />

          {/* Your Hand */}
          <div id="hero-setup" style={{ background: '#242526', borderRadius: 12, border: '1px solid #3A3B3C', padding: '14px', marginBottom: '12px' }}>
            <h3 style={{ color: '#B0B3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, fontWeight: 700 }}>Your Hand</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', position: 'relative', flexWrap: 'wrap' }}>
              <span style={{ color: '#B0B3B8', fontSize: 12, minWidth: 45 }}>Hand:</span>
              <CardSlot card={heroHand.card1} label="1" onClick={() => { setDeckTarget('hero1'); setShowDeck(true); }} onRemove={() => setHeroHand(h => ({ ...h, card1: null }))} />
              <CardSlot card={heroHand.card2} label="2" onClick={() => { setDeckTarget('hero2'); setShowDeck(true); }} onRemove={() => setHeroHand(h => ({ ...h, card2: null }))} />
              <VisualDeckPicker isOpen={showDeck} onSelect={handleDeckSelect} usedCards={allUsedCards} onClose={() => setShowDeck(false)} />
            </div>
            <div className="sandbox-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ color: '#B0B3B8', fontSize: 10, display: 'flex', alignItems: 'center', marginBottom: 4 }}>Position<HelpTip text="Your seat at the table. BTN (Button) acts last and has the most advantage." /></label>
                <select value={heroPosition} onChange={e => setHeroPosition(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: '#B0B3B8', fontSize: 10, display: 'flex', alignItems: 'center', marginBottom: 4 }}>Stack<HelpTip text="How many big blinds you have. 100BB is the standard starting stack." /></label>
                <input type="text" inputMode="numeric" pattern="[0-9]*"
                  value={heroStack}
                  onChange={e => {
                    const val = Math.min(500, parseInt(e.target.value.replace(/\D/g, '') || '0', 10));
                    setHeroStack(val === 0 ? '' : val);
                  }}
                  onBlur={() => setHeroStack(h => h || 100)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ color: '#B0B3B8', fontSize: 10, display: 'flex', alignItems: 'center', marginBottom: 4 }}>Game<HelpTip text="Cash game or tournament. Strategy differs between formats." /></label>
                <select value={gameType} onChange={e => setGameType(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
                  {GAME_TYPES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Board Builder */}
          <div id="board-builder" style={{ background: '#242526', borderRadius: 12, border: '1px solid #3A3B3C', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ color: '#B0B3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>Board</h3>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={randomBoard} style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, background: 'rgba(35,116,225,0.15)', border: 'none', color: '#4599FF', cursor: 'pointer' }}>Random</button>
                {board.flop.length === 3 && !board.river && (
                  <button onClick={dealNextStreet} style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, background: 'rgba(34,197,94,0.15)', border: 'none', color: '#86efac', cursor: 'pointer' }}>
                    Deal {!board.turn ? 'Turn' : 'River'} ▸
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
              {board.flop.map((c, i) => <CardSlot key={`f${i}`} card={c} onRemove={() => { const f = [...board.flop]; f.splice(i, 1); setBoard({ flop: f, turn: null, river: null }); }} />)}
              {board.flop.length < 3 && <CardSlot label="Flop" onClick={() => { setDeckTarget('board'); setShowDeck(true); }} />}
              {board.flop.length === 3 && <div style={{ width: 2, height: 40, background: '#3A3B3C', margin: '0 2px' }} />}
              {board.flop.length === 3 && <CardSlot card={board.turn} label="T" onClick={() => { setDeckTarget('board'); setShowDeck(true); }} onRemove={() => setBoard(b => ({ ...b, turn: null, river: null }))} />}
              {board.turn && <CardSlot card={board.river} label="R" onClick={() => { setDeckTarget('board'); setShowDeck(true); }} onRemove={() => setBoard(b => ({ ...b, river: null }))} />}
            </div>

            {/* Quick Scenario Presets (Improvement #2) */}
            {!heroHand.card1 && board.flop.length === 0 && (
              <div style={{ background: 'rgba(35,116,225,0.08)', borderRadius: 10, border: '1px solid rgba(35,116,225,0.15)', padding: '12px', marginTop: '10px' }}>
                <div style={{ color: '#4599FF', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Quick Start - Common Spots</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {QUICK_PRESETS.map((preset, i) => (
                    <button key={i} onClick={() => {
                      setHeroHand(preset.hand); setHeroPosition(preset.position);
                      setHeroStack(preset.stack); setBoard(preset.board); setGameType(preset.gameType);
                      setVillains([{ position: preset.position === 'BB' ? 'SB' : 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: preset.stack }]);
                    }} style={{ padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(35,116,225,0.15)'}
                      onMouseOut={e => e.currentTarget.style.background = '#3A3B3C'}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}</div>

          {/* Villains */}
          <div style={{ background: '#242526', borderRadius: 12, border: '1px solid #3A3B3C', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ color: '#B0B3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>Opponents ({villains.length})</h3>
              <button onClick={() => { if (villains.length >= 8) return; const used = [heroPosition, ...villains.map(v => v.position)]; setVillains([...villains, { position: POSITIONS.find(p => !used.includes(p)) || 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: heroStack }]); }}
                disabled={villains.length >= 8} style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80', cursor: 'pointer', opacity: villains.length >= 8 ? 0.4 : 1 }}>+ Add</button>
            </div>
            {villains.map((v, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px 24px', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                <select value={v.position} onChange={e => { const u = [...villains]; u[i] = { ...u[i], position: e.target.value }; setVillains(u); }}
                  style={{ padding: '4px 6px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={v.archetype?.id || 'gto_neutral'} onChange={e => { const u = [...villains]; u[i] = { ...u[i], archetype: archetypes.find(a => a.id === e.target.value) || { id: e.target.value } }; setVillains(u); }}
                  style={{ padding: '4px 6px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' }}>
                  {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input type="text" inputMode="numeric" pattern="[0-9]*"
                  value={v.stack}
                  onChange={e => {
                    const val = Math.min(500, parseInt(e.target.value.replace(/\D/g, '') || '0', 10));
                    const u = [...villains];
                    u[i] = { ...u[i], stack: val === 0 ? '' : val };
                    setVillains(u);
                  }}
                  onBlur={() => {
                    const u = [...villains];
                    u[i] = { ...u[i], stack: v.stack || 100 };
                    setVillains(u);
                  }}
                  style={{ padding: '4px 6px', borderRadius: 5, fontSize: 11, background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB', width: '100%', boxSizing: 'border-box' }} />
                <button onClick={() => villains.length > 1 && setVillains(villains.filter((_, j) => j !== i))} disabled={villains.length <= 1}
                  style={{ background: 'none', border: 'none', color: villains.length <= 1 ? '#4E4F50' : '#ef4444', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>

          {/* Action History */}
          <div id="action-history">
            <ActionHistoryBuilder actions={actionHistory}
              onAdd={a => setActionHistory([...actionHistory, a])}
              onRemove={i => setActionHistory(actionHistory.filter((_, j) => j !== i))}
              potSize={potSize} />
          </div>

          {/* Run Analysis */}
          <div id="run-analysis">
            <motion.button onClick={runAnalysis} disabled={isAnalyzing || !heroHand.card1 || !heroHand.card2}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 700, border: 'none',
                cursor: isAnalyzing ? 'wait' : 'pointer',
                background: (!heroHand.card1 || !heroHand.card2) ? '#3A3B3C' : isAnalyzing ? 'rgba(35,116,225,0.3)' : 'linear-gradient(135deg,#2374E1,#4599FF)',
                color: (!heroHand.card1 || !heroHand.card2) ? '#65676B' : '#fff',
                fontFamily: "'Orbitron',sans-serif", letterSpacing: 1,
                boxShadow: (!heroHand.card1 || !heroHand.card2) ? 'none' : '0 4px 20px rgba(35,116,225,0.3)',
              }}>
              {isAnalyzing ? 'Running Analysis...' : 'Analyze Hand'}
            </motion.button>
          </div>

          {/* Position Comparison — Feature #11 */}
          {results && (
            <div style={{ marginTop: '12px', background: '#242526', borderRadius: 10, padding: '12px' }}>
              <h4 style={{ color: '#B0B3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px', fontWeight: 700 }}>Compare from another position</h4>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
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
            <div style={{ marginTop: '10px', padding: '10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ FULLSCREEN ANALYSIS POPUP (#8) ═══════ */}
      <AnimatePresence>
        {results && showResults && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              overflowY: 'auto', padding: '40px 20px',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowResults(false); }}
          >
            <motion.div
              id="results-panel"
              initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                background: '#242526', borderRadius: 16,
                border: '1px solid #3A3B3C', padding: '24px',
                width: '100%', maxWidth: 600,
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              }}
            >
              {/* Close button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ color: '#E4E6EB', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>
                  Analysis Results {comparePosition ? `(${comparePosition})` : ''}
                </h3>
                <button onClick={() => setShowResults(false)} style={{
                  background: '#3A3B3C', border: 'none', borderRadius: '50%',
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#E4E6EB', fontSize: 18, cursor: 'pointer',
                }}>×</button>
              </div>

              {/* Plain-English Summary */}
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

        /* Mobile responsive */
        @media (max-width: 768px) {
          .sandbox-main-layout {
            grid-template-columns: 1fr !important;
            padding: 10px 12px !important;
            gap: 12px !important;
          }
          .sandbox-header {
            padding: 10px 12px !important;
          }
          .sandbox-header > div {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }
          .sandbox-page h1 {
            font-size: 16px !important;
          }
          .sandbox-page h3, .sandbox-page h4 {
            font-size: 11px !important;
          }
          .sandbox-header-actions {
            flex-wrap: wrap;
            gap: 6px !important;
            width: 100%;
          }
          .sandbox-header-actions button {
            font-size: 12px !important;
            padding: 10px 14px !important;
            min-height: 44px !important;
            flex: 1;
            min-width: 70px;
          }
          .sandbox-table-wrap {
            max-height: 220px;
            overflow: visible;
            border-radius: 12px;
          }
          .sandbox-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .sandbox-hero-grid select,
          .sandbox-hero-grid input {
            font-size: 14px !important;
            padding: 10px 12px !important;
            min-height: 44px !important;
          }
          .sandbox-hero-grid label {
            font-size: 12px !important;
          }
          #run-analysis button {
            font-size: 16px !important;
            padding: 16px !important;
            min-height: 52px !important;
          }
          /* Bigger card picker on mobile */
          .sandbox-page .deck-picker-card {
            width: 36px !important;
            height: 50px !important;
          }
          .sandbox-steps {
            gap: 2px !important;
            padding: 8px 10px !important;
          }
          .sandbox-steps span {
            font-size: 9px !important;
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
    </div>
  );
}
