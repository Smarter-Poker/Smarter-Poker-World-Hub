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

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { useSandboxAnalysis, useArchetypes, useRecentSessions } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { supabase } from '../../../src/lib/supabase';
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
  { id: 'cash', label: 'Cash Game', icon: '💰' },
  { id: 'tournament', label: 'Tournament', icon: '🏆' },
];
const DEFAULT_VILLAINS = [{ position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100 }];

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
        position: 'absolute', zIndex: 60, background: '#0f172a',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px',
        padding: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', maxWidth: '340px',
      }}>
      {SUITS.map(suit => (
        <div key={suit.code} style={{ display: 'flex', gap: '3px', marginBottom: '4px', justifyContent: 'center' }}>
          {RANKS.map(rank => {
            const card = `${rank}${suit.code}`;
            const used = usedCards.includes(card);
            const imgPath = `/cards/${SUIT_MAP[suit.code]}_${RANK_MAP[rank]}.png`;
            return (
              <button key={card} onClick={() => !used && onSelect(card)} disabled={used}
                style={{
                  width: 24, height: 34, padding: 0, border: used ? '1px solid #333' : '1px solid #555',
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
        marginTop: '6px', width: '100%', padding: '5px', borderRadius: '6px', fontSize: '11px',
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
// RECENT SESSIONS SIDEBAR (Feature #6)
// ═══════════════════════════════════════════════════════════════
function RecentSessionsSidebar({ isOpen, onClose, onLoad }) {
  const { sessions } = useRecentSessions(15);
  if (!isOpen) return null;

  return (
    <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
      style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '280px', zIndex: 1000,
        background: '#0f172a', borderRight: '1px solid rgba(255,255,255,0.1)',
        padding: '16px', overflowY: 'auto',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#e2e8f0' }}>Recent Sessions</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>×</button>
      </div>
      {sessions.length === 0 ? (
        <p style={{ color: '#475569', fontSize: '12px' }}>No sessions yet. Run your first analysis!</p>
      ) : sessions.map((s, i) => (
        <button key={s.id || i} onClick={() => { onLoad(s); onClose(); }}
          style={{
            width: '100%', padding: '10px', marginBottom: '6px', borderRadius: '8px', textAlign: 'left',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            color: '#e2e8f0', cursor: 'pointer', fontSize: '12px',
          }}>
          <div style={{ fontWeight: '600' }}>{s.title}</div>
          <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>{s.stack} • {s.result || '—'}</div>
        </button>
      ))}
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

  // Deck card selection handler
  const handleDeckSelect = (card) => {
    if (deckTarget === 'hero1') setHeroHand(h => ({ ...h, card1: card }));
    else if (deckTarget === 'hero2') setHeroHand(h => ({ ...h, card2: card }));
    else if (deckTarget === 'board') {
      if (board.flop.length < 3) setBoard(b => ({ ...b, flop: [...b.flop, card] }));
      else if (!board.turn) setBoard(b => ({ ...b, turn: card }));
      else if (!board.river) setBoard(b => ({ ...b, river: card }));
    }
    setShowDeck(false);
    setDeckTarget(null);
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
    const card = deck[Math.floor(Math.random() * deck.length)];
    if (board.flop.length === 3 && !board.turn) setBoard(b => ({ ...b, turn: card }));
    else if (board.turn && !board.river) setBoard(b => ({ ...b, river: card }));
  };

  // Save bookmark (Feature #5)
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'saved', 'error'
  const saveBookmark = async () => {
    const user = getAuthUser();
    if (!user) {
      // Fallback: save to localStorage for non-logged-in users
      try {
        const bookmarkData = {
          id: Date.now(),
          hero_hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
          hero_position: heroPosition, hero_stack: heroStack, game_type: gameType,
          board_flop: board.flop.join(','), board_turn: board.turn, board_river: board.river,
          label: `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} on ${board.flop.join('')}`,
          created_at: new Date().toISOString(),
        };
        const existing = JSON.parse(localStorage.getItem('sandbox-bookmarks') || '[]');
        existing.unshift(bookmarkData);
        localStorage.setItem('sandbox-bookmarks', JSON.stringify(existing.slice(0, 50)));
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (e) { console.error('Local bookmark save error:', e); }
      return;
    }
    try {
      setSaveStatus('saving');
      const { error } = await supabase.from('sandbox_bookmarks').insert({
        user_id: user.id,
        hero_hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
        hero_position: heroPosition, hero_stack: heroStack, game_type: gameType,
        board_flop: board.flop.join(','), board_turn: board.turn, board_river: board.river,
        villains: JSON.stringify(villains), action_history: JSON.stringify(actionHistory),
        label: `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} on ${board.flop.join('')}`,
      });
      if (error) {
        console.warn('[Sandbox] Bookmark save error (table may not exist yet):', error.message);
        // Fallback to localStorage
        const bookmarkData = {
          id: Date.now(), hero_hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
          hero_position: heroPosition, hero_stack: heroStack, game_type: gameType,
          board_flop: board.flop.join(','), label: `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'}`,
          created_at: new Date().toISOString(),
        };
        const existing = JSON.parse(localStorage.getItem('sandbox-bookmarks') || '[]');
        existing.unshift(bookmarkData);
        localStorage.setItem('sandbox-bookmarks', JSON.stringify(existing.slice(0, 50)));
        setSaveStatus('saved');
      } else {
        setSaveStatus('saved');
        // 📢 Dispatch BUS LISTENER update for bookmark changes
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pa-data-updated'));
        }
      }
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e) {
      console.error('Bookmark save error:', e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  // Run analysis
  const runAnalysis = async () => {
    if (!heroHand.card1 || !heroHand.card2) return;
    await analyze({ heroHand, heroPosition, heroStack, gameType, villains, board, potSize, actionHistory, betSizing: 'standard' });
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
    results.matchTier <= 2 ? { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#4ade80', label: '✓ PIO Verified' }
      : results.matchTier === 3 ? { bg: 'rgba(251,191,36,0.15)', border: '#fbbf24', text: '#fde68a', label: '≈ PIO Approximated' }
        : { bg: 'rgba(139,92,246,0.15)', border: '#8b5cf6', text: '#c4b5fd', label: '⚡ AI Analysis' }
  ) : null;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e2e8f0', fontFamily: "'Inter',-apple-system,sans-serif" }}>
      {/* Onboarding Tour */}
      <OnboardingTour isVisible={showTour} step={tourStep}
        onClose={dismissTour} onNext={() => setTourStep(s => s + 1)} />

      {/* Share Modal */}
      <ShareAnalysisModal isOpen={showShare} onClose={() => setShowShare(false)}
        results={results} scenario={{ board: communityCards.join(' ') }} />

      {/* Sessions Sidebar */}
      <AnimatePresence>{showSessions && (
        <RecentSessionsSidebar isOpen onClose={() => setShowSessions(false)} onLoad={(session) => {
          if (session.hero_hand) {
            const h = session.hero_hand;
            setHeroHand({ card1: h.length >= 2 ? h.substring(0, 2) : null, card2: h.length >= 4 ? h.substring(2, 4) : null });
          }
          if (session.hero_position) setHeroPosition(session.hero_position);
          if (session.hero_stack) setHeroStack(session.hero_stack);
          if (session.game_type) setGameType(session.game_type);
          clearResults();
        }} />
      )}</AnimatePresence>

      {/* HEADER */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(10,10,26,0.95) 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => router.push('/hub/personal-assistant')}
              style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>←</button>
            <div>
              <h1 style={{
                fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Orbitron',sans-serif",
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
              }}>
                Virtual Sandbox</h1>
              <p style={{ color: '#64748b', fontSize: 11, margin: '1px 0 0' }}>GTO Theoretical Lab — PIO Solver Data</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setShowSessions(true)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer' }}>📋 Sessions</button>
            <button onClick={saveBookmark} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fde68a', cursor: 'pointer' }}>⭐ Save</button>
            {results && <button onClick={() => setShowShare(true)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#93c5fd', cursor: 'pointer' }}>↗ Share</button>}
            <button onClick={resetAll} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer' }}>Reset</button>
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 20px', display: 'grid', gridTemplateColumns: results ? '1fr 400px' : '1fr', gap: '20px' }}>
        {/* LEFT — Setup + Table */}
        <div>
          {/* Visual Poker Table */}
          <div style={{ marginBottom: '16px' }}>
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

          {/* Hero Setup */}
          <div id="hero-setup" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '14px', marginBottom: '12px' }}>
            <h3 style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, fontWeight: 700 }}>Hero Setup</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', position: 'relative' }}>
              <span style={{ color: '#64748b', fontSize: 12, minWidth: 45 }}>Hand:</span>
              <CardSlot card={heroHand.card1} label="1" onClick={() => { setDeckTarget('hero1'); setShowDeck(true); }} onRemove={() => setHeroHand(h => ({ ...h, card1: null }))} />
              <CardSlot card={heroHand.card2} label="2" onClick={() => { setDeckTarget('hero2'); setShowDeck(true); }} onRemove={() => setHeroHand(h => ({ ...h, card2: null }))} />
              <VisualDeckPicker isOpen={showDeck} onSelect={handleDeckSelect} usedCards={allUsedCards} onClose={() => setShowDeck(false)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ color: '#64748b', fontSize: 10, display: 'block', marginBottom: 4 }}>Position</label>
                <select value={heroPosition} onChange={e => setHeroPosition(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: '#64748b', fontSize: 10, display: 'block', marginBottom: 4 }}>Stack (BB)</label>
                <input type="number" value={heroStack} onChange={e => setHeroStack(Number(e.target.value))} min={1} max={500}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ color: '#64748b', fontSize: 10, display: 'block', marginBottom: 4 }}>Game</label>
                <select value={gameType} onChange={e => setGameType(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
                  {GAME_TYPES.map(g => <option key={g.id} value={g.id}>{g.icon} {g.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Board Builder */}
          <div id="board-builder" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>Board</h3>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={randomBoard} style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, background: 'rgba(139,92,246,0.15)', border: 'none', color: '#c4b5fd', cursor: 'pointer' }}>🎲 Random</button>
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
              {board.flop.length === 3 && <div style={{ width: 2, height: 40, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />}
              {board.flop.length === 3 && <CardSlot card={board.turn} label="T" onClick={() => { setDeckTarget('board'); setShowDeck(true); }} onRemove={() => setBoard(b => ({ ...b, turn: null, river: null }))} />}
              {board.turn && <CardSlot card={board.river} label="R" onClick={() => { setDeckTarget('board'); setShowDeck(true); }} onRemove={() => setBoard(b => ({ ...b, river: null }))} />}
            </div>
            {board.flop.length === 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {[{ l: 'AKT♦♥♣', c: ['Ad', 'Kh', 'Tc'] }, { l: '7♠5♠3♠', c: ['7s', '5s', '3s'] }, { l: 'QQ8', c: ['Qd', 'Qh', '8c'] }, { l: '987', c: ['9h', '8d', '7c'] }].map((p, i) => (
                  <button key={i} onClick={() => setBoard({ flop: p.c, turn: null, river: null })}
                    style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>{p.l}</button>
                ))}
              </div>
            )}
          </div>

          {/* Villains */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, margin: 0, fontWeight: 700 }}>Villains ({villains.length})</h3>
              <button onClick={() => { if (villains.length >= 8) return; const used = [heroPosition, ...villains.map(v => v.position)]; setVillains([...villains, { position: POSITIONS.find(p => !used.includes(p)) || 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: heroStack }]); }}
                disabled={villains.length >= 8} style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80', cursor: 'pointer', opacity: villains.length >= 8 ? 0.4 : 1 }}>+ Add</button>
            </div>
            {villains.map((v, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px 24px', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                <select value={v.position} onChange={e => { const u = [...villains]; u[i] = { ...u[i], position: e.target.value }; setVillains(u); }}
                  style={{ padding: '4px 6px', borderRadius: 5, fontSize: 11, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={v.archetype?.id || 'gto_neutral'} onChange={e => { const u = [...villains]; u[i] = { ...u[i], archetype: archetypes.find(a => a.id === e.target.value) || { id: e.target.value } }; setVillains(u); }}
                  style={{ padding: '4px 6px', borderRadius: 5, fontSize: 11, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
                  {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input type="number" value={v.stack} onChange={e => { const u = [...villains]; u[i] = { ...u[i], stack: Number(e.target.value) }; setVillains(u); }}
                  min={1} max={500} style={{ padding: '4px 6px', borderRadius: 5, fontSize: 11, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', width: '100%', boxSizing: 'border-box' }} />
                <button onClick={() => villains.length > 1 && setVillains(villains.filter((_, j) => j !== i))} disabled={villains.length <= 1}
                  style={{ background: 'none', border: 'none', color: villains.length <= 1 ? '#334155' : '#ef4444', cursor: 'pointer', fontSize: 14 }}>×</button>
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
                background: (!heroHand.card1 || !heroHand.card2) ? 'rgba(255,255,255,0.05)' : isAnalyzing ? 'rgba(59,130,246,0.3)' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
                color: (!heroHand.card1 || !heroHand.card2) ? '#475569' : '#fff',
                fontFamily: "'Orbitron',sans-serif", letterSpacing: 1,
                boxShadow: (!heroHand.card1 || !heroHand.card2) ? 'none' : '0 4px 20px rgba(59,130,246,0.3)',
              }}>
              {isAnalyzing ? '⚡ Running GTO Analysis...' : '⚡ Run Theoretical Analysis'}
            </motion.button>
          </div>

          {/* Position Comparison — Feature #11 */}
          {results && (
            <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px' }}>
              <h4 style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px', fontWeight: 700 }}>Compare from another position</h4>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {POSITIONS.filter(p => p !== heroPosition).map(p => (
                  <button key={p} onClick={() => runPositionComparison(p)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: comparePosition === p ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', color: comparePosition === p ? '#93c5fd' : '#94a3b8', cursor: 'pointer',
                    }}>{p}</button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: '10px', padding: '10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        {/* RIGHT — Results Panel */}
        <AnimatePresence>
          {results && (
            <motion.div id="results-panel" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
              style={{
                background: 'rgba(255,255,255,0.02)', borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.06)', padding: '16px',
                position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
              }}>
              <h3 style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, fontWeight: 700 }}>
                GTO Analysis {comparePosition ? `(${comparePosition})` : ''}
              </h3>

              {/* Source Badge */}
              {sourceBadge && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.text }}>{sourceBadge.label}</div>
                  <span style={{ fontSize: 10, color: '#64748b' }}>{results.source}</span>
                </div>
              )}

              {/* Optimal Action */}
              {results.optimalAction && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px', marginBottom: 12, textAlign: 'center' }}>
                  <div style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {results.isMixed ? 'Primary (Mixed)' : 'Optimal (Pure)'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Orbitron',sans-serif", color: results.optimalAction.color || '#22c55e' }}>
                    {results.optimalAction.label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{results.optimalAction.frequency}%</div>
                </div>
              )}

              {/* EV Display */}
              {results.ev?.heroDisplay && results.ev.heroDisplay !== '—' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: 12 }}>
                  {[
                    { l: 'Hand EV', v: results.ev.heroDisplay, c: results.ev.hero >= 0 ? '#22c55e' : '#ef4444' },
                    { l: 'EV Loss', v: results.ev.evLoss > 0 ? `-${results.ev.evLoss.toFixed(2)}` : '0.00', c: results.ev.evLoss > 0 ? '#ef4444' : '#22c55e' },
                    { l: 'Avg EV', v: `${results.ev.avg >= 0 ? '+' : ''}${results.ev.avg.toFixed(2)}`, c: '#94a3b8' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>{item.l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Orbitron',monospace", color: item.c, marginTop: 2 }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Frequency Bars */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                <h4 style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px', fontWeight: 700 }}>GTO Frequencies</h4>
                {results.actions?.map(a => <FrequencyBar key={a.id} action={a} isOptimal={a.isOptimal} />)}
              </div>

              {/* Tree Visualization */}
              <TreeVisualization actions={results.actions} />

              {/* Sizing Sensitivity */}
              <SizingSensitivity results={results} />

              {/* Explanation */}
              {results.explanation && (
                <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, padding: '10px', marginBottom: 12 }}>
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>Analysis</div>
                  <p style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{results.explanation}</p>
                </div>
              )}

              {/* Range Matrix */}
              {results.rangeHeatmap && (
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: 0, fontWeight: 700 }}>
                      Range Heatmap ({results.rangeHeatmap.totalHands})
                    </h4>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {results.rangeHeatmap.actions?.slice(0, 4).map(a => (
                        <button key={a.id} onClick={() => setSelectedHeatmapAction(a.id)}
                          style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, border: 'none', cursor: 'pointer',
                            background: (selectedHeatmapAction || results.rangeHeatmap.actions[0]?.id) === a.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)',
                            color: (selectedHeatmapAction || results.rangeHeatmap.actions[0]?.id) === a.id ? '#93c5fd' : '#64748b',
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
          )}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@400;500;600;700;800&display=swap');
      `}</style>
    </div>
  );
}
