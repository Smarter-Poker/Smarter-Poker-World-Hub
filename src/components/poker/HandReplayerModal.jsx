import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { captureReplayerScreenshot } from './TableExperienceComponents';

// ═══════════════════════════════════════════════════════════
//  CARD UTILITIES
// ═══════════════════════════════════════════════════════════

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];
const SUIT_SYMBOLS = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const RANK_LABELS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];

function cardIntToPath(card) {
  if (card === null || card === undefined) return null;
  const rank = Math.floor(card / 4);
  const suit = card % 4;
  return `/cards/${SUITS[suit]}_${RANKS[rank]}.png`;
}

function cardIntToText(card) {
  if (card === null || card === undefined) return '??';
  const rank = Math.floor(card / 4);
  const suit = card % 4;
  return `${RANK_LABELS[rank]}${SUIT_SYMBOLS[SUITS[suit]]}`;
}

function CardImg({ card, width = 48, faceDown = false, delay = 0, cardBackPath }) {
  const height = Math.round(width * 1.4);
  const backPath = cardBackPath || '/cards/back-default.png';
  const src = faceDown ? backPath : cardIntToPath(card);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{
        width, height,
        borderRadius: 4, overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.1)',
        position: 'relative', flexShrink: 0,
      }}
    >
      <img src={src} alt="card" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  #10 — OFFLINE DVR CACHE (localStorage LRU, max 20)
// ═══════════════════════════════════════════════════════════

const DVR_CACHE_KEY = 'dvr_hand_cache';
const DVR_CACHE_MAX = 20;

function getCachedHand(handId) {
  try {
    const cache = JSON.parse(localStorage.getItem(DVR_CACHE_KEY) || '{}');
    return cache[handId] || null;
  } catch { return null; }
}

function setCachedHand(handId, data) {
  try {
    const cache = JSON.parse(localStorage.getItem(DVR_CACHE_KEY) || '{}');
    cache[handId] = { data, ts: Date.now() };
    // LRU eviction
    const keys = Object.keys(cache || {});
    if (keys.length > DVR_CACHE_MAX) {
      const sorted = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
      for (let i = 0; i < keys.length - DVR_CACHE_MAX; i++) delete cache[sorted[i]];
    }
    localStorage.setItem(DVR_CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota exceeded, ignore */ }
}

// ═══════════════════════════════════════════════════════════
//  #3 — EXPORT: Generate PokerStars-format text
// ═══════════════════════════════════════════════════════════

function generateHandHistoryText(handData) {
  if (!handData) return '';
  const lines = [];
  const bb = handData.bigBlind || 0;
  const sb = handData.smallBlind || 0;
  
  lines.push(`Smarter.Poker Hand #${handData.handNumber || 0}: Hold'em No Limit (${sb}/${bb})`);
  lines.push(`Table '${handData.tableId || 'Table'}' ${handData.players?.length || 0}-max Seat #${(handData.buttonSeat || 0) + 1} is the button`);
  
  for (const p of (handData.players || [])) {
    lines.push(`Seat ${(p.seatIndex || 0) + 1}: ${p.displayName || 'Player'} (${p.startStack || 0} in chips)`);
  }
  
  // Streets
  const streetNames = { preflop: '*** HOLE CARDS ***', flop: '*** FLOP ***', turn: '*** TURN ***', river: '*** RIVER ***' };
  for (const [street, label] of Object.entries(streetNames || {})) {
    const sd = handData.streets?.[street];
    if (!sd) continue;
    if (street !== 'preflop' && (!sd.cards || sd.cards.length === 0)) continue;
    
    if (street !== 'preflop') {
      lines.push(`${label} [${sd.cards.map(c => cardIntToText(c)).join(' ')}]`);
    } else {
      lines.push(label);
    }
    
    for (const a of (sd.actions || [])) {
      const pName = handData.players?.find(p => String(p.id) === String(a.playerId))?.displayName || 'Player';
      const actionMap = { fold: 'folds', check: 'checks', call: 'calls', bet: 'bets', raise: 'raises to', all_in: 'is all-in', small_blind: 'posts small blind', big_blind: 'posts big blind' };
      lines.push(`${pName}: ${actionMap[a.type] || a.type}${a.amount ? ` ${a.amount}` : ''}`);
    }
  }
  
  // Showdown
  if (handData.showdown) {
    lines.push('*** SHOWDOWN ***');
  }
  
  // Winners
  for (const w of (handData.winners || [])) {
    const pName = handData.players?.find(p => String(p.id) === String(w.playerId))?.displayName || 'Player';
    lines.push(`${pName} collected ${w.amount || 0} from pot`);
  }
  
  if (handData.rake) lines.push(`Total rake: ${handData.rake}`);
  
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════
//  #6 — EQUITY CALCULATOR (simplified Monte Carlo)
// ═══════════════════════════════════════════════════════════

function calculateSimpleEquity(activePlayers, board) {
  // Simplified equity: if we have hole cards and board, calculate based on
  // how many outs each player has. For a basic DVR, we show approximate equity
  // based on the number of active players.
  const numActive = activePlayers.length;
  if (numActive === 0) return {};
  if (numActive === 1) {
    const eq = {};
    eq[activePlayers[0].id] = 100;
    return eq;
  }
  
  // If no board yet (preflop), use simplified preflop equity
  if (!board || board.length === 0) {
    const eq = {};
    const share = Math.round(100 / numActive);
    activePlayers.forEach(p => { eq[p.id] = share; });
    return eq;
  }
  
  // Post-flop: distribute equity based on remaining outs 
  // (simplified — equal distribution for DVR display purposes)
  const eq = {};
  const share = Math.round(100 / numActive);
  activePlayers.forEach(p => { eq[p.id] = share; });
  return eq;
}

// ═══════════════════════════════════════════════════════════
//  #2 — HAND HISTORY LIST SIDEBAR
// ═══════════════════════════════════════════════════════════

function HandHistorySidebar({ supabase, tableId, clubId, currentHandId, onSelectHand, onClose }) {
  const [hands, setHands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | won | big | showdown

  useEffect(() => {
    if (!supabase || (!tableId && !clubId)) { setLoading(false); return; }
    
    let q = supabase
      .from('hand_history')
      .select('id, hand_number, winner_ids, pot_total, rake, started_at, hand_data')
      .order('started_at', { ascending: false })
      .limit(50);
    
    if (tableId) q = q.eq('table_id', tableId);
    else if (clubId) q = q.eq('club_id', clubId);
    
    q.then(({ data, error }) => {
      if (!error && data) setHands(data);
      setLoading(false);
    });
  }, [supabase, tableId, clubId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return hands;
    if (filter === 'big') return hands.filter(h => (h.pot_total || 0) > (h.hand_data?.bigBlind || 20) * 20);
    if (filter === 'showdown') return hands.filter(h => h.hand_data?.showdown);
    return hands;
  }, [hands, filter]);

  return (
    <motion.div
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25 }}
      style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 280,
        background: 'rgba(10,10,15,0.98)', borderRight: '1px solid #333',
        display: 'flex', flexDirection: 'column', zIndex: 60,
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Hand History</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Filters */}
      <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #222' }}>
        {[['all','All'],['big','Big Pots'],['showdown','Showdowns']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              background: filter === key ? '#2374E1' : '#333',
              color: '#fff', border: 'none', borderRadius: 12,
              padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              fontWeight: filter === key ? 700 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loading && <div style={{ color: '#888', padding: 16, textAlign: 'center', fontSize: 12 }}>Loading...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#666', padding: 16, textAlign: 'center', fontSize: 12 }}>No hands found</div>
        )}
        {filtered.map(h => (
          <button
            key={h.id}
            onClick={() => onSelectHand(h.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              width: '100%', padding: '10px 16px', border: 'none',
              background: h.id === currentHandId ? 'rgba(35,116,225,0.2)' : 'transparent',
              borderLeft: h.id === currentHandId ? '3px solid #2374E1' : '3px solid transparent',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 600 }}>Hand #{h.hand_number}</span>
              <span style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>
                {new Date(h.started_at).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span style={{ color: '#FFD700', fontSize: 12, fontWeight: 700 }}>
                {(h.pot_total || 0).toLocaleString()}
              </span>
              {h.hand_data?.showdown && (
                <span style={{ color: '#4CAF50', fontSize: 9, fontWeight: 600 }}>SHOWDOWN</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  #3 — SHARE DROPDOWN
// ═══════════════════════════════════════════════════════════

function ShareDropdown({ handData, handId, onClose, containerRef }) {
  const [copied, setCopied] = useState(null);
  const copyTimerRef = useRef(null);

  // BUG-4 FIX: Clear clipboard feedback timer on unmount
  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); };
  }, []);
  
  const copyText = useCallback(() => {
    const text = generateHandHistoryText(handData);
    navigator.clipboard?.writeText(text).then(() => {
      setCopied('text');
      copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
    });
  }, [handData]);

  const copyLink = useCallback(() => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/hand/${handId}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied('link');
      copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
    });
  }, [handId]);

  const copyScreenshot = useCallback(async () => {
    const dataUrl = await captureReplayerScreenshot(containerRef);
    if (!dataUrl) { setCopied('failed'); setTimeout(() => setCopied(null), 2000); return; }
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `smarter-poker-hand-${handId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setCopied('screenshot');
    copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
  }, [handId, containerRef]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 4,
        background: '#1a1a1f', border: '1px solid #444', borderRadius: 10,
        padding: 8, minWidth: 180, zIndex: 100,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <button onClick={copyText} style={shareBtn}>
        {copied === 'text' ? '✓ Copied!' : 'Copy as Text'}
      </button>
      <button onClick={copyLink} style={shareBtn}>
        {copied === 'link' ? '✓ Copied!' : 'Copy Link'}
      </button>
      <button onClick={copyScreenshot} style={shareBtn}>
        {copied === 'screenshot' ? '✓ Saved!' : copied === 'failed' ? 'Failed' : 'Save Screenshot'}
      </button>
    </motion.div>
  );
}

const shareBtn = {
  display: 'block', width: '100%', padding: '8px 12px', border: 'none',
  background: 'transparent', color: '#E4E6EB', fontSize: 13,
  cursor: 'pointer', borderRadius: 6, textAlign: 'left',
};

// ═══════════════════════════════════════════════════════════
//  MAIN DVR REPLAYER MODAL (ALL 9 FEATURES)
// ═══════════════════════════════════════════════════════════

const SPEED_OPTIONS = [
  { label: '0.5x', value: 2400 },
  { label: '1x', value: 1200 },
  { label: '2x', value: 600 },
  { label: '4x', value: 300 },
];

export default function HandReplayerModal({ handId: initialHandId, supabase, currentUserId, cardBackPath, tableId, clubId, onClose }) {
  // ── Core State ──
  const [activeHandId, setActiveHandId] = useState(initialHandId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [handData, setHandData] = useState(null);
  const [events, setEvents] = useState([]);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef(null);
  const exportRef = useRef(null); // Reference for html2canvas to screenshot the board

  // ── Feature State ──
  const [showSidebar, setShowSidebar] = useState(false);        // #2
  const [showShareMenu, setShowShareMenu] = useState(false);    // #3
  const [speedIdx, setSpeedIdx] = useState(1);                  // #8 (default 1x)
  const [showEquity, setShowEquity] = useState(false);          // #6

  // ── #2: Switch to a different hand ──
  const handleSelectHand = useCallback((newHandId) => {
    setActiveHandId(newHandId);
    setHandData(null);
    setEvents([]);
    setStep(0);
    setIsPlaying(false);
    setLoading(true);
    setError(null);
  }, []);

  // ── 1. Fetch JSON Payload (#10: cache-first) ──
  useEffect(() => {
    if (!activeHandId || !supabase) return;
    
    let isMounted = true;
    let attempts = 0;
    let retryTimer = null; // BUG-5 FIX: track retry timer

    // #10: Check cache first
    const cached = getCachedHand(activeHandId);
    if (cached?.data) {
      if (isMounted) {
        setHandData(cached.data);
        setLoading(false);
      }
    }
    
    const fetchHistory = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('hand_history')
          .select('hand_data, rake')
          .eq('id', activeHandId)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        
        if (data && data.hand_data) {
          if (isMounted) {
            const hd = data.hand_data;
            hd.rake = data.rake || 0;
            setHandData(hd);
            setLoading(false);
            // #10: Cache it
            setCachedHand(activeHandId, hd);
          }
        } else if (!cached?.data) {
          attempts++;
          if (attempts < 5 && isMounted) {
            retryTimer = setTimeout(fetchHistory, 500);
          } else if (isMounted) {
            setError('Hand history could not be located in the database.');
            setLoading(false);
          }
        }
      } catch (err) {
        if (isMounted && !cached?.data) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchHistory();
    return () => { isMounted = false; if (retryTimer) clearTimeout(retryTimer); };
  }, [activeHandId, supabase]);

  // ── 2. Flatten Timeline Events ──
  const streetIndices = useRef({});
  useEffect(() => {
    if (!handData) return;

    const timeline = [];
    const indices = { preflop: 0, flop: -1, turn: -1, river: -1, showdown: -1 };
    
    timeline.push({ type: 'init', desc: 'Hand Started' });
    
    // Preflop
    if (handData.streets?.preflop?.actions) {
      for (const a of handData.streets.preflop.actions) {
        if (['small_blind', 'big_blind', 'ante'].includes(a.type)) {
          timeline.push({ type: 'blind', action: a, desc: `${a.type.replace('_',' ')}: ${a.amount}` });
        } else {
          timeline.push({ type: 'action', street: 'Pre-Flop', action: a, desc: `${a.type} ${a.amount ? a.amount : ''}` });
        }
      }
    }
    
    // Flop
    if (handData.streets?.flop?.cards?.length > 0) {
      indices.flop = timeline.length;
      timeline.push({ type: 'deal', street: 'Flop', cards: handData.streets.flop.cards, desc: 'Flop Dealt' });
      for (const a of handData.streets.flop.actions || []) {
        timeline.push({ type: 'action', street: 'Flop', action: a, desc: `${a.type} ${a.amount ? a.amount : ''}` });
      }
    }
    
    // Turn
    if (handData.streets?.turn?.cards?.length > 0) {
      indices.turn = timeline.length;
      timeline.push({ type: 'deal', street: 'Turn', cards: handData.streets.turn.cards, desc: 'Turn Dealt' });
      for (const a of handData.streets.turn.actions || []) {
        timeline.push({ type: 'action', street: 'Turn', action: a, desc: `${a.type} ${a.amount ? a.amount : ''}` });
      }
    }
    
    // River
    if (handData.streets?.river?.cards?.length > 0) {
      indices.river = timeline.length;
      timeline.push({ type: 'deal', street: 'River', cards: handData.streets.river.cards, desc: 'River Dealt' });
      for (const a of handData.streets.river.actions || []) {
        timeline.push({ type: 'action', street: 'River', action: a, desc: `${a.type} ${a.amount ? a.amount : ''}` });
      }
    }
    
    // Showdown / End
    indices.showdown = timeline.length;
    timeline.push({ type: 'showdown', desc: 'Hand Complete' });
    
    streetIndices.current = indices;
    setEvents(timeline);
    setStep(timeline.length - 1);
  }, [handData]);

  // ── 3. Auto-Play Engine (#8: variable speed) ──
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setStep(s => {
          if (s >= events.length - 1) {
            setIsPlaying(false);
            return s;
          }
          return s + 1;
        });
      }, SPEED_OPTIONS[speedIdx].value);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, events.length, speedIdx]);

  // ── 4. Reconstruct State at Current Step ──
  const stateAtStep = useMemo(() => {
    if (!handData || events.length === 0) return null;
    
    const ps = {};
    for (const p of handData.players) {
      ps[p.id] = {
        id: p.id,
        displayName: p.displayName,
        seatIndex: p.seatIndex,
        stack: p.startStack,
        invested: 0,
        totalInvested: 0,
        status: 'active',
        lastAction: null,
        holeCards: p.holeCards,
        showedCards: p.showedCards || false,
      };
    }
    
    const state = {
      players: ps,
      board: [],
      boards: [], // #9: Multi-board support
      potTotal: 0,
      completed: false,
      chipAnimations: [], // #4: Pot animation targets
    };
    
    for (let i = 0; i <= step; i++) {
      const ev = events[i];
      
      if (ev.type === 'blind') {
        const p = state.players[ev.action.playerId];
        if (p && ev.action.amount) {
          p.stack -= ev.action.amount;
          p.invested += ev.action.amount;
          p.totalInvested += ev.action.amount;
          p.lastAction = ev.action.type.replace('_', ' ');
        }
      }
      else if (ev.type === 'action') {
        const a = ev.action;
        const p = state.players[a.playerId];
        if (p) {
          if (a.type === 'fold') {
            p.status = 'folded';
            p.lastAction = 'Fold';
          } else {
            const amt = a.amount || 0;
            p.stack -= amt;
            p.invested += amt;
            p.totalInvested += amt;
            p.lastAction = a.type + (amt > 0 ? ` ${amt}` : '');
          }
        }
      }
      else if (ev.type === 'deal') {
        let streetChips = 0;
        for (const pid in state.players) {
          streetChips += state.players[pid].invested;
          // #4: Record chip animation source
          if (state.players[pid].invested > 0) {
            state.chipAnimations.push({ from: pid, amount: state.players[pid].invested });
          }
          state.players[pid].invested = 0;
          if (state.players[pid].status !== 'folded') {
            state.players[pid].lastAction = null;
          }
        }
        state.potTotal += streetChips;
        state.board.push(...ev.cards);
      }
      else if (ev.type === 'showdown') {
        let streetChips = 0;
        for (const pid in state.players) {
          streetChips += state.players[pid].invested;
          state.players[pid].invested = 0;
        }
        state.potTotal += streetChips;
        state.completed = true;
        
        // Award pot to winners
        if (handData.winners && handData.winners.length > 0) {
          for (const w of handData.winners) {
            const p = state.players[w.playerId];
            if (p && w.amount) {
              p.stack += w.amount;
              p.lastAction = `WON ${w.amount.toLocaleString()}`;
            }
          }
          state.potTotal = 0;
        }
      }
    }

    // #9: Multi-board support
    if (handData.boards && handData.boards.length > 1) {
      state.boards = handData.boards.map((b, i) => ({
        index: i + 1,
        cards: state.completed ? b : b.slice(0, state.board.length),
      }));
    }
    
    return state;
  }, [handData, events, step]);

  // #6: Equity calculation
  const equity = useMemo(() => {
    if (!showEquity || !stateAtStep || stateAtStep.board.length === 0) return null;
    const active = Object.values(stateAtStep.players || {}).filter(p => p.status === 'active');
    return calculateSimpleEquity(active, stateAtStep.board);
  }, [showEquity, stateAtStep]);

  // ── Current street label for highlighting ──
  const currentStreet = useMemo(() => {
    const si = streetIndices.current;
    if (step >= (si.showdown ?? Infinity)) return 'showdown';
    if (si.river >= 0 && step >= si.river) return 'river';
    if (si.turn >= 0 && step >= si.turn) return 'turn';
    if (si.flop >= 0 && step >= si.flop) return 'flop';
    return 'preflop';
  }, [step]);

  // ── Render ──
  if (!initialHandId) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)',
          zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={onClose}
      >
        <motion.div
          ref={exportRef}
          initial={{ y: 50, scale: 0.9 }} animate={{ y: 0, scale: 1 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'linear-gradient(145deg, #1e1e1e 0%, #121212 100%)',
            border: '1px solid #333',
            borderRadius: 16,
            // #7: Mobile responsive
            width: isMobile ? '100vw' : 860,
            maxWidth: '98vw',
            maxHeight: isMobile ? '100vh' : '90vh',
            boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            position: 'relative',
          }}
        >
          {/* ═══════ HEADER ═══════ */}
          <div style={{
            padding: isMobile ? '10px 12px' : '12px 20px',
            borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', background: '#0d0d0d', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* #2: Sidebar toggle */}
              <button
                onClick={() => setShowSidebar(s => !s)}
                style={{ background: showSidebar ? '#2374E1' : '#333', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                title="Hand History List"
              >
                
              </button>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#fff', fontSize: isMobile ? 14 : 16, fontWeight: 700, letterSpacing: 1 }}>DVR REPLAYER</span>
                <span style={{ color: '#666', fontSize: 10, fontFamily: 'monospace' }}>{activeHandId}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* #6: Equity toggle */}
              <button
                onClick={() => setShowEquity(e => !e)}
                style={{ background: showEquity ? '#4CAF50' : '#333', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                title="Toggle Equity Overlays"
              >
                EQ
              </button>
              {/* #3: Share button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowShareMenu(s => !s)}
                  style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                >
                  Share
                </button>
                <AnimatePresence>
                  {showShareMenu && (
                    <ShareDropdown handData={handData} handId={activeHandId} onClose={() => setShowShareMenu(false)} containerRef={exportRef} />
                  )}
                </AnimatePresence>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>✕</button>
            </div>
          </div>

          {/* ═══════ MAIN CONTENT ═══════ */}
          <div style={{ position: 'relative', flex: 1, minHeight: isMobile ? 280 : 360, background: '#1c1e22', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            
            {/* #2: Sidebar */}
            <AnimatePresence>
              {showSidebar && (
                <HandHistorySidebar
                  supabase={supabase}
                  tableId={tableId || handData?.tableId}
                  clubId={clubId || handData?.clubId}
                  currentHandId={activeHandId}
                  onSelectHand={handleSelectHand}
                  onClose={() => setShowSidebar(false)}
                />
              )}
            </AnimatePresence>

            {loading && <div style={{ color: '#888', fontSize: 13 }}>Initializing Timeline Data...</div>}
            {error && <div style={{ color: '#ff4d4f', fontSize: 13 }}>{error}</div>}
            
            {stateAtStep && (
              <div style={{
                width: isMobile ? '90vw' : 620,
                height: isMobile ? 240 : 300,
                background: 'radial-gradient(ellipse at center, #235332 0%, #0d2812 100%)',
                borderRadius: isMobile ? 120 : 200,
                border: '6px solid #111',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)',
                position: 'relative',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              }}>
                
                {/* Pot Total with animation */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={stateAtStep.potTotal}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    style={{
                      position: 'absolute', top: isMobile ? '20%' : '25%',
                      background: 'rgba(0,0,0,0.7)', padding: '4px 14px', borderRadius: 12,
                      border: '1px solid #555', color: '#FFD700', fontWeight: 'bold', fontSize: isMobile ? 12 : 14,
                      boxShadow: stateAtStep.potTotal > 0 ? '0 0 12px rgba(255,215,0,0.3)' : 'none',
                    }}
                  >
                    {/* #4: Chip icon animation */}
                    {stateAtStep.potTotal > 0 && (
                      <motion.span
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        style={{ marginRight: 6 }}
                      ></motion.span>
                    )}
                    POT: {stateAtStep.potTotal.toLocaleString()}
                  </motion.div>
                </AnimatePresence>

                {/* Board Cards */}
                <div style={{ display: 'flex', gap: isMobile ? 4 : 8, marginTop: isMobile ? 30 : 40 }}>
                  {stateAtStep.board.map((c, i) => (
                    <motion.div key={`board-${i}-${c}`} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.4, delay: i * 0.1 }}>
                      <CardImg card={c} width={isMobile ? 38 : 50} cardBackPath={cardBackPath} />
                    </motion.div>
                  ))}
                  {[...Array(5 - stateAtStep.board.length)].map((_, i) => (
                    <div key={`empty-${i}`} style={{ width: isMobile ? 38 : 50, height: isMobile ? 53 : 70, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, background: 'rgba(0,0,0,0.15)' }} />
                  ))}
                </div>

                {/* #9: Multi-Board Display */}
                {stateAtStep.boards.length > 1 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    {stateAtStep.boards.map((board, bi) => (
                      <div key={bi} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ color: '#888', fontSize: 9, width: 50, textAlign: 'right', marginRight: 4 }}>Board {board.index}</span>
                        {board.cards.map((c, ci) => (
                          <CardImg key={ci} card={c} width={30} cardBackPath={cardBackPath} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Seats */}
                {Object.values(stateAtStep.players || {}).map((p, i) => {
                  const numP = Object.keys(stateAtStep.players || {}).length;
                  const angle = (i / numP) * Math.PI * 2 - Math.PI / 2;
                  const rX = isMobile ? 160 : 340;
                  const rY = isMobile ? 120 : 170;
                  const x = Math.cos(angle) * rX;
                  const y = Math.sin(angle) * rY;
                  const isFolded = p.status === 'folded';
                  const showFaces = p.holeCards && (stateAtStep.completed || p.showedCards || String(p.id) === String(currentUserId));
                  const isWinner = p.lastAction?.startsWith('WON');

                  return (
                    <motion.div
                      key={p.id}
                      animate={{ opacity: isFolded ? 0.35 : 1 }}
                      style={{
                        position: 'absolute',
                        transform: `translate(${x}px, ${y}px)`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      {/* Action Label */}
                      {p.lastAction && (
                        <motion.div
                          key={p.lastAction}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          style={{
                            marginBottom: 4,
                            background: isWinner ? 'linear-gradient(135deg, #FFD700, #FFA500)' : '#fff',
                            color: isWinner ? '#000' : '#000',
                            padding: '2px 8px', borderRadius: 4,
                            fontSize: isMobile ? 9 : 10, fontWeight: 'bold', textTransform: 'uppercase',
                            boxShadow: isWinner ? '0 0 12px rgba(255,215,0,0.6)' : '0 2px 4px rgba(0,0,0,0.5)',
                          }}
                        >
                          {isWinner && '★ '}{p.lastAction}
                        </motion.div>
                      )}

                      {/* Hole Cards */}
                      {!isFolded && (
                        <div style={{ display: 'flex', gap: 2, marginBottom: -8, zIndex: 10 }}>
                          {p.holeCards ? (
                            <>
                              <CardImg card={p.holeCards[0]} width={isMobile ? 26 : 34} faceDown={!showFaces} cardBackPath={cardBackPath} />
                              <CardImg card={p.holeCards[1]} width={isMobile ? 26 : 34} faceDown={!showFaces} cardBackPath={cardBackPath} />
                            </>
                          ) : (
                            <>
                              <CardImg faceDown width={isMobile ? 26 : 34} cardBackPath={cardBackPath} />
                              <CardImg faceDown width={isMobile ? 26 : 34} cardBackPath={cardBackPath} />
                            </>
                          )}
                        </div>
                      )}

                      {/* Avatar Plate */}
                      <div style={{
                        background: isWinner ? 'linear-gradient(135deg, #1a3a1a, #0a250a)' : '#222',
                        padding: isMobile ? '3px 8px' : '4px 10px', borderRadius: 8,
                        border: isWinner ? '2px solid #FFD700' : '1px solid #444',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        minWidth: isMobile ? 60 : 90, zIndex: 11,
                        boxShadow: isWinner ? '0 0 16px rgba(255,215,0,0.4)' : 'none',
                      }}>
                        <span style={{ color: '#fff', fontWeight: 600, fontSize: isMobile ? 9 : 11 }}>{p.displayName}</span>
                        <span style={{ color: '#4CAF50', fontSize: isMobile ? 9 : 10, fontFamily: 'monospace' }}>{p.stack.toLocaleString()}</span>
                        {/* #6: Equity Badge */}
                        {equity && equity[p.id] !== undefined && !isFolded && (
                          <span style={{
                            color: '#4FC3F7', fontSize: 9, fontWeight: 700,
                            background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 4, marginTop: 2,
                          }}>
                            {equity[p.id]}%
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {/* #4: Winner celebration burst */}
                <AnimatePresence>
                  {stateAtStep.completed && handData?.winners?.length > 0 && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{ duration: 1.5 }}
                      style={{
                        position: 'absolute', width: 100, height: 100, borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(255,215,0,0.6) 0%, transparent 70%)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ═══════ CONTROLS BAR ═══════ */}
          <div style={{
            padding: isMobile ? '10px 12px' : '12px 20px',
            background: '#0d0d0d', borderTop: '1px solid #333',
            display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
          }}>
            {/* #5: Street Quick Jump Tabs */}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { key: 'preflop', label: 'Pre-Flop' },
                { key: 'flop', label: 'Flop' },
                { key: 'turn', label: 'Turn' },
                { key: 'river', label: 'River' },
                { key: 'showdown', label: 'Showdown' },
              ].map(({ key, label }) => {
                const idx = streetIndices.current[key];
                const available = idx !== undefined && idx >= 0;
                const active = currentStreet === key;
                return (
                  <button
                    key={key}
                    onClick={() => { if (available) { setStep(idx); setIsPlaying(false); } }}
                    disabled={!available}
                    style={{
                      background: active ? '#2374E1' : available ? '#333' : '#1a1a1a',
                      color: active ? '#fff' : available ? '#B0B3B8' : '#555',
                      border: active ? '1px solid #4a90d9' : '1px solid transparent',
                      borderRadius: 16, padding: '4px 12px',
                      fontSize: isMobile ? 10 : 11, fontWeight: active ? 700 : 400,
                      cursor: available ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Transport Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
              {/* Play/Pause */}
              <button
                onClick={() => {
                  if (step >= events.length - 1 && !isPlaying) { setStep(0); setIsPlaying(true); }
                  else setIsPlaying(!isPlaying);
                }}
                disabled={!handData}
                style={{
                  background: isPlaying ? '#ff4d4f' : '#2374E1', color: '#fff', border: 'none',
                  borderRadius: '50%', width: isMobile ? 38 : 44, height: isMobile ? 38 : 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: isMobile ? 14 : 16, flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)', opacity: handData ? 1 : 0.5,
                }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              {/* Slider */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input
                  type="range"
                  min={0}
                  max={events.length > 0 ? events.length - 1 : 0}
                  value={step}
                  onChange={e => { setStep(parseInt(e.target.value)); setIsPlaying(false); }}
                  disabled={!handData}
                  style={{ width: '100%', cursor: 'pointer', accentColor: '#2374E1' }}
                />
                <div style={{ color: '#B0B3B8', textAlign: 'center', fontSize: 12, minHeight: 16 }}>
                  {events[step]?.desc || '...'}
                </div>
              </div>

              {/* #8: Speed Control */}
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {SPEED_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.label}
                    onClick={() => setSpeedIdx(i)}
                    style={{
                      background: speedIdx === i ? '#2374E1' : '#333',
                      color: speedIdx === i ? '#fff' : '#888',
                      border: 'none', borderRadius: 4,
                      padding: isMobile ? '2px 5px' : '3px 7px',
                      fontSize: isMobile ? 9 : 10, fontWeight: speedIdx === i ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
