/**
 * LIVE POKER TABLE — Real-Time Multiplayer
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Connects to the poker engine via Supabase Realtime (RealtimeSync).
 * Uses the custom PNG card deck from /public/cards/.
 * Based on the Golden Template table layout.
 * 
 * Features:
 *   - Real-time game state via Supabase channels
 *   - Animated card dealing & community cards
 *   - Action buttons (fold/check/call/bet/raise/all-in)
 *   - Bet slider with preset amounts
 *   - Turn timer with timebank display
 *   - Seat selection & buy-in dialog
 *   - Pot display with side pots
 *   - Chat overlay
 *   - Responsive (desktop + tablet)
 * 
 * Props:
 *   - tableId: string
 *   - supabase: Supabase client instance
 *   - userId: current user's ID
 *   - displayName: current user's display name
 *   - avatarUrl: current user's avatar
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PokerSoundManager } from './PokerSoundManager';
import ThrowableEmojis from './ThrowableEmojis';
import BBJTicker from './BBJTicker';
import { getHandStrength } from '../../lib/handStrength';
import { dealSeatAvatars, HERO_DEFAULT_AVATAR } from '../../lib/tableAvatars';

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

import {
  TABLE_THEMES, getStoredThemeId, getStoredCardBack,
  getActiveTheme,
} from './TableThemes';
import ThemePicker from './ThemePicker';
import PlayerNoteModal from './PlayerNoteModal';
import PlayerQuickView from './PlayerQuickView';
import LiveStatsDashboard from './LiveStatsDashboard';
import PotOddsHUD from './PotOddsHUD';
// ═══════════════════════════════════════════════════════════════════════════
// BET CHIP ANIMATION — chips fly from player to pot center
// ═══════════════════════════════════════════════════════════════════════════

function BetChipAnimation({ tableState }) {
  const [chips, setChips] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    const la = tableState?.game?.lastAction;
    if (!la || !la.seatIndex || !['bet', 'raise', 'call'].includes(la.type) || !la.amount) return;

    // We only animate the bet chips *entering* the pot area
    const id = ++idRef.current;
    
    // Position mappings
    const seatIdx = la.seatIndex;
    const maxSeats = tableState.seats?.length || 9;
    
    // Rough estimate of seat position coordinates (0,0 is center of table)
    const angle = (seatIdx / maxSeats) * Math.PI * 2;
    const startX = Math.sin(angle) * 150;
    const startY = -Math.cos(angle) * 150;

    setChips(prev => [...prev.slice(-3), { id, startX, startY, amount: la.amount }]);
    
    // Play sound and remove from DOM after arrival
    const t = setTimeout(() => {
      if (window.pokerSound) window.pokerSound.play('bet');
      setChips(prev => prev.filter(c => c.id !== id));
    }, 600);
    
    return () => clearTimeout(t);
  }, [tableState?.game?.lastAction?.seq]);

  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', zIndex: 20 }}>
      {chips.map(chip => (
        <motion.div
          key={chip.id}
          initial={{ x: chip.startX, y: chip.startY, scale: 0.5, opacity: 0 }}
          animate={{ x: 0, y: -40, scale: 1, opacity: 1 }} // Aim for exactly PotDisplay coordinate (Y:-40 via 28% top)
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          style={{
            position: 'absolute', width: 20, height: 20, borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, #4facfe, #00f2fe)`,
            border: '2px solid rgba(255,255,255,0.8)',
            boxShadow: '0 4px 8px rgba(0,0,0,0.4), inset 0 -2px 4px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 900, color: '#000', marginLeft: -10, marginTop: -10,
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
import HandReplayerModal from './HandReplayerModal';
import {
  TableEmojiBar, FloatingReaction, AnalyticsSidebar,
  PlayerNotesPopup, getPlayerNoteColor, getPlayerNoteText,
  SessionSummaryModal, SpectatorBadge,
  ReconnectionOverlay, ReportHandButton,
  ConnectionQualityHUD,
  usePingMeasurement, checkAutoRebuy, checkEmojiRateLimit,
} from './TableExperienceComponents';
import { eventBus, EventType } from '../../engine/EventBus';
import ClubArenaMessenger from '../club-arena/ClubArenaMessenger';
import { saveAppSetting } from '../../lib/appSettingsSync';

// ═══════════════════════════════════════════════════════════════════════════
// MYSTERY BOUNTY ENVELOPE OVERLAY
// ═══════════════════════════════════════════════════════════════════════════

function MysteryBountyOverlay({ amount, onComplete }) {
  useEffect(() => {
    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => onComplete(), 6000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(5px)',
      }}
    >
      <motion.div
        initial={{ y: -500, rotate: -20, scale: 0.5 }}
        animate={{ y: 0, rotate: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 100 }}
        style={{
          width: 320, height: 200,
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          borderRadius: 16,
          position: 'relative',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 40px rgba(255,215,0,0.4)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          border: '2px solid #FFF8DC',
        }}
      >
        {/* Envelope Flap Opening Animation */}
        <motion.div
          initial={{ rotateX: 0 }}
          animate={{ rotateX: 180 }}
          transition={{ delay: 1.5, duration: 0.8, ease: 'easeIn' }}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
            background: 'linear-gradient(180deg, #FFE4B5 0%, #FFD700 100%)',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            transformOrigin: 'top',
            zIndex: 10,
            borderBottom: '1px solid rgba(0,0,0,0.2)',
          }}
        />

        {/* Revealed Bounty Amount */}
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1.2 }}
          transition={{ delay: 2.3, type: 'spring', bounce: 0.6 }}
          style={{
            background: '#fff',
            padding: '20px 40px',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            zIndex: 5,
            textAlign: 'center',
            border: '2px dashed #FFD700',
          }}
        >
          <div style={{ color: '#8B6508', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
            Mystery Bounty
          </div>
          <div style={{ color: '#22C55E', fontSize: 42, fontWeight: 900, textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            +${(amount || 0).toLocaleString()}
          </div>
        </motion.div>
      </motion.div>

      {/* Confetti particles */}
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{
            x: 0, y: 0, opacity: 0, scale: 0
          }}
          animate={{
            x: (Math.random() - 0.5) * window.innerWidth,
            y: (Math.random() - 0.5) * window.innerHeight,
            opacity: [0, 1, 1, 0],
            scale: [0, Math.random() + 0.5, 0],
            rotate: Math.random() * 360 * 5,
          }}
          transition={{
            delay: 2.3,
            duration: 2 + Math.random() * 2,
            ease: "easeOut"
          }}
          style={{
            position: 'absolute',
            width: 10 + Math.random() * 10,
            height: 10 + Math.random() * 10,
            background: ['#FFD700', '#FF3366', '#00FFCC', '#FF9933'][Math.floor(Math.random() * 4)],
            borderRadius: Math.random() > 0.5 ? '50%' : '0%',
            zIndex: 9998,
          }}
        />
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOATING ACTION LABEL — rises from seat when player acts
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_LABEL_COLORS = {
  fold: '#ef4444', check: '#3b82f6', call: '#22c55e',
  bet: '#f59e0b', raise: '#f59e0b', all_in: '#a855f7',
};

// Player note type → badge color mapping (hoisted from render loop for performance)
const NOTE_TYPE_COLORS_MAP = {
  fish: '#22c55e', shark: '#ef4444', whale: '#3b82f6',
  nit: '#9ca3af', lag: '#f97316', tag: '#a855f7', reg: '#14b8a6',
};

// ═══════════════════════════════════════════════════════════════════════════
// WAVE F: RABBIT HUNT OVERLAY — reveal community cards after fold
// ═══════════════════════════════════════════════════════════════════════════

function RabbitHuntOverlay({ cards, onClose }) {
  const hasCards = cards?.length > 0;
  useEffect(() => {
    if (!hasCards) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose, hasCards]);
  if (!hasCards) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      style={{
        position: 'absolute', top: '35%', left: '50%', transform: 'translateX(-50%)',
        zIndex: 70, background: 'rgba(20,21,23,0.95)', borderRadius: 16,
        padding: '10px 20px', border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}></span>
        <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>RABBIT HUNT</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {cards.map((c, i) => (
          <motion.div
            key={i}
            initial={{ rotateY: 180, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ delay: i * 0.3, duration: 0.5 }}
            style={{
              width: 44, height: 62, borderRadius: 6,
              background: 'linear-gradient(135deg, #1a1a2e, #2a2a4e)',
              border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'monospace',
            }}
          >{c || '?'}</motion.div>
        ))}
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 10, cursor: 'pointer' }}>Dismiss</button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE F: AUTO TOP-UP BADGE — prominent stack-area toggle
// ═══════════════════════════════════════════════════════════════════════════

function AutoTopUpBadge({ isOn, onToggle, stack, maxBuyIn }) {
  if (!maxBuyIn || stack >= maxBuyIn) return null;
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onToggle}
      style={{
        position: 'absolute', bottom: 2, right: -2, zIndex: 25,
        background: isOn
          ? 'linear-gradient(135deg, rgba(52,199,89,0.3), rgba(52,199,89,0.15))'
          : 'rgba(255,255,255,0.05)',
        border: `1px solid ${isOn ? 'rgba(52,199,89,0.5)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 8, padding: '2px 6px',
        color: isOn ? '#34C759' : '#888', fontSize: 9, fontWeight: 700,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
        boxShadow: isOn ? '0 0 8px rgba(52,199,89,0.3)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      {isOn ? 'Auto' : ''}
      {isOn && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34C759', animation: 'pulse 1.5s infinite' }} />}
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE F: POT ODDS TOOLTIP — show odds vs call amount
// ═══════════════════════════════════════════════════════════════════════════

function PotOddsTooltip({ potTotal, callAmount, isVisible }) {
  if (!isVisible || !callAmount || callAmount <= 0) return null;
  const potOdds = (callAmount / (potTotal + callAmount) * 100).toFixed(1);
  const ratio = (potTotal / callAmount).toFixed(1);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      style={{
        position: 'absolute', top: '38%', left: '50%', transform: 'translateX(-50%)',
        zIndex: 45, background: 'rgba(20,21,23,0.92)', borderRadius: 10,
        padding: '5px 14px', border: '1px solid rgba(79,172,254,0.3)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
        display: 'flex', gap: 12, alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#4facfe', fontSize: 14, fontWeight: 800 }}>{potOdds}%</div>
        <div style={{ color: '#888', fontSize: 9, fontWeight: 600 }}>POT ODDS</div>
      </div>
      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#4ade80', fontSize: 14, fontWeight: 800 }}>{ratio}:1</div>
        <div style={{ color: '#888', fontSize: 9, fontWeight: 600 }}>RATIO</div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE F: QUICK EMOJI BAR — one-tap floating emoji reactions
// ═══════════════════════════════════════════════════════════════════════════

function QuickEmojiBar({ onSend, disabled }) {
  const quickEmojis = ['👍', '🔥', '😂', '💪', '😱', '🎯'];
  return (
    <div style={{
      position: 'absolute', bottom: 85, right: 8, zIndex: 35,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {quickEmojis.map(emoji => (
        <motion.button
          key={emoji}
          whileHover={{ scale: 1.3 }}
          whileTap={{ scale: 0.8 }}
          onClick={() => !disabled && onSend?.(emoji)}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(30,31,34,0.85)', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1, backdropFilter: 'blur(6px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >{emoji}</motion.button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE F: SESSION SPARKLINE — mini SVG P&L chart
// ═══════════════════════════════════════════════════════════════════════════

function SessionSparkline({ history, width = 120, height = 32 }) {
  if (!history || history.length < 2) return null;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const lastVal = history[history.length - 1];
  const firstVal = history[0];
  const color = lastVal >= firstVal ? '#4ade80' : '#ef5350';
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={0} y1={height - ((firstVal - min) / range) * (height - 4) - 2}
            x2={width} y2={height - ((firstVal - min) / range) * (height - 4) - 2}
            stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} strokeDasharray="3,3" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE F: TABLE LAYOUT MANAGER — save/load multi-table arrangements
// ═══════════════════════════════════════════════════════════════════════════

function TableLayoutManager({ onClose }) {
  const [layouts, setLayouts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('poker-table-layouts') || '[]'); } catch { return []; }
  });

  // J3: Load layouts from Supabase on mount (merge with localStorage)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sb = window.__SUPABASE_CLIENT;
    const uid = window.__POKER_USER_ID;
    if (!sb || !uid) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await sb.from('poker_table_layouts')
          .select('name, arrangement, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(20);
        if (cancelled || !data?.length) return;
        setLayouts(prev => {
          const existingNames = new Set(prev.map(l => l.name));
          const newLayouts = data
            .filter(d => !existingNames.has(d.name))
            .map(d => ({ name: d.name, arrangement: d.arrangement?.arrangement || 'saved', createdAt: new Date(d.created_at).getTime() }));
          if (newLayouts.length === 0) return prev;
          const merged = [...prev, ...newLayouts];
          try { localStorage.setItem('poker-table-layouts', JSON.stringify(merged)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
          return merged;
        });
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveLayout = () => {
    const name = prompt('Layout name:');
    if (!name?.trim()) return;
    const layout = {
      name: name.trim(),
      arrangement: 'saved',
      createdAt: Date.now(),
    };
    const updated = [...layouts, layout];
    setLayouts(updated);
    try {
      localStorage.setItem('poker-table-layouts', JSON.stringify(updated));
      eventBus.emit('TABLE_LAYOUT_SAVED', layout);
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    // I4: Save to Supabase
    if (typeof window !== 'undefined') {
      try {
        const sb = window.__SUPABASE_CLIENT;
        const uid = window.__POKER_USER_ID;
        if (sb && uid) {
          sb.from('poker_table_layouts').insert({
            user_id: uid,
            name: layout.name,
            arrangement: { arrangement: layout.arrangement, createdAt: layout.createdAt },
          }).then(() => {}).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }
  };

  const loadLayout = (lay) => {
    eventBus.emit('TABLE_LAYOUT_CHANGED', lay);
    onClose?.();
  };

  const deleteLayout = (idx) => {
    const updated = layouts.filter((_, i) => i !== idx);
    setLayouts(updated);
    try { localStorage.setItem('poker-table-layouts', JSON.stringify(updated)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    // I4: Delete from Supabase by name
    if (typeof window !== 'undefined') {
      try {
        const sb = window.__SUPABASE_CLIENT;
        const uid = window.__POKER_USER_ID;
        if (sb && uid && layouts[idx]?.name) {
          sb.from('poker_table_layouts').delete()
            .eq('user_id', uid).eq('name', layouts[idx].name)
            .then(() => {}).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: 'fixed', bottom: 60, right: 12, zIndex: 200,
        background: 'rgba(24,25,26,0.97)', borderRadius: 12,
        padding: 16, width: 220, border: '1px solid #3E4042',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 700 }}>Layouts</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#B0B3B8', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>
      <button onClick={saveLayout} style={{
        width: '100%', padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
        background: 'rgba(79,172,254,0.15)', border: '1px solid rgba(79,172,254,0.3)',
        color: '#4facfe', cursor: 'pointer', marginBottom: 8,
      }}>+ Save Current Layout</button>
      {layouts.length === 0 && <div style={{ color: '#666', fontSize: 11, textAlign: 'center', padding: 8 }}>No saved layouts</div>}
      {layouts.map((lay, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => loadLayout(lay)} style={{ background: 'none', border: 'none', color: '#E4E6EB', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>{lay.name}</button>
          <button onClick={() => deleteLayout(i)} style={{ background: 'none', border: 'none', color: '#ef5350', fontSize: 10, cursor: 'pointer' }}>✕</button>
        </div>
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE H1: ANIMATED CHIP STACK VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════

function ChipStackViz({ stack, bigBlind }) {
  if (!stack || !bigBlind || stack <= 0) return null;
  const bbCount = stack / bigBlind;
  // Render 1-5 chip layers based on stack depth
  const layers = Math.min(5, Math.max(1, Math.ceil(bbCount / 25)));
  const chipColors = ['#e53935', '#43a047', '#1e88e5', '#8e24aa', '#ff8f00'];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column-reverse', alignItems: 'center',
      gap: 0, position: 'relative', height: layers * 6 + 8, width: 22,
    }}>
      {Array.from({ length: layers }, (_, i) => (
        <motion.div
          key={i}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: i * 0.08, duration: 0.25 }}
          style={{
            width: 20, height: 6, borderRadius: 3,
            background: `linear-gradient(90deg, ${chipColors[i]}, ${chipColors[i]}cc)`,
            border: '1px solid rgba(255,255,255,0.25)',
            boxShadow: `0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`,
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE I15: POT SCOOP ANIMATION — chips fly from pot center to winner
// ═══════════════════════════════════════════════════════════════════════════

function PotScoopAnimation({ isActive, winnerPosition }) {
  if (!isActive || !winnerPosition) return null;
  // Convert numeric percentages to CSS left/top positioning
  const targetLeft = `${winnerPosition.x}%`;
  const targetTop = `${winnerPosition.y}%`;
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="pot-scoop"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.5, delay: 0.8 }}
          style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none' }}
        >
          {[0, 1, 2, 3, 4].map(i => (
            <motion.div
              key={i}
              initial={{ left: '50%', top: '40%', scale: 1, opacity: 1 }}
              animate={{ left: targetLeft, top: targetTop, scale: 0.4, opacity: 0 }}
              transition={{
                duration: 0.7 + i * 0.1,
                delay: i * 0.08,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              style={{
                position: 'absolute',
                width: 16, height: 16, borderRadius: '50%',
                background: `radial-gradient(circle, ${['#FFD700', '#e53935', '#43a047', '#1e88e5', '#ff8f00'][i]}, ${['#FFA000', '#c62828', '#2e7d32', '#0d47a1', '#e65100'][i]})`,
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                marginLeft: -8, marginTop: -8,
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE H3: WIN AMOUNT FLY-UP — gold text + sparkle particles on hero win
// ═══════════════════════════════════════════════════════════════════════════

function WinFlyUp({ amount, isVisible }) {
  // Pre-compute sparkle offsets — must be before early return (hooks rules)
  const offsets = useMemo(() => [0, 1, 2, 3, 4].map(i => ({
    x: (i - 2) * 25 + (Math.sin(i * 1.7) * 10),
    y: -(20 + (Math.cos(i * 2.3) * 15 + 15)),
  })), []);
  if (!isVisible || !amount || amount <= 0) return null;
  const formatted = amount >= 1000 ? `${(amount / 1000).toFixed(1)}K` : amount.toLocaleString();
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="win-fly"
          initial={{ opacity: 0, y: 20, scale: 0.5 }}
          animate={{ opacity: 1, y: -30, scale: 1.2 }}
          exit={{ opacity: 0, y: -80, scale: 0.8 }}
          transition={{ duration: 1.8, ease: 'easeOut' }}
          style={{
            position: 'absolute', bottom: '55%', left: '50%', transform: 'translateX(-50%)',
            zIndex: 80, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}
        >
          <div style={{
            fontSize: 28, fontWeight: 900, letterSpacing: -0.5,
            background: 'linear-gradient(135deg, #FFD700, #FFA000, #FFD700)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            textShadow: '0 0 20px rgba(255,215,0,0.6)',
            filter: 'drop-shadow(0 2px 8px rgba(255,215,0,0.4))',
          }}>
            +{formatted}
          </div>
          {/* Sparkle particles — offsets are stable across re-renders */}
          {offsets.map((off, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 1, x: 0, y: 0 }}
              animate={{ opacity: 0, x: off.x, y: off.y }}
              transition={{ duration: 1.2, delay: 0.2 + i * 0.1 }}
              style={{ position: 'absolute', fontSize: 10, pointerEvents: 'none' }}
            ></motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE H4: TABLE FELT CUSTOMIZATION — choose felt color/texture
// ═══════════════════════════════════════════════════════════════════════════

const FELT_OPTIONS = [
  { id: 'classic-green', label: 'Classic Green', color: '#0d5a2e', gradient: 'radial-gradient(ellipse, #1a7a42 0%, #0d5a2e 60%, #064020 100%)' },
  { id: 'royal-blue', label: 'Royal Blue', color: '#0a3d6e', gradient: 'radial-gradient(ellipse, #1565c0 0%, #0a3d6e 60%, #062a4e 100%)' },
  { id: 'wine-red', label: 'Wine Red', color: '#6d1b2a', gradient: 'radial-gradient(ellipse, #9c2340 0%, #6d1b2a 60%, #461220 100%)' },
  { id: 'midnight', label: 'Midnight', color: '#1a1a2e', gradient: 'radial-gradient(ellipse, #2a2a4e 0%, #1a1a2e 60%, #0f0f1e 100%)' },
  { id: 'purple-haze', label: 'Purple Haze', color: '#2d1b4e', gradient: 'radial-gradient(ellipse, #4a2f80 0%, #2d1b4e 60%, #1a1030 100%)' },
  { id: 'emerald', label: 'Emerald', color: '#064e3b', gradient: 'radial-gradient(ellipse, #10b981 0%, #064e3b 60%, #023020 100%)' },
];

function FeltColorPicker({ currentFelt, onSelect, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: 'fixed', bottom: 60, left: 12, zIndex: 200,
        background: 'rgba(24,25,26,0.97)', borderRadius: 12,
        padding: 16, width: 200, border: '1px solid #3E4042',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 700 }}>Table Felt</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#B0B3B8', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {FELT_OPTIONS.map(f => (
          <motion.button
            key={f.id}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSelect(f.id)}
            style={{
              width: '100%', aspectRatio: '1', borderRadius: 8,
              background: f.gradient, border: currentFelt === f.id ? '2px solid #4facfe' : '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer', position: 'relative', overflow: 'hidden',
            }}
          >
            {currentFelt === f.id && <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 10 }}>✓</span>}
          </motion.button>
        ))}
      </div>
      <div style={{ marginTop: 6, textAlign: 'center', color: '#888', fontSize: 9 }}>
        {FELT_OPTIONS.find(f => f.id === currentFelt)?.label || 'Classic Green'}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE H8: AUTO-MUCK FLASH — visual confirmation when hand is auto-mucked
// ═══════════════════════════════════════════════════════════════════════════

function AutoMuckFlash({ isVisible }) {
  if (!isVisible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 0.9] }}
      transition={{ duration: 1.5, times: [0, 0.15, 0.7, 1] }}
      style={{
        position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
        zIndex: 80, background: 'rgba(139, 92, 246, 0.2)', borderRadius: 10,
        padding: '6px 18px', border: '1px solid rgba(139, 92, 246, 0.4)',
        display: 'flex', alignItems: 'center', gap: 6,
        boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)', backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
      }}
    >
      <span style={{ fontSize: 14 }}></span>
      <span style={{ color: '#c4b5fd', fontSize: 12, fontWeight: 700 }}>Cards Mucked</span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE H14: STACK GRAPH MODAL — full-screen expandable sparkline
// ═══════════════════════════════════════════════════════════════════════════

function StackGraphModal({ history, startingStack, onClose, formatStack }) {
  const [hoverPt, setHoverPt] = useState(null);
  if (!history || history.length < 2) return null;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const W = 600, H = 250, PAD = 40;

  const points = history.map((v, i) => ({
    x: PAD + (i / (history.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (v - min) / range) * (H - PAD * 2),
    val: v,
    hand: i + 1,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const lastVal = history[history.length - 1];
  const firstVal = history[0];
  const net = lastVal - firstVal;
  const color = net >= 0 ? '#4ade80' : '#ef5350';
  const fmt = formatStack || (v => v.toLocaleString());

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: 'rgba(24,25,26,0.97)', borderRadius: 16, padding: 24,
        border: '1px solid #3E4042', boxShadow: '0 16px 64px rgba(0,0,0,0.8)',
        maxWidth: '90vw', width: W + 48,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ color: '#E4E6EB', fontSize: 16, fontWeight: 800 }}>Session Stack Graph</div>
            <div style={{ color: '#888', fontSize: 11 }}>{history.length} hands played</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color, fontSize: 18, fontWeight: 900 }}>{net >= 0 ? '+' : ''}{fmt(net)}</div>
            <div style={{ color: '#888', fontSize: 10 }}>Net P&L</div>
          </div>
        </div>
        <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => {
            const y = PAD + f * (H - PAD * 2);
            const val = max - f * range;
            return (
              <React.Fragment key={f}>
                <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
                <text x={PAD - 6} y={y + 3} fill="#666" fontSize={8} textAnchor="end">{fmt(Math.round(val))}</text>
              </React.Fragment>
            );
          })}
          {/* Starting stack reference line */}
          {startingStack != null && (
            <line x1={PAD} y1={PAD + (1 - (startingStack - min) / range) * (H - PAD * 2)}
                  x2={W - PAD} y2={PAD + (1 - (startingStack - min) / range) * (H - PAD * 2)}
                  stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} strokeDasharray="4,4" />
          )}
          {/* Area fill */}
          <path
            d={`${pathD} L${points[points.length - 1].x},${H - PAD} L${PAD},${H - PAD} Z`}
            fill={`${color}15`}
          />
          {/* Line */}
          <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {/* I8: Hover tooltip circles */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x} cy={p.y} r={8}
              fill="transparent" stroke="none"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverPt(p)}
              onMouseLeave={() => setHoverPt(null)}
            />
          ))}
          {/* Current point */}
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
          {/* Hover point highlight */}
          {hoverPt && <circle cx={hoverPt.x} cy={hoverPt.y} r={5} fill={color} stroke="#fff" strokeWidth={2} />}
        </svg>
        {/* I8: Hover tooltip */}
        {hoverPt && (
          <div style={{
            position: 'absolute', left: hoverPt.x + 24, top: hoverPt.y + 40,
            background: 'rgba(0,0,0,0.9)', color: '#fff', padding: '4px 10px',
            borderRadius: 6, fontSize: 11, fontWeight: 700, pointerEvents: 'none',
            whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.15)',
            zIndex: 10,
          }}>
            Hand #{hoverPt.hand}: {fmt(hoverPt.val)}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '0 8px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 800 }}>{fmt(max)}</div>
            <div style={{ color: '#888', fontSize: 9 }}>Peak</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#ef5350', fontSize: 13, fontWeight: 800 }}>{fmt(min)}</div>
            <div style={{ color: '#888', fontSize: 9 }}>Valley</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 800 }}>{fmt(lastVal)}</div>
            <div style={{ color: '#888', fontSize: 9 }}>Current</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          {/* G5: Export as PNG */}
          <button onClick={(e) => {
            e.stopPropagation();
            const svgEl = e.target.closest('div')?.parentElement?.querySelector('svg');
            if (!svgEl) return;
            const svgData = new XMLSerializer().serializeToString(svgEl);
            const canvas = document.createElement('canvas');
            canvas.width = W * 2; canvas.height = H * 2;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#18191a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const a = document.createElement('a');
              a.download = `stack-graph-${Date.now()}.png`;
              a.href = canvas.toDataURL('image/png');
              a.click();
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
          }} style={{
            padding: '6px 18px', borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(79,195,247,0.2), rgba(79,195,247,0.1))',
            border: '1px solid rgba(79,195,247,0.3)', color: '#4fc3f7',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>Export PNG</button>
          {/* G5: Share text summary */}
          <button onClick={(e) => {
            e.stopPropagation();
            const text = `Session Stack Graph\n${history.length} hands\nNet: ${net >= 0 ? '+' : ''}${fmt(net)}\nPeak: ${fmt(max)} | Valley: ${fmt(min)}\nsmarter.poker`;
            navigator.clipboard?.writeText(text)?.then(() => {
              try { eventBus.emit('SOUND_PLAY', { id: 'notify' }); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            });
          }} style={{
            padding: '6px 18px', borderRadius: 8,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#B0B3B8', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>Copy Summary</button>
          <button onClick={onClose} style={{
            padding: '6px 24px', borderRadius: 8,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#B0B3B8', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>Close</button>
        </div>
      </div>
    </motion.div>
  );
}

function FloatingActionLabel({ action, amount, position }) {
  if (!action || !position) return null;
  const color = ACTION_LABEL_COLORS[action] || '#fff';
  const label = action === 'all_in' ? 'ALL-IN'
    : action === 'fold' ? 'FOLD'
      : action === 'check' ? 'CHECK'
        : action === 'call' ? `CALL ${amount ? amount.toLocaleString() : ''}`
          : action === 'bet' ? `BET ${amount ? amount.toLocaleString() : ''}`
            : action === 'raise' ? `RAISE ${amount ? amount.toLocaleString() : ''}`
              : action.toUpperCase();

  return (
    <motion.div
      key={`action-${Date.now()}`}
      initial={{ opacity: 1, y: 0, scale: 0.7 }}
      animate={{ opacity: 0, y: -40, scale: 1.1 }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y - 8}%`,
        transform: 'translate(-50%, -100%)',
        color,
        fontSize: 13,
        fontWeight: 900,
        textShadow: `0 0 8px ${color}80, 0 2px 4px rgba(0,0,0,0.8)`,
        letterSpacing: 1,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 80,
      }}
    >
      {label}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFETTI BURST — particle celebration on big pot wins (50× BB+)
// ═══════════════════════════════════════════════════════════════════════════

function ConfettiBurst({ active }) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!active) { setParticles([]); return; }
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#a855f7', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899'];
    const newParticles = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 80,
      y: 30 + (Math.random() - 0.5) * 40,
      color: colors[i % colors.length],
      size: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
      delay: Math.random() * 0.3,
    }));
    setParticles(newParticles);
    const t = setTimeout(() => setParticles([]), 2500);
    return () => clearTimeout(t);
  }, [active]);

  if (!particles.length) return null;

  return (
    <>
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ left: '50%', top: '40%', opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            left: `${p.x}%`, top: `${p.y}%`,
            opacity: 0, scale: [1, 1.5, 0.5],
            rotate: p.rotation,
          }}
          transition={{ duration: 1.8, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: p.size, height: p.size,
            background: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            pointerEvents: 'none',
            zIndex: 90,
            boxShadow: `0 0 4px ${p.color}80`,
          }}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THEME PARTICLES — Dynamic background weather/effects based on theme
// ═══════════════════════════════════════════════════════════════════════════

function ThemeParticles({ config }) {
  if (!config) return null;
  const { type, count } = config;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 10 }}>
      <style>
        {`
          @keyframes driftDown {
            0% { transform: translateY(-10%) translateX(0); opacity: 0; }
            10% { opacity: 0.8; }
            90% { opacity: 0.8; }
            100% { transform: translateY(110%) translateX(20px); opacity: 0; }
          }
          @keyframes floatUp {
            0% { transform: translateY(110%) scale(0.5); opacity: 0; }
            50% { opacity: 0.6; }
            100% { transform: translateY(-10%) scale(1.2); opacity: 0; }
          }
          @keyframes firefly {
            0%, 100% { opacity: 0; transform: translate(0, 0) scale(1); }
            50% { opacity: 0.8; transform: translate(15px, -15px) scale(1.5); }
          }
        `}
      </style>
      {Array.from({ length: count }).map((_, i) => {
        let animName = '';
        let color = '#fff';
        let size = 3;

        if (type === 'snow') {
          animName = 'driftDown';
          size = 2 + Math.random() * 3;
          color = 'rgba(255,255,255,0.7)';
        } else if (type === 'goldDust') {
          animName = 'floatUp';
          size = 1 + Math.random() * 2;
          color = 'rgba(255,215,0,0.6)';
        } else if (type === 'fireflies') {
          animName = 'firefly';
          size = 2 + Math.random() * 2;
          color = 'rgba(167,243,208,0.8)'; // Greenish glow
        }

        const left = Math.random() * 100;
        const dur = (type === 'fireflies' ? 3 : 8) + Math.random() * 5;
        const delay = Math.random() * -10;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: left + '%',
              top: type === 'fireflies' ? (20 + Math.random() * 60) + '%' : '-10%',
              width: size,
              height: size,
              background: color,
              borderRadius: '50%',
              boxShadow: type === 'goldDust' || type === 'fireflies' ? `0 0 5px ${color}` : 'none',
              animation: `${animName} ${dur}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND STRENGTH METER — visual indicator for hero's relative hand strength
// ═══════════════════════════════════════════════════════════════════════════

const HAND_STRENGTH_RANKS = [
  { min: 0, max: 15, label: 'Weak', color: '#ef4444', glow: 'rgba(239,68,68,0.3)' },
  { min: 15, max: 35, label: 'Marginal', color: '#f97316', glow: 'rgba(249,115,22,0.3)' },
  { min: 35, max: 55, label: 'Medium', color: '#eab308', glow: 'rgba(234,179,8,0.3)' },
  { min: 55, max: 75, label: 'Strong', color: '#22c55e', glow: 'rgba(34,197,94,0.3)' },
  { min: 75, max: 90, label: 'Premium', color: '#3b82f6', glow: 'rgba(59,130,246,0.3)' },
  { min: 90, max: 101, label: 'Monster', color: '#a855f7', glow: 'rgba(168,85,247,0.4)' },
];

// Simple heuristic hand strength evaluator (preflop + postflop)
// Returns 0-100 representing relative strength
function evaluateHandStrength(holeCards, board) {
  if (!holeCards || holeCards.length < 2) return null;
  const RANKS_ORDER = '23456789TJQKA';
  const cardRank = (c) => {
    if (typeof c === 'number') return c >> 2;
    if (typeof c === 'string') {
      const r = c.slice(0, -1).toUpperCase().replace('10', 'T');
      return RANKS_ORDER.indexOf(r);
    }
    return c?.rank != null ? c.rank : 0;
  };
  const cardSuit = (c) => {
    if (typeof c === 'number') return c & 3;
    if (typeof c === 'string') return c.slice(-1).toLowerCase().charCodeAt(0);
    return c?.suit ?? 0;
  };

  const r1 = cardRank(holeCards[0]);
  const r2 = cardRank(holeCards[1]);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const isPair = r1 === r2;
  const isSuited = cardSuit(holeCards[0]) === cardSuit(holeCards[1]);
  const gap = high - low;
  const isConnected = gap === 1;

  // Base preflop strength (0-100)
  let strength = 0;
  if (isPair) {
    strength = 40 + (high / 12) * 55; // AA = 95, 22 = 40
  } else {
    strength = (high / 12) * 35 + (low / 12) * 15; // AKo ~50
    if (isSuited) strength += 8;
    if (isConnected) strength += 5;
    if (gap <= 2) strength += 3;
    if (gap >= 5) strength -= 5;
  }

  // Postflop adjustments if board is present
  if (board && board.length >= 3) {
    const boardRanks = board.map(c => cardRank(c));
    const allRanks = [r1, r2, ...boardRanks];
    const rankCounts = {};
    allRanks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const maxCount = Math.max(...Object.values(rankCounts || {}));
    const pairCount = Object.values(rankCounts || {}).filter(c => c === 2).length;

    // Made hand bonuses
    if (maxCount >= 4) strength = Math.max(strength, 92); // Quads
    else if (maxCount === 3 && pairCount >= 1) strength = Math.max(strength, 88); // Full House
    else if (maxCount === 3) strength = Math.max(strength, 75); // Trips
    else if (pairCount >= 2) strength = Math.max(strength, 65); // Two Pair
    else if (maxCount === 2 && (rankCounts[r1] === 2 || rankCounts[r2] === 2)) {
      // Hero has a pair with the board
      const pairedRank = rankCounts[r1] === 2 ? r1 : r2;
      const isTopPair = pairedRank >= Math.max(...boardRanks);
      strength = Math.max(strength, isTopPair ? 60 : 45);
    }

    // Flush check (simplified — checks if hero has 2 cards of same suit as 3+ board cards)
    const allSuits = [cardSuit(holeCards[0]), cardSuit(holeCards[1]), ...board.map(c => cardSuit(c))];
    const suitCounts = {};
    allSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const heroSuits = [cardSuit(holeCards[0]), cardSuit(holeCards[1])];
    heroSuits.forEach(hs => {
      if ((suitCounts[hs] || 0) >= 5) strength = Math.max(strength, 82); // Flush
      else if ((suitCounts[hs] || 0) >= 4 && isSuited) strength = Math.max(strength, 55); // Flush draw
    });

    // Overcards (both cards above all board cards)
    if (r1 > Math.max(...boardRanks) && r2 > Math.max(...boardRanks) && maxCount < 2) {
      strength = Math.max(strength, 30);
    }
  }

  return Math.min(100, Math.max(0, Math.round(strength)));
}

function HandStrengthMeter({ holeCards, board, visible, fourColorDeck }) {
  if (!visible || !holeCards || holeCards.length < 2) return null;
  const strength = evaluateHandStrength(holeCards, board);
  if (strength == null) return null;
  const tier = HAND_STRENGTH_RANKS.find(t => strength >= t.min && strength < t.max) || HAND_STRENGTH_RANKS[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(0,0,0,0.8)', borderRadius: 8,
        padding: '3px 10px', border: `1px solid ${tier.color}40`,
        boxShadow: `0 0 12px ${tier.glow}`,
        marginTop: 4,
      }}
    >
      {/* Strength bar */}
      <div style={{ width: 50, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${strength}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ height: '100%', background: tier.color, borderRadius: 3 }}
        />
      </div>
      {/* Label */}
      <span style={{ fontSize: 9, fontWeight: 700, color: tier.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {tier.label}
      </span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND HISTORY DRAWER — scrollable session hand log
// ═══════════════════════════════════════════════════════════════════════════

function HandHistoryDrawer({ isOpen, onClose, hands = [], formatStack }) {
  const [expandedId, setExpandedId] = useState(null);
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 340, maxWidth: '85vw',
          background: 'rgba(18, 18, 20, 0.95)', backdropFilter: 'blur(20px)',
          borderLeft: '1px solid rgba(255,255,255,0.08)', zIndex: 200,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#E4E6EB' }}>Hand History</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#8E8E93' }}>{hands.length} hands</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8E8E93', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Scrollable list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {hands.length === 0 && (
            <div style={{ textAlign: 'center', color: '#6B7280', padding: 40, fontSize: 13 }}>
              No hands played yet
            </div>
          )}
          {hands.map((h, idx) => {
            const winnerNames = h.winners?.map(w => w.displayName || w.playerName || 'Player').join(', ') || 'Unknown';
            const heroWon = h.winners?.some(w => w.isHero);
            const timeAgo = Math.round((Date.now() - h.ts) / 60000);
            const pnlColor = heroWon ? '#22c55e' : '#ef4444';
            const isExpanded = expandedId === (h.handId || idx);
            return (
              <motion.div
                key={h.handId || idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => setExpandedId(isExpanded ? null : (h.handId || idx))}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid rgba(255,255,255,0.06)`,
                  borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                  borderLeft: `3px solid ${pnlColor}40`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: '#8E8E93', fontFamily: 'monospace' }}>#{h.handId?.slice(-6) || idx}</span>
                  <span style={{ fontSize: 9, color: '#6B7280' }}>{timeAgo < 1 ? 'just now' : `${timeAgo}m ago`}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#E4E6EB' }}>
                    Pot: {formatStack ? formatStack(h.potTotal) : h.potTotal?.toLocaleString() || '0'}
                  </span>
                  <span style={{ fontSize: 11, color: pnlColor, fontWeight: 700 }}>
                    {heroWon ? '✓ Won' : '—'}
                  </span>
                </div>
                {/* Board cards */}
                {h.board?.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                    {h.board.map((card, ci) => (
                      <div key={ci} style={{
                        width: 20, height: 28, borderRadius: 3,
                        background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700,
                        color: typeof card === 'string' && (card.includes('h') || card.includes('d')) ? '#e53935' : '#fff',
                      }}>
                        {typeof card === 'string' ? card : '?'}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#8E8E93', marginTop: 4 }}>
                  Winner: {winnerNames} {h.bombPot ? '◆' : ''}
                </div>
                {/* E6: Expandable replay section */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {/* Hero cards */}
                    {h.heroCards?.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 3 }}>YOUR HAND</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {h.heroCards.map((card, ci) => (
                            <div key={ci} style={{
                              width: 28, height: 38, borderRadius: 4,
                              background: 'linear-gradient(135deg, #1a1a3e, #2a2a4e)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 800,
                              color: typeof card === 'string' && (card.includes('h') || card.includes('d')) ? '#e53935' : '#fff',
                              boxShadow: heroWon ? '0 0 8px rgba(34,197,94,0.3)' : 'none',
                            }}>
                              {typeof card === 'string' ? card : '?'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Board replay with street labels */}
                    {h.board?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 3 }}>BOARD RUNOUT</div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {h.board.map((card, ci) => (
                            <React.Fragment key={ci}>
                              {ci === 3 && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />}
                              {ci === 4 && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />}
                              <motion.div
                                initial={{ rotateY: 90, opacity: 0 }}
                                animate={{ rotateY: 0, opacity: 1 }}
                                transition={{ delay: ci * 0.15, duration: 0.3 }}
                                style={{
                                  width: 28, height: 38, borderRadius: 4,
                                  background: 'linear-gradient(135deg, #0a0a1e, #1a1a3e)',
                                  border: '1px solid rgba(255,255,255,0.15)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 11, fontWeight: 800,
                                  color: typeof card === 'string' && (card.includes('h') || card.includes('d')) ? '#e53935' : '#fff',
                                }}
                              >
                                {typeof card === 'string' ? card : '?'}
                              </motion.div>
                            </React.Fragment>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 2, marginTop: 2, fontSize: 7, color: '#4B5563' }}>
                          <span style={{ width: 90, textAlign: 'center' }}>Flop</span>
                          {h.board.length >= 4 && <span style={{ width: 32, textAlign: 'center' }}>Turn</span>}
                          {h.board.length >= 5 && <span style={{ width: 32, textAlign: 'center' }}>River</span>}
                        </div>
                      </div>
                    )}
                    {h.phase && (
                      <div style={{ fontSize: 9, color: '#6B7280', marginTop: 4 }}>Ended at: {h.phase}</div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
// ═══════════════════════════════════════════════════════════════════════════
// F2: LIVE ACTION LOG FEED — scrollable ticker of game actions
// ═══════════════════════════════════════════════════════════════════════════

function ActionLogFeed({ entries = [], isOpen, onClose }) {
  const listRef = useRef(null);
  const [filter, setFilter] = useState('all'); // G12: filter state
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries]);
  if (!isOpen) return null;
  const ICON_MAP = { fold: '', check: '✓', call: '', bet: '', raise: '', all_in: '', deal: '', board: '' };
  // G12: Filter entries
  const FILTERS = { all: null, bets: ['bet', 'raise', 'all_in'], calls: ['call'], folds: ['fold'] };
  const filtered = filter === 'all' ? entries : entries.filter(e => (FILTERS[filter] || []).includes(e.type));
  return (
    <motion.div
      initial={{ opacity: 0, x: -200 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -200 }}
      style={{
        position: 'absolute', top: 60, left: 10, width: 210, maxHeight: 220,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)',
        borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
        zIndex: 30, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#E4E6EB' }}>Action Log</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* I5: Copy log to clipboard */}
          <button onClick={(e) => {
            e.stopPropagation();
            const text = filtered.map(e => `${ICON_MAP[e.type] || '•'} ${e.playerName} ${e.text}${e.amount > 0 ? ' ' + e.amount.toLocaleString() : ''}`).join('\n');
            navigator.clipboard?.writeText(`Action Log (${filtered.length} entries)\n${text}\nsmarter.poker`)?.then(() => {
              try { eventBus.emit('SOUND_PLAY', { id: 'notify' }); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            });
          }} style={{ background: 'none', border: 'none', color: '#4fc3f7', fontSize: 11, cursor: 'pointer', padding: '0 2px' }} title="Copy log"></button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#65676B', fontSize: 14, cursor: 'pointer' }}>✕</button>
        </div>
      </div>
      {/* G12: Filter buttons */}
      <div style={{ display: 'flex', gap: 3, padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {['all', 'bets', 'calls', 'folds'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '2px 8px', borderRadius: 6, fontSize: 8, fontWeight: 700, cursor: 'pointer',
            border: 'none', textTransform: 'uppercase', letterSpacing: 0.3,
            background: filter === f ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.04)',
            color: filter === f ? '#4fc3f7' : '#65676B',
          }}>{f}</button>
        ))}
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', maxHeight: 155 }}>
        {filtered.length === 0 && <div style={{ color: '#4B5563', fontSize: 9, textAlign: 'center', padding: 12 }}>Waiting for action…</div>}
        {filtered.map((e, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * Math.min(i, 5) }} style={{ fontSize: 9, color: '#B0B0B0', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ marginRight: 4 }}>{ICON_MAP[e.type] || '•'}</span>
            <span style={{ color: '#E4E6EB', fontWeight: 600 }}>{e.playerName || 'Dealer'}</span>{' '}
            <span>{e.text}</span>
            {e.amount > 0 && <span style={{ color: '#FFD700', fontWeight: 700, marginLeft: 4 }}>{e.amount.toLocaleString()}</span>}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// (F3 StackGraphModal superseded by H14 enhanced version above)

// ═══════════════════════════════════════════════════════════════════════════
// F4: TABLE STATS BANNER — floating banner with aggregate table metrics
// ═══════════════════════════════════════════════════════════════════════════

function TableStatsBanner({ sessionStats, tableState, isOpen, onClose }) {
  if (!isOpen || !sessionStats) return null;
  const seats = tableState?.seats || [];
  const activePlayers = seats.filter(s => s.player?.id && s.status !== 'empty');
  const totalStacks = activePlayers.reduce((sum, s) => sum + (s.stack || 0), 0);
  const avgStack = activePlayers.length > 0 ? Math.round(totalStacks / activePlayers.length) : 0;
  const hrs = sessionStats.sessionStart ? ((Date.now() - sessionStats.sessionStart) / 3600000) : 0;
  const handsPerHour = hrs > 0 ? Math.round((sessionStats.handsPlayed || 0) / hrs) : 0;
  const avgPot = sessionStats.handsPlayed > 0 ? Math.round((sessionStats.totalPots || 0) / sessionStats.handsPlayed) : 0;
  const bb = tableState?.config?.bigBlind || tableState?.bigBlind || 2;
  // G8: Expanded metrics
  const vpipPct = sessionStats.handsPlayed > 0 ? Math.round((sessionStats.vpipCount || 0) / sessionStats.handsPlayed * 100) : 0;
  const pfrPct = sessionStats.handsPlayed > 0 ? Math.round((sessionStats.pfrCount || 0) / sessionStats.handsPlayed * 100) : 0;
  const af = (sessionStats.aggressionCalls || 0) > 0 ? ((sessionStats.aggressionBets || 0) / sessionStats.aggressionCalls).toFixed(1) : '—';
  const winRate = sessionStats.handsPlayed > 0 ? Math.round((sessionStats.handsWon || 0) / sessionStats.handsPlayed * 100) : 0;
  // Position win rates
  const posStats = Object.entries(sessionStats.positionTotal || {}).map(([pos, total]) => ({
    pos, total, wins: (sessionStats.positionWins || {})[pos] || 0,
    pct: total > 0 ? Math.round(((sessionStats.positionWins || {})[pos] || 0) / total * 100) : 0,
  }));

  const Stat = ({ icon, label, value, color = '#E4E6EB' }) => (
    <div style={{ textAlign: 'center', minWidth: 48 }}>
      <div style={{ fontSize: 11, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 7, fontWeight: 600, color: '#65676B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.90)', backdropFilter: 'blur(14px)',
        borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)',
        padding: '10px 20px', zIndex: 35, maxWidth: '90vw',
        boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#E4E6EB' }}>Table Stats</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#65676B', fontSize: 14, cursor: 'pointer' }}>✕</button>
      </div>
      {/* Row 1: Core metrics */}
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 8 }}>
        <Stat icon="" label="Hands/Hr" value={handsPerHour} color="#4fc3f7" />
        <Stat icon="" label="Avg Pot" value={avgPot > 0 ? avgPot.toLocaleString() : '—'} color="#FFD700" />
        <Stat icon="" label="Avg Stack" value={`${Math.round(avgStack / bb)}BB`} color="#4ade80" />
        <Stat icon="" label="Players" value={activePlayers.length} />
        <Stat icon="" label="Total" value={sessionStats.handsPlayed || 0} />
      </div>
      {/* G8: Row 2 — Player performance metrics */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, display: 'flex', gap: 14, justifyContent: 'center', marginBottom: posStats.length > 0 ? 8 : 0 }}>
        <Stat icon="" label="VPIP%" value={`${vpipPct}%`} color={vpipPct > 30 ? '#ef5350' : vpipPct > 18 ? '#FFD700' : '#4ade80'} />
        <Stat icon="" label="PFR%" value={`${pfrPct}%`} color={pfrPct > 20 ? '#ef5350' : pfrPct > 10 ? '#FFD700' : '#4ade80'} />
        <Stat icon="" label="AF" value={af} color="#ff9800" />
        <Stat icon="" label="Win Rate" value={`${winRate}%`} color={winRate > 50 ? '#4ade80' : winRate > 30 ? '#FFD700' : '#ef5350'} />
      </div>
      {/* G8: Row 3 — Position breakdown */}
      {posStats.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {posStats.map(p => (
            <div key={p.pos} style={{ textAlign: 'center', minWidth: 36 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: p.pct > 50 ? '#4ade80' : p.pct >= 30 ? '#FFD700' : '#ef5350' }}>{p.pct}%</div>
              {/* I11: Mini sparkline bar */}
              <div style={{ width: 28, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', margin: '2px auto', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, p.pct)}%`, height: '100%', borderRadius: 2, background: p.pct > 50 ? '#4ade80' : p.pct >= 30 ? '#FFD700' : '#ef5350', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: 7, color: '#65676B', fontWeight: 600 }}>{p.pos} ({p.wins}/{p.total})</div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// F5: RUN-IT-TWICE PROMPT — animated decision dialog
// ═══════════════════════════════════════════════════════════════════════════

function RunItTwicePrompt({ visible, onAccept, onDecline }) {
  const [countdown, setCountdown] = useState(10);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!visible) { setCountdown(10); return; }
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [visible]);

  // BUG FIX: Handle auto-decline in a separate effect to avoid side-effects in state updater
  useEffect(() => {
    if (visible && countdown === 0) onDecline?.();
  }, [countdown, visible]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{
        position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)',
        background: 'linear-gradient(135deg, rgba(30,30,50,0.95), rgba(15,15,25,0.98))',
        backdropFilter: 'blur(16px)',
        borderRadius: 16, border: '1px solid rgba(79,195,247,0.3)',
        padding: '20px 28px', zIndex: 90, textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0,0,0,0.7), 0 0 20px rgba(79,195,247,0.1)',
        minWidth: 280,
      }}
    >
      {/* Animated card backs */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        {[0, 1].map(i => (
          <motion.div
            key={i}
            initial={{ rotateY: 0 }}
            animate={{ rotateY: [0, 180, 360] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
            style={{
              width: 36, height: 50, borderRadius: 6,
              background: i === 0
                ? 'linear-gradient(135deg, #1a237e, #4a148c)'
                : 'linear-gradient(135deg, #b71c1c, #e65100)',
              border: '2px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
              boxShadow: `0 4px 12px rgba(${i === 0 ? '26,35,126' : '183,28,28'},0.4)`,
            }}
          >
            {i === 0 ? '' : ''}
          </motion.div>
        ))}
      </div>

      <div style={{ fontSize: 16, fontWeight: 800, color: '#E4E6EB', marginBottom: 4 }}>Run It Twice?</div>
      <div style={{ fontSize: 11, color: '#8E8E93', marginBottom: 16 }}>
        Deal the remaining board cards twice for two separate outcomes
      </div>

      {/* Countdown */}
      <div style={{ fontSize: 10, color: countdown <= 3 ? '#ef4444' : '#65676B', marginBottom: 12, fontWeight: 600 }}>
        Auto-decline in {countdown}s
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onAccept}
          style={{
            background: 'linear-gradient(135deg, #1e88e5, #1565c0)',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 24px', fontSize: 13, fontWeight: 800,
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(30,136,229,0.3)',
          }}
        >
          ✓ Run It Twice
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onDecline}
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: '#B0B0B0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
            padding: '10px 24px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Run Once
        </motion.button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// POT ODDS HUD — imported from ./PotOddsHUD.jsx (Phase 27 upgrade)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// EQUITY PROGRESS BAR — animated win% on all-in
// ═══════════════════════════════════════════════════════════════════════════

function EquityBar({ players, tableState }) {
  if (!players || players.length < 2) return null;

  // For exactly 2 players, we use a true "Tug-of-War" design.
  if (players.length === 2) {
    const p1 = players[0];
    const p2 = players[1];
    
    // Attempt to lookup player names from the seat map if missing from the equity object
    const getName = (id) => {
      const seat = tableState?.seats?.find(s => String(s?.player?.id) === String(id));
      return seat?.player?.displayName || 'Unknown';
    };

    const n1 = p1.name || getName(p1.id);
    const n2 = p2.name || getName(p2.id);

    const is1Fav = (p1.equity || 0) >= (p2.equity || 0);

    return (
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        style={{
          position: 'absolute',
          top: 70, // Positioned at the top of the table like a broadcast HUD
          left: '50%',
          transform: 'translateX(-50%)',
          width: '65%',
          maxWidth: 600,
          zIndex: 60,
          background: 'rgba(20, 21, 23, 0.95)',
          borderRadius: 24,
          padding: '6px 12px',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Header HUD Element */}
        <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#FA383E', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.3)', letterSpacing: 1, boxShadow: '0 2px 8px rgba(250, 56, 62, 0.5)' }}>ALL-IN SHOWDOWN</div>

        {/* Player Names & Odds Display Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1 }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 800, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 100 }}>{n1}</span>
            <span style={{ color: is1Fav ? '#4ade80' : '#A0A3A8', fontSize: 18, fontWeight: 900 }}>{(p1.equity || 0).toFixed(1)}%</span>
            {is1Fav && <span style={{ fontSize: 10, color: '#4ade80' }}>★</span>}
          </div>
          <div style={{ color: '#666', fontSize: 10, fontWeight: 800 }}>VS</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
            {!is1Fav && <span style={{ fontSize: 10, color: '#4ade80' }}>★</span>}
            <span style={{ color: !is1Fav ? '#4ade80' : '#A0A3A8', fontSize: 18, fontWeight: 900 }}>{(p2.equity || 0).toFixed(1)}%</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 800, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 100 }}>{n2}</span>
          </div>
        </div>

        {/* Tug-of-War Bar */}
        <div style={{ position: 'relative', height: 16, borderRadius: 8, background: '#111', overflow: 'hidden', border: '1px solid #000', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
          <motion.div
            initial={{ width: '50%' }}
            animate={{ width: `${p1.equity || 0}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.8 }}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: is1Fav ? 'linear-gradient(90deg, #16a34a, #4ade80)' : 'linear-gradient(90deg, #b91c1c, #ef4444)', borderRight: '2px solid #fff', boxShadow: is1Fav ? '0 0 10px rgba(74, 222, 128, 0.5)' : 'none' }}
          />
          <motion.div
            initial={{ width: '50%' }}
            animate={{ width: `${p2.equity || 0}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.8 }}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, background: !is1Fav ? 'linear-gradient(270deg, #16a34a, #4ade80)' : 'linear-gradient(270deg, #b91c1c, #ef4444)', boxShadow: !is1Fav ? '0 0 10px rgba(74, 222, 128, 0.5)' : 'none' }}
          />
        </div>
      </motion.div>
    );
  }

  // Multi-way all-in fallback
  const sorted = [...players].sort((a, b) => (b.equity || 0) - (a.equity || 0));
  const eqColors = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899'];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      style={{
        position: 'absolute',
        top: 70,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '70%',
        maxWidth: 600,
        zIndex: 60,
        borderRadius: 12,
        overflow: 'hidden',
        height: 24,
        display: 'flex',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.2)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
      }}
    >
      <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#FA383E', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 10px', borderRadius: 10, zIndex: 61, letterSpacing: 0.5 }}>MULTI-WAY SHOWDOWN</div>
      {sorted.map((p, i) => (
        <motion.div
          key={p.id || i}
          initial={{ width: 0 }}
          animate={{ width: `${p.equity || 0}%` }}
          transition={{ duration: 1.2, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            height: '100%',
            background: eqColors[i % eqColors.length],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            borderRight: i < sorted.length - 1 ? '1px solid rgba(0,0,0,0.5)' : 'none',
            minWidth: (p.equity || 0) > 8 ? 'auto' : 0,
          }}
        >
          {(p.equity || 0) > 8 ? `${(p.equity || 0).toFixed(1)}%` : ''}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAPTIC FEEDBACK — mobile vibration for key events
// ═══════════════════════════════════════════════════════════════════════════

function haptic(type = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const patterns = { light: [10], medium: [30], heavy: [50], double: [20, 40, 20], allIn: [50, 30, 80] };
  try { navigator.vibrate(patterns[type] || patterns.light); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

// Dynamic theme — updated when user changes theme, read by all sub-components
let T = getActiveTheme();

// ═══════════════════════════════════════════════════════════════════════════
// AVATAR RESOLUTION — Maps user avatars to table-optimized images
// ═══════════════════════════════════════════════════════════════════════════

// Real player avatars always win here -- this only resolves what a seat shows
// when nobody has picked one yet. The fallback used to be a hardcoded
// ten-entry array indexed by seat position (so table N always dressed seat 3
// as the same fox); it now draws a per-table cast from the shared
// AVATAR_LIBRARY pool via dealSeatAvatars/tableAvatars.js -- see
// buildSeatFallbackAvatars below, which deals that cast once per table and
// hands each seat its assigned portrait through the `fallbackSrc` argument.
function resolveTableAvatar(avatarUrl, fallbackSrc) {
  // Custom avatar (Supabase upload or external URL) — use directly
  if (avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'))) {
    return avatarUrl;
  }
  // Library avatar path — map to table-optimized version
  if (avatarUrl && avatarUrl.startsWith('/avatars/')) {
    const filename = avatarUrl.split('/').pop().replace('.png', '');
    const tier = avatarUrl.includes('/vip/') ? 'vip' : 'free';
    return `/avatars/table/${tier}_${filename}.png`;
  }
  // Fallback: this seat's assigned portrait from buildSeatFallbackAvatars
  return fallbackSrc || HERO_DEFAULT_AVATAR;
}

// Deal a distinct, deterministic fallback portrait to every seat at a table
// that has no real avatarUrl. Seeded on the table id, so the cast is stable
// for the life of the table and does not reshuffle on every reconnect or
// re-render. `heroFallback` -- the viewer's own account avatar, when it is a
// library path -- is reserved for the viewer's own seat (if they are seated
// and lack a resolvable avatarUrl there too) and is otherwise filtered out of
// the pool entirely, so a stranger's empty-avatar seat can never end up
// wearing the viewer's own chosen face.
function buildSeatFallbackAvatars(tableId, maxSeats, heroFallback, heroSeatIndex) {
  const cast = dealSeatAvatars('live-table-' + (tableId == null ? '' : tableId), maxSeats, heroFallback);
  const pool = cast.slice(1); // cast[0] === heroFallback; never assign it to another seat
  const map = {};
  let p = 0;
  for (let i = 0; i < maxSeats; i++) {
    if (i === heroSeatIndex) { map[i] = heroFallback; continue; }
    map[i] = pool.length ? pool[p % pool.length] : HERO_DEFAULT_AVATAR;
    p++;
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — 2 to 10 seats (percentages of table container)
// Positions are OUTSIDE the table felt so avatars don't overlap the surface
// ═══════════════════════════════════════════════════════════════════════════

const SEAT_LAYOUTS = {
  2: [
    { x: 50, y: 96 },  // Hero (bottom — off table)
    { x: 50, y: -2 },  // Opponent (top — off table)
  ],
  3: [
    { x: 50, y: 96 },
    { x: 4, y: 28 },
    { x: 96, y: 28 },
  ],
  4: [
    { x: 50, y: 96 },
    { x: 2, y: 50 },
    { x: 50, y: -2 },
    { x: 98, y: 50 },
  ],
  5: [
    { x: 50, y: 96 },
    { x: 2, y: 62 },
    { x: 16, y: -2 },
    { x: 84, y: -2 },
    { x: 98, y: 62 },
  ],
  6: [
    { x: 50, y: 96 },   // Bottom center (hero)
    { x: 2, y: 68 },    // Left lower
    { x: 0, y: 28 },    // Left upper
    { x: 34, y: -4 },   // Top left
    { x: 66, y: -4 },   // Top right
    { x: 98, y: 28 },   // Right upper
  ],
  7: [
    { x: 50, y: 96 },
    { x: 4, y: 74 },
    { x: -2, y: 40 },
    { x: 18, y: -4 },
    { x: 82, y: -4 },
    { x: 102, y: 40 },
    { x: 96, y: 74 },
  ],
  8: [
    { x: 50, y: 96 },
    { x: 10, y: 82 },
    { x: -2, y: 48 },
    { x: 10, y: 10 },
    { x: 50, y: -4 },
    { x: 90, y: 10 },
    { x: 102, y: 48 },
    { x: 90, y: 82 },
  ],
  9: [
    { x: 50, y: 96 },   // Seat 1 — Hero (bottom center)
    { x: 12, y: 82 },   // Seat 2 — Lower left
    { x: -2, y: 50 },   // Seat 3 — Middle left
    { x: 8, y: 14 },    // Seat 4 — Upper left
    { x: 34, y: -4 },   // Seat 5 — Top left
    { x: 66, y: -4 },   // Seat 6 — Top right
    { x: 92, y: 14 },   // Seat 7 — Upper right
    { x: 102, y: 50 },  // Seat 8 — Middle right
    { x: 88, y: 82 },   // Seat 9 — Lower right
  ],
  10: [
    { x: 50, y: 96 },
    { x: 14, y: 84 },
    { x: -2, y: 58 },
    { x: 2, y: 24 },
    { x: 24, y: -4 },
    { x: 50, y: -6 },
    { x: 76, y: -4 },
    { x: 98, y: 24 },
    { x: 102, y: 58 },
    { x: 86, y: 84 },
  ],
};

function getSeatPositions(maxSeats) {
  return SEAT_LAYOUTS[maxSeats] || SEAT_LAYOUTS[9];
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD RENDERING — Custom PNG Deck
// ═══════════════════════════════════════════════════════════════════════════

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

// Card sort constants (hoisted for performance — avoids recreation per render)
const RANK_ORDER = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const SUIT_ORDER = { 's': 0, 'h': 1, 'd': 2, 'c': 3 };

function cardIntToPath(card) {
  if (card === null || card === undefined) return null;
  const rank = Math.floor(card / 4);
  const suit = card % 4;
  return `/cards/${SUITS[suit]}_${RANKS[rank]}.png`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SQUEEZE CARD — 3-phase: face-down → peek tilt → full reveal
// ═══════════════════════════════════════════════════════════════════════════

function SqueezeCard({ card, width = 48, delay = 0, fourColorDeck = false }) {
  const height = Math.round(width * 1.4);
  const backPath = getStoredCardBack();
  const faceSrc = cardIntToPath(card);
  const [phase, setPhase] = useState(0); // 0=faceDown, 1=peeking, 2=revealed
  const prevCardRef = useRef(card);

  // Reset when card changes (new hand)
  useEffect(() => {
    if (card !== prevCardRef.current) {
      setPhase(0);
      prevCardRef.current = card;
    }
  }, [card]);

  // Auto-reveal after 3s if still face-down
  useEffect(() => {
    if (phase === 0) {
      const t = setTimeout(() => setPhase(2), 3000 + delay * 1000);
      return () => clearTimeout(t);
    }
  }, [phase, delay]);

  // 4-color deck filter
  const fourColorStyle = fourColorDeck && card != null ? (() => {
    const suit = card % 4;
    if (suit === 0) return { filter: 'hue-rotate(110deg) saturate(1.3)' };
    if (suit === 1) return { filter: 'hue-rotate(220deg) saturate(1.2)' };
    return {};
  })() : {};

  const handleTap = () => {
    if (phase === 0) setPhase(1); // peek
    else if (phase === 1) setPhase(2); // reveal
  };

  return (
    <motion.div
      onClick={handleTap}
      style={{
        width, height, perspective: 800, flexShrink: 0, cursor: phase < 2 ? 'pointer' : 'default',
        position: 'relative',
      }}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <motion.div
        animate={{
          rotateY: phase === 0 ? 180 : phase === 1 ? 150 : 0,
          rotateZ: phase === 1 ? -8 : 0,
          scale: phase === 1 ? 1.08 : 1,
        }}
        transition={{
          duration: phase === 2 ? 0.4 : 0.3,
          ease: phase === 2 ? [0.34, 1.56, 0.64, 1] : 'easeOut',
        }}
        style={{
          width: '100%', height: '100%', position: 'relative',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Front face */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
          borderRadius: 4, overflow: 'hidden',
          boxShadow: phase === 2 ? '0 4px 16px rgba(0,0,0,0.8)' : '0 2px 8px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}>
          {faceSrc && <img src={faceSrc} alt={`Card ${card}`} style={{ width: '100%', height: '100%', objectFit: 'cover', ...fourColorStyle }} draggable={false} />}
        </div>
        {/* Back face */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          borderRadius: 4, overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <img src={backPath} alt="Card back" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
        </div>
      </motion.div>
      {/* Peek indicator */}
      {phase === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
            fontSize: 7, color: 'rgba(255,255,255,0.6)', fontWeight: 700,
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}
        >
          TAP TO PEEK
        </motion.div>
      )}
    </motion.div>
  );
}



function CardImg({ card, width = 48, faceDown = false, style = {}, delay = 0, cardBackPath, showdown = false, fourColorDeck = false }) {
  const height = Math.round(width * 1.4);
  const backPath = cardBackPath || getStoredCardBack();

  // 4-color deck CSS filter — clubs: green, diamonds: blue
  const fourColorStyle = fourColorDeck && card != null && !faceDown ? (() => {
    const suit = card % 4; // 0=clubs, 1=diamonds, 2=hearts, 3=spades
    if (suit === 0) return { filter: 'hue-rotate(110deg) saturate(1.3)' }; // clubs → green
    if (suit === 1) return { filter: 'hue-rotate(220deg) saturate(1.2)' }; // diamonds → blue
    return {};
  })() : {};

  // ═══ SHOWDOWN 3D FLIP — card back visible first, then flips to reveal face ═══
  if (showdown && !faceDown && card != null) {
    const faceSrc = cardIntToPath(card);
    return (
      <motion.div
        style={{ width, height, perspective: 600, flexShrink: 0, ...style }}
        initial={{ opacity: 0, scale: 0.7, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, delay }}
      >
        <motion.div
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={{ duration: 0.5, delay: delay + 0.2, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            width: '100%', height: '100%', position: 'relative',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Front face (the actual card) */}
          <div style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
            borderRadius: 4, overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            {faceSrc && <img src={faceSrc} alt={`Card ${card}`} style={{ width: '100%', height: '100%', objectFit: 'cover', ...fourColorStyle }} draggable={false} />}
          </div>
          {/* Back face (card back, visible at start of flip) */}
          <div style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 4, overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <img src={backPath} alt="Card back" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // ═══ Standard card display (hero cards, community cards, face-down) ═══
  const src = faceDown ? backPath : cardIntToPath(card);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, rotateY: 180 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.4, delay }}
      style={{
        width, height,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        ...style,
      }}
    >
      {src && (
        <img
          src={src}
          alt={faceDown ? 'Card' : `Card ${card}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', ...fourColorStyle }}
          draggable={false}
        />
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER SEAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function PlayerSeat({
  seat, position, isHero, isCurrentActor, timerState, onClick, onNote, noteColor, noteType,
  numHoleCards = 2, isWinner = false, equity = null, gamePosition = null, board = [],
  formatStack: formatStackFn = null,
  cardSortMode = 'dealt',
  showHUD = false,
  fourColorDeck = false,
  fallbackAvatar = null,
}) {
  const { status, player, stack, holeCards: rawHoleCards, isFolded, invested } = seat;
  const isEmpty = status === 'empty' || status === 'reserved';

  // Card sort logic — only for hero (constants hoisted to module level)
  const holeCards = useMemo(() => {
    if (!rawHoleCards || !isHero || cardSortMode === 'dealt') return rawHoleCards;
    const sorted = [...rawHoleCards];
    if (cardSortMode === 'rank') {
      sorted.sort((a, b) => (RANK_ORDER[b?.[0]] || 0) - (RANK_ORDER[a?.[0]] || 0));
    } else if (cardSortMode === 'suit') {
      sorted.sort((a, b) => {
        const suitDiff = (SUIT_ORDER[a?.[1]] ?? 9) - (SUIT_ORDER[b?.[1]] ?? 9);
        return suitDiff !== 0 ? suitDiff : (RANK_ORDER[b?.[0]] || 0) - (RANK_ORDER[a?.[0]] || 0);
      });
    }
    return sorted;
  }, [rawHoleCards, isHero, cardSortMode]);

  // Position badge config
  const POSITION_BADGES = {
    btn: { label: 'D', bg: '#FFD700', color: '#000' },
    sb: { label: 'SB', bg: '#4FC3F7', color: '#000' },
    bb: { label: 'BB', bg: '#81C784', color: '#000' },
    utg: { label: 'UTG', bg: '#E0E0E0', color: '#333' },
  };
  const posBadge = !isEmpty && gamePosition ? POSITION_BADGES[gamePosition] : null;
  const isSittingOut = status === 'sitting_out';
  const isDisconnected = status === 'disconnected';
  const avatarSize = isHero ? 90 : 72;

  // Resolve avatar — uses pre-made library avatars with table-optimized versions
  const resolvedAvatar = !isEmpty ? resolveTableAvatar(player?.avatarUrl, fallbackAvatar) : null;

  // Dynamic card width: scale down for Omaha variants
  const cardWidth = isHero
    ? (numHoleCards <= 2 ? 52 : numHoleCards <= 4 ? 40 : 34)
    : (numHoleCards <= 2 ? 36 : numHoleCards <= 4 ? 28 : 24);
  const faceDownWidth = numHoleCards <= 2 ? 28 : numHoleCards <= 4 ? 22 : 18;

  // Timer ring
  const showTimer = isCurrentActor && timerState;
  const turnTime = timerState?.turnTime || 30;
  const isTimebank = timerState?.isTimebank;
  const timerPct = showTimer ? (timerState.remaining / (isTimebank ? 30 : turnTime)) * 100 : 0;
  const timerColor = showTimer
    ? isTimebank ? '#FF9800'  // Orange for timebank
      : timerState.remaining <= 10 ? T.timerWarning : T.timerNormal
    : T.timerNormal;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: isEmpty ? 'pointer' : onNote ? 'pointer' : 'default',
        zIndex: isCurrentActor ? 20 : 10,
        opacity: isFolded ? 0.4 : 1,
        transition: 'opacity 0.3s',
      }}
      onClick={() => isEmpty && onClick?.()}
      onContextMenu={(e) => {
        if (!isEmpty && onNote) { e.preventDefault(); onNote(); }
      }}
      onDoubleClick={() => {
        if (!isEmpty && onNote) onNote();
      }}
    >
      {/* Invested chips — floats near avatar */}
      {invested > 0 && !isFolded && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          style={{
            position: 'absolute',
            top: isHero ? -24 : 'auto',
            bottom: isHero ? 'auto' : -20,
            background: 'rgba(0,0,0,0.8)',
            color: T.accent,
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            border: `1px solid ${T.accentDim}`,
            whiteSpace: 'nowrap',
            zIndex: 6,
          }}
        >
          {invested}
        </motion.div>
      )}

      {/* Avatar image + Timer ring */}
      <div style={{ position: 'relative' }}>
        {/* Phase 20 Smart HUD Ring — VPIP SVG Silhouette */}
        {showHUD && !isEmpty && seat.stats && (() => {
          const vpip = seat.stats.vpip || 0;
          const vpipColor = vpip > 40 ? '#ef4444' : vpip > 25 ? '#f59e0b' : '#22c55e';
          const r = (avatarSize + 4) / 2;
          const circum = 2 * Math.PI * r;
          const pct = Math.min(vpip, 100) / 100;
          return (
            <svg
              width={avatarSize + 12}
              height={avatarSize + 12}
              style={{
                position: 'absolute', top: -6, left: -6,
                transform: 'rotate(-90deg)', zIndex: 3, pointerEvents: 'none',
                filter: `drop-shadow(0 0 4px ${vpipColor}66)`,
              }}
            >
              <circle
                cx={(avatarSize + 12) / 2} cy={(avatarSize + 12) / 2} r={r}
                fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={3}
              />
              <circle
                cx={(avatarSize + 12) / 2} cy={(avatarSize + 12) / 2} r={r}
                fill="none" stroke={vpipColor} strokeWidth={3}
                strokeDasharray={circum}
                strokeDashoffset={circum * (1 - pct)}
                strokeLinecap="round"
              />
            </svg>
          );
        })()}
        {showTimer && (
          <>
            {/* Premium Shot Clock Ring */}
            <svg
              width={avatarSize + 14}
              height={avatarSize + 14}
              style={{
                position: 'absolute',
                top: -7, left: -7,
                transform: 'rotate(-90deg)',
                filter: timerState.remaining <= 5 ? `drop-shadow(0 0 8px ${timerColor})` : 'none',
              }}
            >
              {/* Background track */}
              <circle
                cx={(avatarSize + 14) / 2}
                cy={(avatarSize + 14) / 2}
                r={(avatarSize + 8) / 2}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={4}
              />
              {/* Animated countdown arc */}
              <circle
                cx={(avatarSize + 14) / 2}
                cy={(avatarSize + 14) / 2}
                r={(avatarSize + 8) / 2}
                fill="none"
                stroke={timerColor}
                strokeWidth={4}
                strokeDasharray={Math.PI * (avatarSize + 8)}
                strokeDashoffset={Math.PI * (avatarSize + 8) * (1 - timerPct / 100)}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dashoffset 1s linear, stroke 0.3s',
                  animation: timerState.remaining <= 5 ? 'shotClockPulse 0.6s ease-in-out infinite' : 'none',
                }}
              />
            </svg>
            {/* Countdown seconds display */}
            <div style={{
              position: 'absolute',
              top: -12, left: '50%', transform: 'translateX(-50%)',
              background: timerState.remaining <= 5 ? timerColor : 'rgba(0,0,0,0.85)',
              color: timerState.remaining <= 5 ? '#000' : '#fff',
              fontSize: 11, fontWeight: 900, padding: '1px 7px',
              borderRadius: 6, zIndex: 4, lineHeight: 1.4,
              fontVariantNumeric: 'tabular-nums',
              border: `1px solid ${timerState.remaining <= 5 ? timerColor : 'rgba(255,255,255,0.15)'}`,
              boxShadow: timerState.remaining <= 5 ? `0 0 10px ${timerColor}80` : 'none',
              animation: timerState.remaining <= 3 ? 'shotClockBlink 0.4s ease-in-out infinite' : 'none',
              transition: 'background 0.3s, color 0.3s',
            }}>
              {isTimebank ? '⏳ ' : ''}{Math.ceil(timerState.remaining)}s
            </div>
          </>
        )}

        {/* Time Bank Pill — orange pulsing indicator when time bank is active */}
        {showTimer && isTimebank && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, #FF9800, #e65100)',
              color: '#fff', fontSize: 8, fontWeight: 800,
              padding: '1px 6px', borderRadius: 8,
              zIndex: 15, whiteSpace: 'nowrap',
              boxShadow: '0 2px 6px rgba(255,152,0,0.4)',
              animation: timerState.remaining <= 5 ? 'shotClockPulse 0.5s ease-in-out infinite' : 'none',
              letterSpacing: 0.5,
            }}
          >
            TIME BANK
          </motion.div>
        )}

        {/* Phase 20 Glassmorphic HUD Badge — VPIP/PFR/AF */}
        {showHUD && !isEmpty && seat.stats && (() => {
          const vpip = seat.stats.vpip || 0;
          const pfr = seat.stats.pfr || 0;
          const af = seat.stats.af ? parseFloat(seat.stats.af).toFixed(1) : '1.0';
          const vpipColor = vpip > 40 ? '#ef4444' : vpip > 25 ? '#f59e0b' : '#22c55e';
          return (
            <div style={{
              position: 'absolute', bottom: -22, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(15,20,30,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              border: `1px solid rgba(255,255,255,0.1)`, borderBottom: `1px solid ${vpipColor}80`,
              boxShadow: `0 6px 16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.15)`,
              borderRadius: 6, padding: '3px 8px', zIndex: 16, whiteSpace: 'nowrap',
              display: 'flex', gap: 6, alignItems: 'center', opacity: isFolded ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: 0.5 }}>VPIP</span>
                <span style={{ fontSize: 10, color: vpipColor, fontWeight: 900, fontFamily: 'monospace' }}>{vpip}</span>
              </div>
              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: 0.5 }}>PFR</span>
                <span style={{ fontSize: 10, color: '#facc15', fontWeight: 900, fontFamily: 'monospace' }}>{pfr}</span>
              </div>
              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: 0.5 }}>AF</span>
                <span style={{ fontSize: 10, color: '#bae6fd', fontWeight: 900, fontFamily: 'monospace' }}>{af}</span>
              </div>
            </div>
          );
        })()}

        <div
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: '50%',
            background: isEmpty
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.3)',
            border: isEmpty
              ? '2px dashed rgba(255,255,255,0.2)'
              : isWinner
                ? '3px solid #FFD700'
                : isCurrentActor
                  ? `3px solid ${T.accent}`
                  : '2px solid rgba(255,255,255,0.15)',
            animation: isCurrentActor && !isWinner ? 'seatPulse 1.8s ease-in-out infinite' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: isWinner
              ? '0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(255,215,0,0.2)'
              : isCurrentActor
                ? `0 0 20px ${T.accent}40`
                : '0 4px 12px rgba(0,0,0,0.5)',
            filter: isDisconnected ? 'grayscale(1)' : isSittingOut ? 'brightness(0.5)' : 'none',
          }}
        >
          {isEmpty ? (
            <span style={{ fontSize: 28, color: 'rgba(255,255,255,0.3)' }}>+</span>
          ) : resolvedAvatar ? (
            <img
              src={resolvedAvatar}
              alt={player?.displayName || 'Player'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                const errors = parseInt(e.target.dataset.errorCount || '0', 10);
                e.target.dataset.errorCount = errors + 1;
                if (errors === 0 && player?.avatarUrl && e.target.src !== player.avatarUrl) {
                  // Step 1: try original avatar path
                  e.target.src = player.avatarUrl;
                } else if (errors <= 1) {
                  // Step 2: this seat's assigned deterministic fallback portrait
                  e.target.src = fallbackAvatar || HERO_DEFAULT_AVATAR;
                } else {
                  // Step 3: inline SVG — cannot fail
                  e.target.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="%23374151"/><text x="40" y="52" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">' + ((player?.displayName || '?')[0] || '?').toUpperCase() + '</text></svg>')}`;
                }
              }}
            />
          ) : (
            <span style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
              {(player?.displayName || '?')[0].toUpperCase()}
            </span>
          )}
        </div>

        {/* Sitting-out overlay label */}
        {isSittingOut && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 4, pointerEvents: 'none',
          }}>
            <span style={{
              color: 'rgba(255,255,255,0.8)', fontSize: 8, fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: 0.5,
              animation: 'pulse 2s ease-in-out infinite',
            }}>Sitting Out</span>
          </div>
        )}

        {/* Disconnected overlay label */}
        {isDisconnected && !isSittingOut && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 4, pointerEvents: 'none',
          }}>
            <span style={{
              color: '#ef4444', fontSize: 8, fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>DC</span>
          </div>
        )}

        {/* Note color dot indicator */}
        {noteColor && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 12, height: 12,
            borderRadius: '50%', background: noteColor, border: '2px solid rgba(0,0,0,0.4)',
            zIndex: 5,
          }} />
        )}

        {/* Position badge (D / SB / BB / UTG) */}
        {posBadge && (
          <motion.div
            layoutId={posBadge.label === 'D' ? 'dealer-btn' : undefined}
            layout={posBadge.label === 'D' ? true : undefined}
            transition={posBadge.label === 'D' ? { type: 'spring', stiffness: 200, damping: 25 } : undefined}
            style={{
              position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
              background: posBadge.bg, color: posBadge.color,
              fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 6,
              lineHeight: 1.3, zIndex: 5, border: '1px solid rgba(0,0,0,0.2)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}>{posBadge.label}</motion.div>
        )}
      </div>

      {/* All-in equity SVG ring around avatar */}
      {equity != null && !isEmpty && !isFolded && (() => {
        const eqColor = equity >= 60 ? '#22c55e' : equity >= 40 ? '#eab308' : '#ef4444';
        const ringR = (avatarSize + 18) / 2;
        const ringCircum = 2 * Math.PI * ringR;
        const eqPct = Math.min(Math.max(equity, 0), 100) / 100;
        return (
          <svg
            width={avatarSize + 22}
            height={avatarSize + 22}
            style={{
              position: 'absolute', top: -11, left: -11,
              transform: 'rotate(-90deg)', zIndex: 25, pointerEvents: 'none',
              filter: `drop-shadow(0 0 6px ${eqColor}80)`,
            }}
          >
            {/* Background track */}
            <circle
              cx={(avatarSize + 22) / 2} cy={(avatarSize + 22) / 2} r={ringR}
              fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4}
            />
            {/* Equity fill arc */}
            <circle
              cx={(avatarSize + 22) / 2} cy={(avatarSize + 22) / 2} r={ringR}
              fill="none" stroke={eqColor} strokeWidth={4}
              strokeDasharray={ringCircum}
              strokeDashoffset={ringCircum * (1 - eqPct)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease' }}
            />
          </svg>
        );
      })()}

      {/* All-in equity percentage badge */}
      {equity != null && !isEmpty && !isFolded && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            background: equity >= 60
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : equity >= 40
                ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                : 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 800,
            padding: '2px 10px',
            borderRadius: 10,
            textAlign: 'center',
            minWidth: 44,
            letterSpacing: -0.5,
            boxShadow: equity >= 60
              ? '0 0 12px rgba(34,197,94,0.5)'
              : equity >= 40
                ? '0 0 12px rgba(234,179,8,0.5)'
                : '0 0 12px rgba(239,68,68,0.5)',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            animation: equity >= 65 ? 'equityPulse 2s ease-in-out infinite' : 'none',
          }}
        >
          {equity.toFixed(1)}%
        </motion.div>
      )}

      {/* Player Name — displayed below avatar */}
      {!isEmpty && (
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: isCurrentActor ? T.accent : '#fff',
          textAlign: 'center',
          maxWidth: 90,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          lineHeight: 1.2,
        }}>
          {noteType && noteType !== 'unknown' && (
            <span style={{ marginRight: 2, fontSize: isHero ? 11 : 9 }}>
              {({ fish: '', reg: '', shark: '', whale: '', nit: '', lag: '', tag: '' })[noteType] || ''}
            </span>
          )}
          {player?.displayName || 'Player'}
          {isSittingOut && ''}
          {isDisconnected && ''}
        </div>
      )}

      {/* Chip Count + Chip Stack Visualization */}
      {!isEmpty && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Premium 5-Tier Chip Stack (Phase 26) */}
          {(() => {
            const bb = (typeof stack === 'number' && seat.bigBlind) ? Math.floor(stack / (seat.bigBlind || 1)) : 0;
            // Denomination tiers: White=1BB, Red=5BB, Green=25BB, Black=100BB, Purple=500BB
            const DENOM = [
              { color: '#e8e8e8', edge: '#b0b0b0', stripe: '#ccc', min: 0 },    // White
              { color: '#ef4444', edge: '#b91c1c', stripe: '#fca5a5', min: 5 },  // Red
              { color: '#22c55e', edge: '#15803d', stripe: '#86efac', min: 25 },  // Green
              { color: '#1a1a2e', edge: '#0a0a15', stripe: '#666', min: 100 },    // Black
              { color: '#a855f7', edge: '#7c3aed', stripe: '#d8b4fe', min: 500 }, // Purple
            ];
            // Build chips by denomination (up to 8 max for visual clarity)
            const chips = [];
            let remaining = bb;
            for (let d = DENOM.length - 1; d >= 0 && chips.length < 8; d--) {
              while (remaining >= DENOM[d].min && DENOM[d].min > 0 && chips.length < 8) {
                chips.push(DENOM[d]);
                remaining -= DENOM[d].min;
              }
            }
            if (chips.length === 0) chips.push(DENOM[0]); // Always show at least 1
            chips.reverse(); // Stack from bottom up
            return (
              <div style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 0, marginRight: 2 }}>
                {chips.map((chip, ci) => (
                  <motion.div
                    key={`chip-${ci}-${chip.color}`}
                    layout
                    initial={{ scale: 0, y: 10, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0, y: -8, opacity: 0 }}
                    transition={{ delay: ci * 0.04, duration: 0.25, type: 'spring', stiffness: 400, damping: 20 }}
                    style={{
                      width: 16, height: 5, borderRadius: 3,
                      background: `linear-gradient(180deg, ${chip.color}ee 0%, ${chip.edge} 100%)`,
                      border: `0.5px solid rgba(255,255,255,0.3)`,
                      boxShadow: `0 1px 2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)`,
                      marginBottom: ci > 0 ? -1.5 : 0,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Edge stripe — gives each chip its denomination identity */}
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      width: 8, height: 1.5, background: chip.stripe, borderRadius: 1, opacity: 0.6,
                    }} />
                  </motion.div>
                ))}
              </div>
            );
          })()}
          <div style={{
            fontSize: 13, fontWeight: 800,
            color: isCurrentActor ? T.accent : '#FFD700',
            textAlign: 'center',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
          }}>
            {formatStackFn ? formatStackFn(stack) : (typeof stack === 'number' ? stack.toLocaleString() : '0')}
          </div>
        </div>
      )}

      {/* Hole cards (hero or showdown) */}
      {holeCards && holeCards.length > 0 && (() => {
        // Card squeeze: hero cards start face-down, tap to peek, tap again to reveal
        const squeezeEnabled = isHero && typeof window !== 'undefined' && localStorage.getItem('poker-card-squeeze') !== 'false';
        return (
          <>
            <div style={{
              display: 'flex', gap: 3, marginTop: 2,
              ...(isWinner ? {
                filter: 'drop-shadow(0 0 8px #FFD700) drop-shadow(0 0 16px rgba(255,215,0,0.4))',
                animation: 'winGlow 1.2s ease-in-out infinite alternate',
              } : {}),
            }}>
              {holeCards.map((card, i) => (
                squeezeEnabled ? (
                  <SqueezeCard key={`sq-${card}-${i}`} card={card} width={cardWidth} delay={i * 0.15} fourColorDeck={fourColorDeck} />
                ) : (
                  <CardImg key={i} card={card} width={cardWidth} delay={i * 0.15} showdown={!isHero} fourColorDeck={fourColorDeck} />
                )
              ))}
            </div>
            {isHero && <HandStrengthMeter holeCards={holeCards} board={board} visible={true} fourColorDeck={fourColorDeck} />}
          </>
        );
      })()}

      {/* Face-down cards for non-hero active players */}
      {!holeCards && !isEmpty && !isFolded && seat.isInHand && (
        <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
          {Array.from({ length: numHoleCards }).map((_, i) => (
            <CardImg key={i} card={null} width={faceDownWidth} faceDown delay={i * 0.08} />
          ))}
        </div>
      )}

      {/* Empty seat label */}
      {isEmpty && (
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
          {status === 'reserved' ? 'Reserved' : 'Open Seat'}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY CARDS
// ═══════════════════════════════════════════════════════════════════════════

function CommunityCards({ cards = [], boards, prevCardCount, fourColorDeck }) {
  // Track the index of newly dealt cards for spotlight effect
  const isNewCard = useCallback((idx) => {
    // Spotlight the last card dealt when going from 3→4 (turn) or 4→5 (river)
    return (cards.length === 4 && idx === 3) || (cards.length === 5 && idx === 4);
  }, [cards.length]);
  // Multi-board mode (double/triple board) — Run-It-Twice/Thrice
  if (boards && boards.length > 1 && boards.some(b => b.length > 0)) {
    const BOARD_COLORS = ['#FFD700', '#4fc3f7', '#ce93d8'];
    const BOARD_LABELS = ['Board 1', 'Board 2', 'Board 3'];
    const BOARD_GLOWS = ['rgba(255,215,0,0.15)', 'rgba(79,195,247,0.15)', 'rgba(206,147,216,0.15)'];
    return (
      <div style={{
        position: 'absolute', top: '35%', left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', gap: 4, zIndex: 15,
        alignItems: 'center',
      }}>
        {boards.map((board, bi) => (
          board.length > 0 && (
            <React.Fragment key={`board-${bi}`}>
              {/* Lightning bolt divider between boards */}
              {bi > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  justifyContent: 'center', padding: '1px 0',
                }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)' }} />
                  <span style={{ fontSize: 12, filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.5))' }}></span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)' }} />
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, y: bi * 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: bi * 0.2, duration: 0.4 }}
                style={{
                  display: 'flex', gap: 5, alignItems: 'center',
                  background: BOARD_GLOWS[bi] || BOARD_GLOWS[0],
                  borderRadius: 10, padding: '4px 8px',
                  border: `1px solid ${BOARD_COLORS[bi] || BOARD_COLORS[0]}30`,
                }}
              >
                <span style={{
                  fontSize: 9, color: BOARD_COLORS[bi] || BOARD_COLORS[0],
                  fontWeight: 800, marginRight: 2, textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>{BOARD_LABELS[bi] || `Board ${bi + 1}`}</span>
                {board.map((card, ci) => (
                  <motion.div
                    key={`b${bi}-c${ci}`}
                    initial={{ rotateY: 180, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ delay: bi * 0.3 + ci * 0.1, duration: 0.4 }}
                  >
                    <CardImg card={card} width={42} delay={bi * 0.3 + ci * 0.1} fourColorDeck={fourColorDeck} />
                  </motion.div>
                ))}
              </motion.div>
            </React.Fragment>
          )
        ))}
      </div>
    );
  }

  // Standard single board
  if (cards.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '42%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        gap: 6,
        zIndex: 15,
      }}
    >
      {/* Ambient glow behind cards */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 0.4, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: `${cards.length * 58 + 40}px`,
          height: '90px',
          background: `radial-gradient(ellipse, ${T.accent}30 0%, transparent 70%)`,
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
      {cards.map((card, i) => (
        <motion.div
          key={`cc-${i}`}
          style={{
            animation: isNewCard(i) ? 'cardSpotlight 1.5s ease-in-out' : 'none',
          }}
        >
          <CardImg card={card} width={52} delay={i * 0.12} fourColorDeck={fourColorDeck} />
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// POT DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

function PotDisplay({ potTotal, pots = [], formatFn, seats = [] }) {
  if (!potTotal || potTotal <= 0) return null;

  // Generate chip stack visualization based on pot size
  const chipColors = ['#e53935', '#1e88e5', '#43a047', '#000000', '#9c27b0'];
  const chipCount = Math.min(Math.ceil(potTotal / 100), 8);

  return (
    <div
      style={{
        position: 'absolute',
        top: '28%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        zIndex: 15,
      }}
    >
      {/* Animated chip stack */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
        {Array.from({ length: Math.min(chipCount, 5) }).map((_, i) => (
          <motion.div
            key={`chip-${i}`}
            initial={{ y: -20, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 300 }}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: `radial-gradient(circle at 40% 35%, ${chipColors[i % chipColors.length]}dd, ${chipColors[i % chipColors.length]})`,
              border: '1.5px solid rgba(255,255,255,0.4)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          />
        ))}
      </div>

      <motion.div
        key={potTotal}
        initial={{ scale: 0.8, y: 5 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200 }}
        style={{
          background: 'rgba(0,0,0,0.7)',
          border: `1px solid ${T.accentDim}`,
          borderRadius: 16,
          padding: '4px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14, color: T.accent }}></span>
        <span style={{ fontSize: 16, fontWeight: 800, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>
          {formatFn ? formatFn(potTotal) : potTotal.toLocaleString()}
        </span>
      </motion.div>

      {pots.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {pots.map((pot, i) => {
            const POT_COLORS = ['#FFD700', '#4fc3f7', '#ce93d8', '#f48fb1'];
            const potColor = POT_COLORS[i] || POT_COLORS[0];
            const miniChipCount = Math.min(Math.ceil((pot.amount || 0) / 200), 4);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.15 * i, type: 'spring', stiffness: 200 }}
                style={{
                  background: `rgba(0,0,0,0.6)`,
                  border: `1px solid ${potColor}40`,
                  borderRadius: 10,
                  padding: '4px 10px',
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: `0 0 6px ${potColor}20`,
                }}
              >
                {/* Mini chip stack */}
                <div style={{ display: 'flex', position: 'relative', width: 16 + miniChipCount * 2, height: 16 }}>
                  {Array.from({ length: miniChipCount }).map((_, ci) => (
                    <div
                      key={ci}
                      style={{
                        position: 'absolute',
                        left: ci * 3, top: ci * -2,
                        width: 12, height: 12, borderRadius: '50%',
                        background: `radial-gradient(circle, ${potColor} 30%, ${potColor}99 100%)`,
                        border: '1px solid rgba(255,255,255,0.5)',
                        boxShadow: `0 0 4px ${potColor}40`,
                      }}
                    />
                  ))}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: potColor, fontSize: 10, fontWeight: 800, lineHeight: 1.2 }}>
                    {i === 0 ? 'Main' : `Side ${i}`}
                  </div>
                  <div style={{ color: '#E4E6EB', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {(pot.amount || 0).toLocaleString()}
                  </div>
                  {pot.eligible && (
                    <div style={{ color: '#8E8E93', fontSize: 8 }}>{pot.eligible} eligible</div>
                  )}
                </div>
                {/* E3: Player avatar thumbnails */}
                {pot.playerIds?.length > 0 && (
                  <div style={{ display: 'flex', gap: -4, marginLeft: 4 }}>
                    {pot.playerIds.slice(0, 3).map((pid, pi) => {
                      const pSeat = seats?.find(s => s.player && String(s.player.id) === String(pid));
                      return (
                        <div
                          key={pi}
                          title={pSeat?.player?.displayName || `Player ${pi + 1}`}
                          style={{
                            width: 16, height: 16, borderRadius: '50%',
                            background: pSeat?.player?.avatarUrl ? `url(${pSeat.player.avatarUrl}) center/cover` : `hsl(${pi * 120}, 60%, 45%)`,
                            border: `1px solid ${potColor}80`,
                            marginLeft: pi > 0 ? -4 : 0,
                            fontSize: 7, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {!pSeat?.player?.avatarUrl && (pSeat?.player?.displayName?.[0]?.toUpperCase() || '?')}
                        </div>
                      );
                    })}
                    {pot.playerIds.length > 3 && (
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', marginLeft: -4, fontSize: 7, color: '#8E8E93', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+{pot.playerIds.length - 3}</div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION PANEL — Fold / Check / Call / Bet / Raise / All-In
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// PINEAPPLE DISCARD PANEL
// ═══════════════════════════════════════════════════════
function DiscardPanel({ cards, onDiscard }) {
  const [selected, setSelected] = useState(null);

  if (!cards || cards.length !== 3) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.7))',
        padding: '16px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        zIndex: 200,
      }}
    >
      <span style={{ color: '#FFD700', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>
        DISCARD ONE CARD
      </span>
      <div style={{ display: 'flex', gap: 12 }}>
        {cards.map((card, i) => (
          <div
            key={i}
            onClick={() => setSelected(i)}
            style={{
              cursor: 'pointer',
              transform: selected === i ? 'translateY(-12px) scale(1.08)' : 'none',
              border: selected === i ? '3px solid #FA383E' : '3px solid transparent',
              borderRadius: 8,
              transition: 'all 0.15s',
              opacity: selected !== null && selected !== i ? 0.5 : 1,
            }}
          >
            <CardImg card={card} width={64} fourColorDeck={fourColorDeck} />
          </div>
        ))}
      </div>
      <button
        onClick={() => { if (selected !== null) onDiscard(selected); }}
        disabled={selected === null}
        style={{
          padding: '10px 32px',
          background: selected !== null ? '#FA383E' : '#3E4042',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 14,
          cursor: selected !== null ? 'pointer' : 'default',
          opacity: selected !== null ? 1 : 0.4,
          transition: 'all 0.2s',
        }}
      >
        Discard{selected !== null ? ` Card ${selected + 1}` : ''}
      </button>
    </motion.div>
  );
}

function ActionPanel({ actions, onAction, stack, currentBet, bigBlind, potTotal = 0, street = 'preflop' }) {
  const [betAmount, setBetAmount] = useState(0);
  const [showSlider, setShowSlider] = useState(false);
  const [customPresets, setCustomPresets] = useState(null);
  
  const [isEditingPresets, setIsEditingPresets] = useState(false);
  const [editP1, setEditP1] = useState(0.33);
  const [editP2, setEditP2] = useState(0.50);
  const [editP3, setEditP3] = useState(0.67);
  const [editP4, setEditP4] = useState(1.00);
  const [editP5, setEditP5] = useState(2.00);

  const handleSavePresets = () => {
    const payload = { p1: editP1, p2: editP2, p3: editP3, p4: editP4, p5: editP5 };
    localStorage.setItem('smarter-poker-bet-presets', JSON.stringify(payload));
    saveAppSetting('poker_bet_presets', payload, 'smarter-poker-bet-presets');
    eventBus.emit(EventType.DATA_MUTATED, 'bet_presets_changed');
    setCustomPresets(payload);
    setIsEditingPresets(false);
  };

  const handleOpenEditPresets = () => {
    setEditP1(customPresets?.p1 || 0.33);
    setEditP2(customPresets?.p2 || 0.50);
    setEditP3(customPresets?.p3 || 0.67);
    setEditP4(customPresets?.p4 || 1.00);
    setEditP5(customPresets?.p5 || 2.00);
    setIsEditingPresets(true);
  };

  // Sync bet presets across tables
  useEffect(() => {
    const loadPresets = () => {
      try {
        const saved = localStorage.getItem('smarter-poker-bet-presets');
        if (saved) setCustomPresets(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to parse bet presets', e);
      }
    };
    loadPresets();
    
    // Listen for cross-tab or cross-component updates
    window.addEventListener('storage', loadPresets);
    const unsub = eventBus.on(EventType.DATA_MUTATED, (payload) => {
      if (payload === 'bet_presets_changed') loadPresets();
    });
    
    return () => {
      window.removeEventListener('storage', loadPresets);
      if (typeof unsub === 'function') unsub();
      else eventBus.off(EventType.DATA_MUTATED, loadPresets); // Fallback if unsub isn't supported
    };
  }, []);

  // Parse legal actions
  const canFold = actions?.find(a => a.type === 'fold');
  const canCheck = actions?.find(a => a.type === 'check');
  const canCall = actions?.find(a => a.type === 'call');
  const canRaise = actions?.find(a => a.type === 'raise');
  const canBet = actions?.find(a => a.type === 'bet');
  const canAllIn = actions?.find(a => a.type === 'all_in');
  const betOrRaise = canRaise || canBet;
  const minBet = betOrRaise?.minAmount || betOrRaise?.amount || bigBlind || 2;
  const maxBet = betOrRaise?.maxAmount || stack || 0;

  // Reset bet when actions change
  useEffect(() => {
    setBetAmount(minBet);
    setShowSlider(false);
  }, [actions, minBet]);

  if (!actions || actions.length === 0) return null;

  // ═══ PHASE 26: SMART GTO BET SIZING ═══
  // Street-aware presets: Preflop uses BB multiples, Postflop uses pot fractions
  const isPreflop = street === 'preflop' || street === 'pre';
  const effectivePot = potTotal || bigBlind * 2;
  const bb = bigBlind || 2;

  // Custom user overrides (if user set them)
  const p1 = customPresets?.p1 || (isPreflop ? null : 0.33);
  const p2 = customPresets?.p2 || (isPreflop ? null : 0.50);
  const p3 = customPresets?.p3 || (isPreflop ? null : 0.67);
  const p4 = customPresets?.p4 || (isPreflop ? null : 1.00);
  const p5 = customPresets?.p5 || (isPreflop ? null : 1.50);

  const presets = betOrRaise ? (() => {
    let raw;
    if (isPreflop && !customPresets) {
      // GTO preflop sizing: BB multiples
      raw = [
        { label: '2.5×', amount: Math.floor(bb * 2.5) },
        { label: '3×', amount: Math.floor(bb * 3) },
        { label: '4×', amount: Math.floor(bb * 4) },
        { label: '5×', amount: Math.floor(bb * 5) },
      ];
    } else {
      // GTO postflop sizing: pot fractions
      raw = [
        { label: '⅓', amount: Math.floor(effectivePot * (p1 || 0.33)) },
        { label: '½', amount: Math.floor(effectivePot * (p2 || 0.50)) },
        { label: '⅔', amount: Math.floor(effectivePot * (p3 || 0.67)) },
        { label: 'Pot', amount: Math.floor(effectivePot * (p4 || 1.00)) },
        { label: '1.5×', amount: Math.floor(effectivePot * (p5 || 1.50)) },
      ];
    }
    return raw
      .map(p => ({ ...p, amount: Math.max(minBet, p.amount) }))
      .filter(p => p.amount <= maxBet)
      // Deduplicate amounts that resolve to the same value
      .filter((p, i, arr) => i === 0 || p.amount !== arr[i - 1].amount);
  })() : [];

  // Mobile responsive sizing
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 390;
  const btnMinWidth = isMobile ? 60 : 72;
  const btnFontSize = isMobile ? 12 : 14;

  const callAmount = canCall?.amount || 0;

  const handleTick = (dir) => {
    setBetAmount(prev => {
      const step = bigBlind || 2;
      let next = dir > 0 ? prev + step : prev - step;
      if (next < minBet) next = minBet;
      if (next > maxBet) next = maxBet;
      if (next !== prev) {
        try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      }
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        zIndex: 30,
        width: isMobile ? '95%' : 'auto',
      }}
    >
      {/* Pot Odds HUD — rendered via Phase 27 main render (not here, avoids duplicate) */}
      {/* Bet slider + presets */}
      <AnimatePresence>
        {showSlider && betOrRaise && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              background: 'linear-gradient(180deg, rgba(30,30,40,0.95) 0%, rgba(15,15,20,0.98) 100%)',
              borderRadius: 16, padding: '16px 20px',
              border: '1px solid rgba(255,215,0,0.15)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.05)',
              backdropFilter: 'blur(20px)',
              width: isMobile ? '100%' : 360,
            }}
          >
            {/* Amount Screen */}
            <div style={{
              background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '8px 24px', letterSpacing: '0.5px',
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5), 0 0 10px rgba(255,215,0,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%'
            }}>
              <span style={{ fontSize: 13, color: '#aaa', marginRight: 8, fontWeight: 600 }}>AMOUNT</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: '#FFD700', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 12px rgba(255,215,0,0.4)' }}>
                {betAmount.toLocaleString()}
              </span>
            </div>

            {/* Premium Increment Track */}
            <style dangerouslySetInnerHTML={{__html: `
              .premium-bet-slider {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 12px;
                background: rgba(0, 0, 0, 0.6);
                border-radius: 6px;
                outline: none;
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.8), 0 1px 1px rgba(255,255,255,0.05);
                position: relative;
                cursor: grab;
              }
              .premium-bet-slider:active {
                cursor: grabbing;
              }
              .premium-bet-slider::-webkit-slider-runnable-track {
                width: 100%;
                height: 12px;
                border-radius: 6px;
                background: linear-gradient(to right, 
                  #FFD700 0%, 
                  #FF6B35 var(--slider-pct, 0%), 
                  rgba(255, 255, 255, 0.05) var(--slider-pct, 0%), 
                  rgba(255, 255, 255, 0.05) 100%);
              }
              .premium-bet-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 34px;
                height: 34px;
                border-radius: 50%;
                background: radial-gradient(circle at 35% 25%, #fff 0%, #e8e8e8 20%, #888 70%, #222 100%);
                border: 2px solid #FFD700;
                box-shadow: 0 0 15px rgba(255, 215, 0, 0.5), 0 4px 8px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.5);
                cursor: pointer;
                transition: transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                margin-top: -11px;
              }
              .premium-bet-slider:active::-webkit-slider-thumb {
                transform: scale(1.15);
                box-shadow: 0 0 20px rgba(255, 215, 0, 0.9), 0 6px 12px rgba(0,0,0,0.7), inset 0 2px 5px rgba(255,255,255,0.8);
              }
              .bet-btn-haptic {
                transition: all 0.1s ease;
              }
              .bet-btn-haptic:active {
                transform: scale(0.9);
                background: rgba(255,215,0,0.15) !important;
                border-color: #FFD700 !important;
              }
            `}} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
              <button 
                className="bet-btn-haptic"
                onClick={() => handleTick(-1)}
                style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 22, background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(0,0,0,0.2))', color: '#fff', fontSize: 26, paddingBottom: 2, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)' }}
              >−</button>
              
              <input
                className="premium-bet-slider"
                type="range"
                min={minBet}
                max={maxBet}
                step={1}
                value={betAmount || minBet}
                onChange={(e) => {
                   setBetAmount(parseInt(e.target.value));
                   try { if (typeof navigator !== 'undefined' && navigator.vibrate && parseInt(e.target.value) % (bigBlind || 2) === 0) navigator.vibrate(2); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                }}
                style={{
                  flex: 1,
                  '--slider-pct': `${maxBet > minBet ? (((betAmount || minBet) - minBet) / (maxBet - minBet)) * 100 : 0}%`
                }}
              />

              <button 
                className="bet-btn-haptic"
                onClick={() => handleTick(1)}
                style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 22, background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(0,0,0,0.2))', color: '#fff', fontSize: 24, paddingBottom: 2, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)' }}
              >+</button>
            </div>

          {/* Presets Row */}
            {isEditingPresets ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input type="number" step="0.01" value={editP1} onChange={e => setEditP1(parseFloat(e.target.value) || 0)} style={{ width: 44, fontSize: 11, background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 4px', textAlign: 'center' }} />
                  <input type="number" step="0.01" value={editP2} onChange={e => setEditP2(parseFloat(e.target.value) || 0)} style={{ width: 44, fontSize: 11, background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 4px', textAlign: 'center' }} />
                  <input type="number" step="0.01" value={editP3} onChange={e => setEditP3(parseFloat(e.target.value) || 0)} style={{ width: 44, fontSize: 11, background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 4px', textAlign: 'center' }} />
                  <input type="number" step="0.01" value={editP4} onChange={e => setEditP4(parseFloat(e.target.value) || 0)} style={{ width: 44, fontSize: 11, background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 4px', textAlign: 'center' }} />
                  <input type="number" step="0.01" value={editP5} onChange={e => setEditP5(parseFloat(e.target.value) || 0)} style={{ width: 44, fontSize: 11, background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '2px 4px', textAlign: 'center' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setIsEditingPresets(false)} style={{ background: 'transparent', color: '#999', border: 'none', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleSavePresets} style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                {/* Min quick-jump */}
                <button
                  onClick={() => setBetAmount(minBet)}
                  style={{
                    background: 'rgba(96,165,250,0.12)', color: '#60a5fa',
                    border: '1px solid rgba(96,165,250,0.25)', borderRadius: 6,
                    padding: '3px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  }}
                >Min</button>
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setBetAmount(p.amount)}
                    style={{
                      background: 'rgba(255,215,0,0.1)',
                      color: T.accent,
                      border: `1px solid ${T.accentDim}`,
                      borderRadius: 6,
                      padding: '3px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setBetAmount(maxBet)}
                  style={{
                    background: 'rgba(147,51,234,0.2)',
                    color: '#c084fc',
                    border: '1px solid #7c3aed',
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  All-In
                </button>
                <button
                  onClick={handleOpenEditPresets}
                  title="Configure Bet Presets"
                  style={{
                    background: 'transparent',
                    color: '#888',
                    border: 'none',
                    padding: '0 4px',
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >

                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {canFold && (
          <ActionButton
            label="Fold"
            color={T.foldRed}
            onClick={() => onAction({ type: 'fold' })}
          />
        )}

        {canCheck && (
          <ActionButton
            label="Check"
            color={T.checkBlue}
            onClick={() => onAction({ type: 'check' })}
          />
        )}

        {canCall && (() => {
          const callAmt = canCall.amount || 0;
          const potOdds = callAmt > 0 ? ((callAmt / (potTotal + callAmt)) * 100).toFixed(0) : 0;
          return (
            <ActionButton
              label={`Call ${callAmt.toLocaleString()}`}
              sublabel={potTotal > 0 ? `${potOdds}% pot odds` : null}
              color={T.callGreen}
              onClick={() => onAction({ type: 'call' })}
            />
          );
        })()}

        {betOrRaise && (
          <ActionButton
            label={showSlider ? `${canRaise ? 'Raise' : 'Bet'} ${betAmount.toLocaleString()}` : (canRaise ? 'Raise' : 'Bet')}
            color={canRaise ? T.raiseYellow : T.betOrange}
            onClick={() => {
              if (showSlider) {
                onAction({ type: canRaise ? 'raise' : 'bet', amount: betAmount });
              } else {
                setShowSlider(true);
              }
            }}
          />
        )}

        {canAllIn && !betOrRaise && (
          <ActionButton
            label={`All-In ${stack.toLocaleString()}`}
            color={T.allInPurple}
            onClick={() => onAction({ type: 'all_in' })}
          />
        )}
      </div>
    </motion.div>
  );
}

function ActionButton({ label, sublabel, color, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      style={{
        background: `linear-gradient(180deg, ${color}, ${color}CC)`,
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: sublabel ? '6px 16px 4px' : '10px 16px',
        fontSize: 14,
        fontWeight: 800,
        cursor: 'pointer',
        minWidth: btnMinWidth,
        boxShadow: `0 3px 12px ${color}66`,
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
      }}
    >
      <span style={{ fontSize: btnFontSize }}>{label}</span>
      {sublabel && <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.75, marginTop: -1 }}>{sublabel}</span>}
    </motion.button>
  );
}

/**
 * PreActionPanel — Checkboxes for pre-selecting actions before your turn
 * Shows when you're seated, not your turn, and a hand is in progress
 */
function PreActionPanel({ preSelectedAction, setPreSelectedAction, currentBet = 0, myBet = 0 }) {
  const amountToCall = Math.max(0, currentBet - myBet);
  
  const options = [
    { value: 'fold_any', label: 'Fold to Any', color: '#ef5350' },
    { value: 'check_fold', label: 'Check/Fold', color: '#ff9800' },
    { value: 'call_any', label: 'Call Any', color: '#66bb6a' },
  ];

  // Only offer "Check" explicitly if there's no bet to them right now
  if (amountToCall === 0) {
    options.splice(2, 0, { value: 'check', label: 'Check', color: '#42a5f5' });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        zIndex: 35,
        background: 'rgba(20, 21, 23, 0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: 12,
        padding: '8px 14px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {options.map(opt => {
        const active = preSelectedAction === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setPreSelectedAction(active ? null : opt.value)}
            style={{
              background: active ? `${opt.color}25` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active ? opt.color : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8,
              padding: '6px 14px',
              color: active ? opt.color : '#A0A3A8',
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${active ? opt.color : '#555'}`,
              background: active ? opt.color : 'transparent',
              color: '#fff', fontSize: 10, fontWeight: 900
            }}>
              {active ? '✓' : ''}
            </div>
            {opt.label}
          </button>
        );
      })}
    </motion.div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════
// BUY-IN DIALOG
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN TABLE PANEL — In-game controls for admin/owner/manager
// ═══════════════════════════════════════════════════════════════════════════

function AdminTablePanel({ tableId, clubId, tableState, seats, userId, userRole, send, onClose, supabase: sb }) {
  const [loading, setLoading] = useState(null); // action name
  const [message, setMessage] = useState(null);

  const apiCall = async (endpoint, body) => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch (e) { return { error: e.message }; }
  };

  const doAction = async (action, extra = {}) => {
    setLoading(action); setMessage(null);
    const r = await apiCall('/api/club-arena/manage-table', {
      tableId, clubId, userId, action, ...extra,
    });
    setLoading(null);
    if (r.error) setMessage({ type: 'error', text: r.error });
    else setMessage({ type: 'success', text: `${action} successful` });
    setTimeout(() => setMessage(null), 3000);
  };

  const doKick = async (targetPlayerId, displayName) => {
    if (!confirm(`Kick ${displayName}?`)) return;
    send('kick_player', { targetPlayerId, role: userRole, reason: 'admin_kick' });
    setMessage({ type: 'success', text: `${displayName} kicked` });
    setTimeout(() => setMessage(null), 3000);
  };

  const isPaused = tableState?.status === 'paused';
  const seatedPlayers = seats?.filter(s => s.player && s.status !== 'empty') || [];

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 280,
        background: 'rgba(24,25,26,0.97)', borderLeft: '1px solid #3E4042',
        zIndex: 300, display: 'flex', flexDirection: 'column',
        backdropFilter: 'blur(12px)', overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #3E4042' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#E4E6EB' }}>Admin Controls</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#B0B3B8', fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Status */}
      {message && (
        <div style={{ padding: '8px 16px', background: message.type === 'error' ? 'rgba(244,67,54,0.15)' : 'rgba(76,175,80,0.15)', color: message.type === 'error' ? '#ef5350' : '#66bb6a', fontSize: 12, fontWeight: 600 }}>
          {message.text}
        </div>
      )}

      {/* Table Actions */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Table Actions</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AdminBtn label={isPaused ? 'Resume Table' : 'Pause Table'} onClick={() => doAction(isPaused ? 'resume' : 'pause')} loading={loading === 'pause' || loading === 'resume'} />
          <AdminBtn label="Close Table" onClick={() => { if (confirm('Close this table? All players will be cashed out.')) doAction('close'); }} color="#FA383E" loading={loading === 'close'} />
        </div>
      </div>

      {/* Seated Players — Kick */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #3E4042' }}>
        <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Players ({seatedPlayers.length})</div>
        {seatedPlayers.length === 0 ? (
          <div style={{ color: '#666', fontSize: 12 }}>No players seated</div>
        ) : seatedPlayers.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a2b2c' }}>
            <div>
              <div style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 600 }}>{s.player?.displayName || `Seat ${s.seatIndex + 1}`}</div>
              <div style={{ color: '#B0B3B8', fontSize: 11 }}>Stack: {(s.stack || 0).toLocaleString()}</div>
            </div>
            {String(s.player?.id) !== String(userId) && (
              <button onClick={() => doKick(s.player.id, s.player.displayName || 'Player')}
                style={{ background: 'rgba(244,67,54,0.15)', color: '#ef5350', border: '1px solid rgba(244,67,54,0.3)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Kick
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Quick Settings */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #3E4042' }}>
        <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Info</div>
        <div style={{ fontSize: 12, color: '#B0B3B8' }}>
          <div>Variant: {tableState?.config?.variant?.toUpperCase() || 'NLH'}</div>
          <div>Stakes: {tableState?.config?.smallBlind}/{tableState?.config?.bigBlind}</div>
          <div>Hands: {tableState?.handCount || 0}</div>
          <div>Status: {tableState?.status || 'unknown'}</div>
        </div>
      </div>
    </motion.div>
  );
}

function AdminBtn({ label, onClick, color = '#2374E1', loading = false }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{
        background: loading ? '#333' : `${color}22`, color: loading ? '#666' : color,
        border: `1px solid ${color}44`, borderRadius: 8, padding: '8px 12px',
        fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.15s',
      }}>
      {loading ? '...' : label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVER / WAITLIST BAR — Shows when player is NOT seated
// ═══════════════════════════════════════════════════════════════════════════

function ObserverBar({ tableState, userId, send, onClickSeat, seatOffer }) {
  const seats = tableState?.seats || [];
  const waitlist = tableState?.waitlist || [];
  const emptySeats = seats.filter(s => s.status === 'empty');
  const isOnWaitlist = waitlist.some(w => String(w.playerId) === String(userId));
  const myWaitPos = waitlist.findIndex(w => String(w.playerId) === String(userId));
  const tableFull = emptySeats.length === 0 && !seatOffer;

  // Countdown for seat offer
  const [offerSecs, setOfferSecs] = useState(0);
  useEffect(() => {
    if (!seatOffer) { setOfferSecs(0); return; }
    const total = Math.round((seatOffer.timeout || 30000) / 1000);
    const elapsed = Math.round((Date.now() - seatOffer.offeredAt) / 1000);
    setOfferSecs(Math.max(0, total - elapsed));
    const iv = setInterval(() => setOfferSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(iv);
  }, [seatOffer]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 120,
        background: 'linear-gradient(180deg, rgba(24,25,26,0.0) 0%, rgba(24,25,26,0.95) 30%)',
        padding: '32px 16px 16px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 8,
      }}
    >
      {/* Observer badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, padding: '4px 16px',
      }}>
        <span style={{ fontSize: 14 }}></span>
        <span style={{ color: '#B0B3B8', fontSize: 12, fontWeight: 600 }}>Watching</span>
        {tableState?.game?.phase && tableState.game.phase !== 'idle' && (
          <span style={{ color: '#4ECDC4', fontSize: 11, fontWeight: 700 }}>LIVE</span>
        )}
      </div>

      {/* Seat offer (urgent) */}
      {seatOffer && offerSecs > 0 && (
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          style={{
            background: 'linear-gradient(135deg, rgba(76,175,80,0.2), rgba(76,175,80,0.1))',
            border: '2px solid #4caf50', borderRadius: 12,
            padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>Seat Available!</div>
            <div style={{ color: '#81C784', fontSize: 12 }}>Seat #{seatOffer.seatIndex + 1} reserved for you</div>
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900, color: offerSecs < 10 ? '#FF6B6B' : '#4caf50',
            fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'center',
          }}>{offerSecs}s</div>
          <button
            onClick={() => onClickSeat(seatOffer.seatIndex)}
            style={{
              background: 'linear-gradient(135deg, #31A24C, #268a3e)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(49,162,76,0.5)',
              animation: 'pulse 1s infinite',
            }}
          >Take Seat</button>
        </motion.div>
      )}

      {/* Waitlist status OR sit prompt */}
      {isOnWaitlist ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.4)',
            borderRadius: 10, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#2374E1' }}>#{myWaitPos + 1}</span>
            <div>
              <div style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 700 }}>On Waitlist</div>
              <div style={{ color: '#B0B3B8', fontSize: 11 }}>
                {myWaitPos === 0 ? "You're next!" : `${myWaitPos} ahead of you`}
              </div>
            </div>
          </div>
          <button
            onClick={() => send('leave_waitlist', {})}
            style={{
              background: 'rgba(244,67,54,0.15)', color: '#ef5350',
              border: '1px solid rgba(244,67,54,0.3)', borderRadius: 8,
              padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >Leave</button>
        </div>
      ) : tableFull ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ color: '#B0B3B8', fontSize: 13 }}>
            Table full ({seats.filter(s => s.player).length}/{seats.length})
          </div>
          <button
            onClick={() => send('join_waitlist', {})}
            style={{
              background: 'linear-gradient(135deg, #2374E1, #1a5cbf)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(35,116,225,0.4)',
            }}
          >
            Join Waitlist {waitlist.length > 0 ? `(${waitlist.length} waiting)` : ''}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ color: '#81C784', fontSize: 13 }}>
            {emptySeats.length} seat{emptySeats.length !== 1 ? 's' : ''} available
          </div>
          <button
            onClick={() => {
              // Click first empty seat
              const firstEmpty = seats.findIndex(s => s.status === 'empty');
              if (firstEmpty >= 0) onClickSeat(firstEmpty);
            }}
            style={{
              background: 'linear-gradient(135deg, #31A24C, #268a3e)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(49,162,76,0.4)',
            }}
          >
            Sit Down
          </button>
        </div>
      )}

      {/* Waitlist count (when not on it) */}
      {!isOnWaitlist && waitlist.length > 0 && (
        <div style={{ color: '#B0B3B8', fontSize: 11 }}>
          {waitlist.length} player{waitlist.length !== 1 ? 's' : ''} on waitlist
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REBUY MODAL — Cash game "Add Chips" with balance check (chip locking handled by seat.js)
// ═══════════════════════════════════════════════════════════════════════════

function RebuyModal({ currentStack, maxBuyIn, chipBalance, loading, error, onConfirm, onCancel }) {
  const maxAdd = Math.max(0, Math.min(maxBuyIn - currentStack, chipBalance ?? 0));
  const minAdd = 1;
  const [amount, setAmount] = useState(maxAdd);
  const insufficient = (chipBalance ?? 0) < minAdd;

  const quickOptions = [
    { label: 'Top Up', value: maxAdd },
    { label: 'Half', value: Math.floor(maxAdd / 2) },
    { label: 'Min', value: minAdd },
  ].filter(o => o.value > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        style={{
          background: '#1C1E21', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, padding: 24, width: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: '#E4E6EB', marginBottom: 4 }}>Add Chips</div>
        <div style={{ fontSize: 12, color: '#B0B3B8', marginBottom: 16 }}>Top up your stack at the table</div>

        {/* Balance info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12 }}>
          <div>
            <div style={{ color: '#B0B3B8' }}>Current Stack</div>
            <div style={{ color: '#fff', fontWeight: 700 }}>{currentStack.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#B0B3B8' }}>Available Balance</div>
            <div style={{ color: loading ? '#666' : (chipBalance ?? 0) < minAdd ? '#ef5350' : '#4caf50', fontWeight: 700 }}>
              {loading ? '…' : (chipBalance ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Max add-on info */}
        {!loading && maxAdd > 0 && (
          <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 12 }}>
            Max add: <strong style={{ color: '#fff' }}>{maxAdd.toLocaleString()}</strong>
            <span style={{ color: '#666' }}> (table max: {maxBuyIn.toLocaleString()})</span>
          </div>
        )}

        {insufficient ? (
          <div style={{ color: '#ef5350', fontSize: 13, fontWeight: 600, padding: '10px 0' }}>
            Insufficient chip balance to add chips.
          </div>
        ) : maxAdd <= 0 && !loading ? (
          <div style={{ color: '#f59e0b', fontSize: 13, fontWeight: 600, padding: '10px 0' }}>
            Stack is already at maximum buy-in ({maxBuyIn.toLocaleString()}).
          </div>
        ) : !loading && (
          <>
            {/* Quick select */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {quickOptions.map(o => (
                <button key={o.label} onClick={() => setAmount(o.value)} style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700,
                  background: amount === o.value ? 'rgba(35,116,225,0.3)' : 'rgba(255,255,255,0.05)',
                  color: amount === o.value ? '#4FC3F7' : '#B0B3B8',
                  border: `1px solid ${amount === o.value ? 'rgba(35,116,225,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6, cursor: 'pointer',
                }}>
                  {o.label}<br />
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{o.value.toLocaleString()}</span>
                </button>
              ))}
            </div>

            {/* Input */}
            <input
              type="number" min={minAdd} max={maxAdd} value={amount}
              onChange={e => setAmount(Math.min(maxAdd, Math.max(minAdd, parseInt(e.target.value) || 0)))}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                background: 'rgba(255,255,255,0.05)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.15)', outline: 'none',
                boxSizing: 'border-box', marginBottom: 12,
              }}
            />
          </>
        )}

        {error && <div style={{ color: '#ef5350', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'rgba(255,255,255,0.05)', color: '#B0B3B8',
            border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
          }}>Cancel</button>
          {!insufficient && maxAdd > 0 && !loading && (
            <button onClick={() => onConfirm(amount)} disabled={amount < minAdd || amount > maxAdd} style={{
              flex: 2, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: 'rgba(35,116,225,0.8)', color: '#fff',
              border: 'none', cursor: 'pointer', opacity: (amount < minAdd || amount > maxAdd) ? 0.5 : 1,
            }}>Add {amount.toLocaleString()} Chips</button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BUY-IN DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function BuyInDialog({ minBuyIn, maxBuyIn, bigBlind, chipBalance, isClubTable, onConfirm, onCancel }) {
  const effectiveMax = maxBuyIn < minBuyIn ? minBuyIn : maxBuyIn;
  const [amount, setAmount] = useState(Math.floor((minBuyIn + effectiveMax) / 2));
  const insufficientChips = isClubTable && chipBalance !== null && chipBalance < minBuyIn;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bgPanel,
          borderRadius: 16,
          padding: 32,
          border: `1px solid ${T.accentDim}`,
          maxWidth: 360,
          width: '90%',
          textAlign: 'center',
        }}
      >
        <h3 style={{ color: T.accent, fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          Take a Seat
        </h3>
        <p style={{ color: T.textSecondary, fontSize: 13, marginBottom: isClubTable ? 4 : 20 }}>
          Buy-in: {minBuyIn.toLocaleString()} – {effectiveMax.toLocaleString()} chips
        </p>
        {isClubTable && chipBalance !== null && (
          <p style={{ color: insufficientChips ? '#FA383E' : '#31A24C', fontSize: 12, marginBottom: 16 }}>
            {insufficientChips
              ? `Insufficient chips (${chipBalance.toLocaleString()} available, need ${minBuyIn.toLocaleString()})`
              : `Balance: ${chipBalance.toLocaleString()} chips`
            }
          </p>
        )}

        <div style={{ fontSize: 28, fontWeight: 800, color: T.textPrimary, marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
          {amount.toLocaleString()}
        </div>

        <input
          type="range"
          min={minBuyIn}
          max={effectiveMax}
          step={bigBlind}
          value={Math.min(amount, effectiveMax)}
          onChange={(e) => setAmount(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: T.accent, marginBottom: 20 }}
        />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          {[minBuyIn, Math.floor((minBuyIn + effectiveMax) / 2), effectiveMax].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              style={{
                background: amount === v ? T.accent : 'rgba(255,255,255,0.05)',
                color: amount === v ? T.bgDark : T.textSecondary,
                border: `1px solid ${amount === v ? T.accent : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {v === minBuyIn ? 'Min' : v === effectiveMax ? 'Max' : 'Mid'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: 'transparent',
              color: T.textSecondary,
              border: `1px solid rgba(255,255,255,0.1)`,
              borderRadius: 10,
              padding: '10px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => !insufficientChips && onConfirm(Math.min(amount, effectiveMax))}
            disabled={insufficientChips}
            style={{
              flex: 1,
              background: insufficientChips
                ? 'rgba(255,255,255,0.1)'
                : `linear-gradient(135deg, ${T.callGreen}, #15803d)`,
              color: insufficientChips ? T.textSecondary : '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '10px',
              fontSize: 14,
              fontWeight: 800,
              cursor: insufficientChips ? 'not-allowed' : 'pointer',
              boxShadow: insufficientChips ? 'none' : `0 4px 15px ${T.callGreen}40`,
              opacity: insufficientChips ? 0.5 : 1,
            }}
          >
            {insufficientChips ? 'Need More Chips' : 'Sit Down'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAT OVERLAY
// ═══════════════════════════════════════════════════════════════════════════

function ChatOverlay({ messages, onSend, players = [], reactions = {}, onReact }) {
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const listRef = useRef(null);
  const [mutedIds, setMutedIds] = useState([]);
  const [readCount, setReadCount] = useState(0);
  const [hoveredMsg, setHoveredMsg] = useState(null);

  const QUICK_EMOJIS = ['😀', '😂', '😎', '🤔', '👍', '👎', '🔥', '❤️', '💀', '🃏', '♠️', '♦️', '♣️', '♥️', '🏆', '💰', '🤑', '😱', '🤷', 'GG'];
  const REACTION_EMOJIS = ['👍', '😂', '🔥', '💰', '😎', '💀'];

  useEffect(() => {
    const readMutes = () => {
      try {
        const raw = localStorage.getItem('ca_muted_players');
        setMutedIds(raw ? JSON.parse(raw) : []);
      } catch (_) { setMutedIds([]); }
    };
    readMutes();
    window.addEventListener('ca_mute_updated', readMutes);
    return () => window.removeEventListener('ca_mute_updated', readMutes);
  }, []);

  const filteredMessages = useMemo(() => {
    if (!mutedIds.length) return messages;
    return messages.filter(m => m.type === 'dealer' || !m.senderId || !mutedIds.includes(m.senderId));
  }, [messages, mutedIds]);

  const unreadCount = expanded ? 0 : Math.max(0, filteredMessages.length - readCount);
  useEffect(() => { if (expanded) setReadCount(filteredMessages.length); }, [expanded, filteredMessages.length]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [filteredMessages]);

  const timeAgo = (ts) => {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
  };

  const renderText = (t) => {
    if (!t) return null;
    return t.split(/(@\w+)/g).map((p, i) =>
      p.startsWith('@') ? <span key={i} style={{ color: '#FFD700', fontWeight: 800 }}>{p}</span> : p
    );
  };

  const pinnedMsg = filteredMessages.find(m => m.pinned);

  return (
    <div style={{ position: 'absolute', bottom: 80, left: 10, width: 240, zIndex: 25 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'rgba(0,0,0,0.6)', color: T.textSecondary,
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
            padding: '4px 10px', fontSize: 11, cursor: 'pointer', position: 'relative',
          }}
        >
          {expanded ? 'Hide' : 'Chat'}
          {!expanded && unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6,
              background: '#ef4444', color: '#fff', borderRadius: '50%',
              width: 16, height: 16, fontSize: 9, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 6px rgba(239,68,68,0.5)',
            }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
        {expanded && (
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={() => onSend('GG')}
            style={{
              background: 'rgba(255,215,0,0.15)', color: '#FFD700',
              border: '1px solid rgba(255,215,0,0.3)', borderRadius: 6,
              padding: '3px 8px', fontSize: 10, fontWeight: 800, cursor: 'pointer',
            }}
          >GG</motion.button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 200 }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: 'rgba(0,0,0,0.75)', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              backdropFilter: 'blur(10px)', marginTop: 4,
            }}
          >
            {pinnedMsg && (
              <div style={{
                padding: '4px 8px', background: 'rgba(255,215,0,0.08)',
                borderBottom: '1px solid rgba(255,215,0,0.15)', fontSize: 10,
                color: '#FFD700', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
              }}>{pinnedMsg.text || pinnedMsg.message}</div>
            )}

            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 8, fontSize: 11 }}>
              {filteredMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 3, position: 'relative' }}
                  title={m.timestamp ? timeAgo(m.timestamp) : ''}
                  onMouseEnter={() => setHoveredMsg(i)}
                  onMouseLeave={() => setHoveredMsg(null)}
                >
                  {m.type === 'dealer' ? (
                    <span style={{ color: '#F5A623', fontWeight: 600, fontSize: 10, fontStyle: 'italic' }}>{m.text}</span>
                  ) : m.type === 'emoji' ? (
                    <span style={{ color: T.textSecondary, fontSize: 10 }}>{m.senderName || 'Player'} threw {m.emoji}</span>
                  ) : (
                    <>
                      <span style={{ color: T.accent, fontWeight: 700 }}>{m.displayName}: </span>
                      <span style={{ color: T.textPrimary }}>{renderText(m.message)}</span>
                      {m.timestamp && <span style={{ color: '#555', fontSize: 8, marginLeft: 4 }}>{timeAgo(m.timestamp)}</span>}
                    </>
                  )}
                  {/* F1: Reaction badges */}
                  {reactions[i] && Object.keys(reactions[i]).length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
                      {Object.entries(reactions[i]).map(([emoji, count]) => (
                        <span key={emoji} style={{ fontSize: 9, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '0 3px', cursor: 'pointer' }}
                          onClick={() => onReact?.(i, emoji)}
                        >{emoji} {count}</span>
                      ))}
                    </div>
                  )}
                  {/* F1: Quick reaction hover bar */}
                  {hoveredMsg === i && m.type !== 'dealer' && (
                    <div style={{
                      position: 'absolute', right: 0, top: -2,
                      background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8, padding: '1px 3px', display: 'flex', gap: 1, zIndex: 5,
                    }}>
                      {REACTION_EMOJIS.map(em => (
                        <button key={em} onClick={() => onReact?.(i, em)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: '0 2px', borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >{em}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <input
                type="text" value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onSend(text.trim()); setText(''); } }}
                placeholder="Type... (use @ to mention)"
                style={{ flex: 1, background: 'transparent', color: T.textPrimary, border: 'none', padding: '6px 8px', fontSize: 11, outline: 'none' }}
              />
              <button
                onClick={() => setShowEmoji(!showEmoji)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '4px 6px', opacity: showEmoji ? 1 : 0.5 }}
              ></button>
            </div>

            <AnimatePresence>
              {showEmoji && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '4px 6px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}
                >
                  {QUICK_EMOJIS.map((em) => (
                    <button key={em} onClick={() => { onSend(em); setShowEmoji(false); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: em.length > 2 ? 9 : 14, padding: '2px 3px', borderRadius: 4, color: em.length > 2 ? '#FFD700' : undefined, fontWeight: em.length > 2 ? 800 : undefined }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >{em}</button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// TABLE INFO BAR
// ═══════════════════════════════════════════════════════════════════════════







// ═══════════════════════════════════════════════════════════════════════════
// TABLE INFO BAR
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TOURNAMENT HUD — Blind clock, level, players, prize pool
// ═══════════════════════════════════════════════════════════════════════════

function TournamentHUD({ tournamentId, userId }) {
  const [state, setState] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [breakCountdown, setBreakCountdown] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [prevRemaining, setPrevRemaining] = useState(null);
  const [elimFlash, setElimFlash] = useState(false);

  // [HARDENING: PRO PHASE 10] Master Audit Trail for Mystery Bounties
  const [remainingEnvelopes, setRemainingEnvelopes] = useState(null);

  // Listen to the EventBus for mystery bounty announcements
  useEffect(() => {
    if (!eventBus) return;
    const handleReveal = (e) => {
      // The reveal payload includes { amount, label, remainingEnvelopes }
      if (e.payload?.remainingEnvelopes) {
        setRemainingEnvelopes(e.payload.remainingEnvelopes);
      }
    };
    const unsub = eventBus.on(EventType.MYSTERY_BOUNTY_REVEALED, handleReveal);
    return () => unsub();
  }, []);

  // Poll tournament state every 5s
  useEffect(() => {
    if (!tournamentId) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/poker/engine/tournament', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'state', tournamentId }),
        });
        const d = await res.json();
        if (d.success && active) {
          // Detect eliminations since last poll
          if (prevRemaining !== null && d.playersRemaining < prevRemaining) {
            setElimFlash(true);
            setTimeout(() => setElimFlash(false), 2000);
          }
          setPrevRemaining(d.playersRemaining);
          setState(d);
          if (d.status === 'break' && d.breakTimeRemaining > 0) {
            setBreakCountdown(d.breakTimeRemaining);
            setCountdown(0);
          } else if (d.levelTimeRemaining > 0) {
            setCountdown(d.levelTimeRemaining);
            setBreakCountdown(0);
          }
        }
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [tournamentId]);

  // Level countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const iv = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(iv);
  }, [countdown > 0]);

  // Break countdown
  useEffect(() => {
    if (breakCountdown <= 0) return;
    const iv = setInterval(() => setBreakCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(iv);
  }, [breakCountdown > 0]);

  if (!state) return null;

  const isBreak = state.status === 'break';
  const fmtTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeCountdown = isBreak ? breakCountdown : countdown;
  const isLow = !isBreak && activeCountdown > 0 && activeCountdown < 60;
  const blinds = state.blinds || {};

  // ITM — in the money
  const paidPlaces = state.paidPlaces || 0;
  const remaining = state.playersRemaining || 0;
  const isITM = paidPlaces > 0 && remaining <= paidPlaces;
  const bubblePlayer = paidPlaces > 0 && remaining === paidPlaces + 1;

  return (
    <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 200 }}>
      {/* ── [HARDENING: PRO PHASE 10] THE BOUNTY BOARD ── */}
      {/* Displays glowing envelope summary alongside the blind structure */}
      <AnimatePresence>
        {remainingEnvelopes && remainingEnvelopes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'absolute', right: '105%', top: 0,
              background: 'linear-gradient(135deg, rgba(20,20,20,0.95), rgba(40,30,0,0.95))',
              border: '1px solid #FFD700', borderRadius: 10, padding: '8px 12px',
              minWidth: 160, backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 20px rgba(255,215,0,0.2)',
            }}
          >
            <div style={{ color: '#FFD700', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1, borderBottom: '1px solid rgba(255,215,0,0.4)', paddingBottom: 4 }}>
              Mystery Bounties Left
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {remainingEnvelopes.map((env, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#E4E6EB', fontSize: 12, fontWeight: 700 }}>{env.label}</span>
                  <span style={{
                    background: env.exampleAmount >= 1000 ? '#FFD700' : 'rgba(255,255,255,0.1)',
                    color: env.exampleAmount >= 1000 ? '#000' : '#fff',
                    padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 900
                  }}>
                    {env.count}x
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          background: isITM ? 'rgba(20,40,20,0.97)' : 'rgba(24,25,26,0.95)',
          border: `1px solid ${isITM ? 'rgba(76,175,80,0.5)' : bubblePlayer ? 'rgba(251,191,36,0.6)' : 'rgba(255,215,0,0.3)'}`,
          borderRadius: 10, padding: '6px 14px', cursor: 'pointer',
          backdropFilter: 'blur(10px)', boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 10, minWidth: 220,
        }}
      >
        {isBreak ? (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#4ECDC4', textTransform: 'uppercase' }}>BREAK</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              Next: {state.nextBlinds ? `${state.nextBlinds.smallBlind}/${state.nextBlinds.bigBlind}` : '—'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#4ECDC4', marginLeft: 'auto' }}>
              {breakCountdown > 0 ? fmtTime(breakCountdown) : '--:--'}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: isITM ? '#4caf50' : '#FFD700', textTransform: 'uppercase' }}>
              {isITM ? 'ITM' : `LVL ${state.currentLevel}`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{blinds.smallBlind || '?'}/{blinds.bigBlind || '?'}</div>
            {blinds.ante > 0 && <div style={{ fontSize: 11, color: '#B0B3B8' }}>A:{blinds.ante}</div>}
            <div style={{
              fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginLeft: 'auto',
              color: isLow ? '#FF6B6B' : countdown > 0 ? '#4ECDC4' : '#666',
            }}>
              {countdown > 0 ? fmtTime(countdown) : '--:--'}
            </div>
          </>
        )}
        {/* Elimination flash */}
        {elimFlash && (
          <div style={{ fontSize: 10, fontWeight: 800, color: '#ef5350', animation: 'pulse 0.5s ease-in-out' }}>
            ▼ OUT
          </div>
        )}
      </div>

      {/* Bubble warning banner */}
      {bubblePlayer && (
        <div style={{
          marginTop: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800,
          background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.5)',
          color: '#fbbf24', textAlign: 'center',
        }}>
          ▲ BUBBLE — {remaining} players left, {paidPlaces} paid
        </div>
      )}

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            style={{
              background: 'rgba(24,25,26,0.97)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '12px 14px', overflow: 'hidden',
              backdropFilter: 'blur(10px)', minWidth: 220,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
              <div>
                <span style={{ color: '#B0B3B8' }}>Players: </span>
                <strong style={{ color: elimFlash ? '#ef5350' : '#fff' }}>
                  {state.playersRemaining}/{state.totalEntries}
                </strong>
              </div>
              <div><span style={{ color: '#B0B3B8' }}>Avg Stack: </span><strong style={{ color: '#fff' }}>{(state.averageStack || 0).toLocaleString()}</strong></div>
              <div><span style={{ color: '#B0B3B8' }}>Prize Pool: </span><strong style={{ color: '#FFD700' }}>{(state.prizePool || 0).toLocaleString()}</strong></div>
              <div><span style={{ color: '#B0B3B8' }}>Tables: </span><strong style={{ color: '#fff' }}>{state.tablesActive || 0}</strong></div>

              {/* ITM / paid places */}
              {paidPlaces > 0 && (
                <div style={{ gridColumn: '1/3' }}>
                  <span style={{ color: '#B0B3B8' }}>Paid: </span>
                  <strong style={{ color: isITM ? '#4caf50' : '#B0B3B8' }}>
                    Top {paidPlaces} {isITM ? '✓ You\'re in the money!' : `(${remaining - paidPlaces} eliminations to go)`}
                  </strong>
                </div>
              )}

              {/* Next blinds */}
              {state.nextBlinds && (
                <div style={{ gridColumn: '1/3' }}>
                  <span style={{ color: '#B0B3B8' }}>Next Level: </span>
                  <strong style={{ color: '#81C784' }}>
                    {state.nextBlinds.smallBlind}/{state.nextBlinds.bigBlind}
                    {state.nextBlinds.ante > 0 ? ` (A:${state.nextBlinds.ante})` : ''}
                  </strong>
                </div>
              )}

              {/* Blind schedule — next 3 levels */}
              {state.blindSchedule && state.blindSchedule.length > 0 && (
                <div style={{ gridColumn: '1/3', marginTop: 6 }}>
                  <div style={{ color: '#B0B3B8', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Upcoming Levels</div>
                  {state.blindSchedule.slice(0, 3).map((lvl, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', fontSize: 11,
                      padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                      color: i === 0 ? '#4ECDC4' : '#B0B3B8',
                    }}>
                      <span>Lvl {(state.currentLevel || 0) + i + 1}</span>
                      <span>{lvl.smallBlind}/{lvl.bigBlind}{lvl.ante > 0 ? ` A:${lvl.ante}` : ''}</span>
                      {lvl.duration && <span>{Math.floor(lvl.duration / 60)}m</span>}
                    </div>
                  ))}
                </div>
              )}

              {state.lateRegOpen && (
                <div style={{ gridColumn: '1/3', color: '#4ECDC4', fontWeight: 700 }}>
                  Late Registration Open
                </div>
              )}
            </div>

            {/* Rebuy/Addon buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {state.rebuyEndLevel && state.currentLevel <= state.rebuyEndLevel && (
                <button onClick={async () => {
                  const res = await fetch('/api/poker/engine/tournament', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'rebuy', tournamentId }),
                  });
                  const d = await res.json();
                  if (!d.success) alert(d.error || 'Rebuy failed');
                }} style={{
                  flex: 1, padding: '6px 10px', background: 'rgba(35,116,225,0.2)', color: '#4FC3F7',
                  border: '1px solid rgba(35,116,225,0.4)', borderRadius: 6, fontSize: 11,
                  fontWeight: 700, cursor: 'pointer',
                }}>Rebuy</button>
              )}
              {state.addonAtBreak && state.status === 'break' && (
                <button onClick={async () => {
                  const res = await fetch('/api/poker/engine/tournament', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'addon', tournamentId }),
                  });
                  const d = await res.json();
                  if (!d.success) alert(d.error || 'Add-on failed');
                }} style={{
                  flex: 1, padding: '6px 10px', background: 'rgba(76,175,80,0.2)', color: '#81C784',
                  border: '1px solid rgba(76,175,80,0.4)', borderRadius: 6, fontSize: 11,
                  fontWeight: 700, cursor: 'pointer',
                }}>Add-on</button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// THEME PRESET BAR — Save/Load named theme combinations
// ═══════════════════════════════════════════════════════════════════════════

function ThemePresetBar({ onSave, onLoad, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [presets, setPresets] = useState([]);

  useEffect(() => {
    const read = () => {
      try { setPresets(JSON.parse(localStorage.getItem('poker-theme-presets') || '[]')); } catch (_) { setPresets([]); }
    };
    read();
    const unsub = eventBus.on('DATA_MUTATED', (d) => {
      if (typeof d === 'string' && d.includes('theme_preset')) read();
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  return (
    <div style={{
      position: 'absolute', bottom: 44, right: 10, zIndex: 30,
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'rgba(0,0,0,0.6)', color: T.textSecondary,
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
          padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontWeight: 600,
        }}
      >
        Presets {expanded ? '▾' : '▸'}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            style={{
              marginTop: 4, background: 'rgba(10,15,25,0.92)',
              backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: 8, minWidth: 160,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <button
              onClick={onSave}
              style={{
                width: '100%', background: `${T.accent}20`, border: `1px solid ${T.accent}40`,
                borderRadius: 6, color: T.accent, padding: '5px 0', fontSize: 10,
                fontWeight: 700, cursor: 'pointer', marginBottom: 6,
              }}
            >Save Current</button>

            {presets.length === 0 ? (
              <div style={{ fontSize: 9, color: T.textMuted, textAlign: 'center', padding: 8 }}>
                No presets saved yet
              </div>
            ) : (
              <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {presets.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 8px',
                  }}>
                    <button
                      onClick={() => onLoad(p)}
                      style={{
                        flex: 1, background: 'none', border: 'none', color: T.textPrimary,
                        fontSize: 10, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                      }}
                    >{p.name}</button>
                    <button
                      onClick={() => { onDelete(i); setPresets(prev => prev.filter((_, idx) => idx !== i)); }}
                      style={{
                        background: 'none', border: 'none', color: '#ef4444',
                        fontSize: 10, cursor: 'pointer', padding: '0 2px', opacity: 0.6,
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND HISTORY BROWSER — Fetch and display past hands
// ═══════════════════════════════════════════════════════════════════════════

function HandHistoryBrowser({ tableId, userId, onClose }) {
  const [hands, setHands] = useState([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchHands = useCallback(async (p) => {
    try {
      setLoading(true);
      const { data: { session } } = await getSupabase().auth.getSession();
      const res = await fetch(`/api/poker/engine/hand-history?tableId=${tableId}&page=${p}&limit=10`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setHands(json.hands || []);
        setTotal(json.total || 0);
        setPage(json.page || 0);
      }
    } catch (err) { console.warn('Error fetching hand history:', err); }
    finally { setLoading(false); }
  }, [tableId]);

  useEffect(() => { fetchHands(0); }, [fetchHands]);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 8, 15, 0.95)', backdropFilter: 'blur(10px)',
      zIndex: 50, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
        background: 'linear-gradient(to bottom, rgba(30,41,59,0.5), transparent)',
      }}>
        <h2 style={{ margin: 0, fontSize: 18, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: T.accent }}></span> Hand History
        </h2>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: T.textMuted, fontSize: 24, cursor: 'pointer',
        }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: T.textMuted, marginTop: 40 }}>Loading hands...</div>
        ) : hands.length === 0 ? (
          <div style={{ textAlign: 'center', color: T.textMuted, marginTop: 40 }}>No hands found in this session.</div>
        ) : (
          hands.map((h, i) => <HandHistoryRow key={h.id || i} hand={h} userId={userId} />)
        )}
      </div>

      <div style={{
        padding: 16, borderTop: `1px solid ${T.border}`, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <button
          onClick={() => fetchHands(page - 1)} disabled={page === 0 || loading}
          style={{
            padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: page === 0 ? T.textMuted : T.textPrimary, cursor: page === 0 ? 'not-allowed' : 'pointer',
          }}
        >◀ Prev</button>
        <span style={{ color: T.textMuted, fontSize: 13 }}>Page {page + 1} of {Math.max(1, Math.ceil(total / 10))}</span>
        <button
          onClick={() => fetchHands(page + 1)} disabled={(page + 1) * 10 >= total || loading}
          style={{
            padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: (page + 1) * 10 >= total ? T.textMuted : T.textPrimary, cursor: (page + 1) * 10 >= total ? 'not-allowed' : 'pointer',
          }}
        >Next ▶</button>
      </div>
    </div>
  );
}

function HandHistoryRow({ hand, userId }) {
  const data = hand.hand_data || {};
  const players = data.players || [];
  const myPlayer = players.find(p => String(p.id) === String(userId) || String(p.playerId) === String(userId));
  
  // Calculate P&L for hero
  const startStack = myPlayer?.initialStack || 0;
  const endStack = myPlayer?.stack || 0;
  const pnl = endStack - startStack;
  const pnlColor = pnl > 0 ? '#4caf50' : pnl < 0 ? '#ef5350' : T.textMuted;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 60 }}>
        <span style={{ fontSize: 10, color: T.textMuted }}>Hand #{data.handNumber || '?'}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>Pot: {data.potTotal?.toLocaleString() || '?'}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.communityCards?.length > 0 && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: T.textMuted, width: 40 }}>Board:</span>
            {data.communityCards.map((c, i) => <CardImg key={i} card={c} width={24} />)}
          </div>
        )}
        {myPlayer?.holeCards && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: T.textMuted, width: 40 }}>Hero:</span>
            {myPlayer.holeCards.map((c, i) => <CardImg key={i} card={c} width={24} />)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 80 }}>
        <span style={{ fontSize: 10, color: T.textMuted }}>Result</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: pnlColor }}>
          {pnl > 0 ? '+' : ''}{pnl.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════

function SessionStatsOverlay({ sessionStats, myStack, onClose }) {
  if (!sessionStats || !sessionStats.initialBuyIn) return null;

  const pnl = myStack - sessionStats.initialBuyIn - (sessionStats.totalAdded || 0);
  const hrs = sessionStats.sessionStart ? ((Date.now() - sessionStats.sessionStart) / 3600000) : 0;
  const handsPerHour = hrs > 0 ? Math.round((sessionStats.handsPlayed || 0) / hrs) : 0;
  const vpip = sessionStats.handsPlayed > 0 ? ((sessionStats.vpipCount || 0) / sessionStats.handsPlayed * 100).toFixed(0) : '0';
  const pfr = sessionStats.handsPlayed > 0 ? ((sessionStats.pfrCount || 0) / sessionStats.handsPlayed * 100).toFixed(0) : '0';

  // Mini sparkline from P&L history
  const pnlHistory = sessionStats.pnlHistory || [];
  const sparklinePoints = pnlHistory.length > 1 ? (() => {
    const min = Math.min(...pnlHistory);
    const max = Math.max(...pnlHistory);
    const range = max - min || 1;
    const w = 120;
    const h = 28;
    return pnlHistory.map((v, i) => {
      const x = (i / (pnlHistory.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    }).join(' ');
  })() : null;

  const pnlColor = pnl > 0 ? '#4caf50' : pnl < 0 ? '#ef5350' : '#888';

  const StatBox = ({ label, value, color = '#E4E6EB' }) => (
    <div style={{ textAlign: 'center', minWidth: 55 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 600, color: '#65676B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      style={{
        position: 'absolute', top: 60, left: 8, right: 8,
        background: 'rgba(0,0,0,0.92)', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '14px 16px', zIndex: 35,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 700 }}>Session Stats</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#65676B', fontSize: 18,
          cursor: 'pointer', padding: '0 4px', lineHeight: 1,
        }}>×</button>
      </div>

      {/* Stat grid */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 12 }}>
        <StatBox label="P&L" value={`${pnl >= 0 ? '+' : ''}${pnl.toLocaleString()}`} color={pnlColor} />
        <StatBox label="Hands" value={sessionStats.handsPlayed || 0} />
        <StatBox label="VPIP" value={`${vpip}%`} color={parseInt(vpip) > 40 ? '#f59e0b' : '#4caf50'} />
        <StatBox label="PFR" value={`${pfr}%`} color={parseInt(pfr) > 30 ? '#f59e0b' : '#3b82f6'} />
        <StatBox label="H/Hr" value={handsPerHour} />
      </div>

      {/* Sparkline P&L over time */}
      {sparklinePoints && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#65676B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Session P&L Trend</div>
          <svg width="100%" height="32" viewBox="0 0 120 28" preserveAspectRatio="none" style={{ borderRadius: 4 }}>
            <rect width="120" height="28" fill="rgba(255,255,255,0.03)" rx="2" />
            {/* Zero line */}
            {pnlHistory.some(v => v >= 0) && pnlHistory.some(v => v < 0) && (
              <line x1="0" y1="14" x2="120" y2="14" stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" />
            )}
            <polyline
              points={sparklinePoints}
              fill="none"
              stroke={pnlColor}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      {/* Footer stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#65676B' }}>
        <span>Buy-in: {sessionStats.initialBuyIn?.toLocaleString()}{sessionStats.totalAdded > 0 ? ` +${sessionStats.totalAdded.toLocaleString()}` : ''}</span>
        <span>{hrs.toFixed(1)} hours</span>
        {sessionStats.biggestPot > 0 && <span>Max Pot: {sessionStats.biggestPot.toLocaleString()}</span>}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE INFO BAR
// ═══════════════════════════════════════════════════════════════════════════

function TableInfoBar({ tableState, onSitOut, onSitIn, onStandUp, onAddChips, isSitting, isSittingOut, straddleEnabled, straddleOn, onToggleStraddle, autoTopUpOn, onToggleAutoTopUp, autoMuckOn, onToggleAutoMuck, lastHandResult, onShowLastHand, onShowHistory, sessionStats, myStack, sitOutNextBB, onToggleSitOutNextBB, showStackInBB, onToggleBBDisplay, cardSortMode, onCycleCardSort, hapticEnabled, onToggleHaptic, showHUD, onToggleHUD, fourColorDeck, onToggleFourColor, onShowLeaderboard, rabbitHuntEnabled, onToggleRabbitHunt, onShowKeyboard, onShowLayouts, stackHistory, onShowActionLog, onShowStackGraph, onShowTableStats, onShowFelt }) {
  const [showStats, setShowStats] = useState(false);
  if (!tableState) return null;

  const { game } = tableState;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        zIndex: 30,
      }}
    >
      {/* Row 1 — Table info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', flexWrap: 'wrap' }}>
        <span style={{ color: T.accent, fontWeight: 800, fontSize: 13, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tableState?.config?.tableName || tableState.tableId?.slice(0, 8)}
        </span>
        {/* Tournament badge */}
        {tableState?.config?.isTournament && (
          <span style={{
            color: '#fbbf24', fontSize: 10, fontWeight: 700,
            padding: '1px 6px', borderRadius: 4,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.3)',
            maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tableState.config.tournamentName || 'Tournament'}
          </span>
        )}
        <span style={{
          color: '#fff', fontSize: 10, fontWeight: 700,
          padding: '1px 6px', borderRadius: 4,
          background: ({
            holdem: '#22c55e', omaha4: '#f59e0b', omaha5: '#e67e22',
            omaha6: '#e74c3c', omaha_hilo: '#ef4444', short_deck: '#8b5cf6',
            pineapple: '#eab308', flo: '#14b8a6', mixed: '#f59e0b',
          })[tableState?.config?.variant] || '#22c55e',
        }}>
          {({
            holdem: 'NLH', omaha4: 'PLO4', omaha5: 'PLO5', omaha6: 'PLO6',
            omaha_hilo: 'PLO8', short_deck: '6+',
            pineapple: 'PINE', flo: 'FLO', mixed: 'MIX',
          })[tableState?.config?.variant] || 'NLH'}
        </span>
        <span style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600 }}>
          {tableState?.config?.smallBlind || 1}/{tableState?.config?.bigBlind || 2}
        </span>
        <span style={{ color: T.textMuted, fontSize: 10, fontFamily: 'monospace' }}>
          {game?.handNumber ? `#${game.handNumber}` : ''}
        </span>
        <span style={{
          color: game?.phase === 'idle' ? T.textMuted : T.callGreen,
          fontSize: 10, padding: '1px 5px', borderRadius: 4,
          background: 'rgba(255,255,255,0.05)',
        }}>
          {game?.phase?.toUpperCase() || 'WAITING'}
        </span>

        {/* Session P&L — inline on same row */}
        {isSitting && sessionStats?.initialBuyIn > 0 && (() => {
          const pnl = myStack - sessionStats.initialBuyIn - (sessionStats.totalAdded || 0);
          const color = pnl > 0 ? '#4caf50' : pnl < 0 ? '#ef5350' : T.textMuted;
          const hrs = sessionStats.sessionStart ? ((Date.now() - sessionStats.sessionStart) / 3600000).toFixed(1) : '0';
          return (
            <span style={{ color, fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginLeft: 'auto' }}>
              {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()} • {sessionStats.handsPlayed} hands • {hrs}hr
            </span>
          );
        })()}
      </div>

      {/* Row 2 — Action buttons (only when seated) */}
      {isSitting && (
        <div style={{ display: 'flex', gap: 5, padding: '3px 12px 6px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <SmallButton
            label={isSittingOut ? 'Sit In' : 'Sit Out'}
            onClick={isSittingOut ? onSitIn : onSitOut}
          />
          {!isSittingOut && (
            <SmallButton
              label={sitOutNextBB ? '✓ Out@BB' : 'Out@BB'}
              onClick={onToggleSitOutNextBB}
              color={sitOutNextBB ? '#F5A623' : undefined}
            />
          )}
          {straddleEnabled && (
            <SmallButton
              label={straddleOn ? '✓ Straddle' : 'Straddle'}
              onClick={onToggleStraddle}
              color={straddleOn ? '#4ECDC4' : undefined}
            />
          )}
          <SmallButton label="Add Chips" onClick={onAddChips} />
          {lastHandResult && <SmallButton label="Last Hand" onClick={onShowLastHand} />}
          {onShowHistory && <SmallButton label="History" onClick={onShowHistory} />}
          {onShowActionLog && <SmallButton label="Log" onClick={onShowActionLog} />}
          {onShowStackGraph && <SmallButton label="Stack" onClick={onShowStackGraph} />}
          {onShowTableStats && <SmallButton label="Stats" onClick={onShowTableStats} />}
          <SmallButton
            label={autoTopUpOn ? 'Auto Top-Up ✓' : 'Auto-Chip'}
            onClick={onToggleAutoTopUp}
            color={autoTopUpOn ? '#34C759' : undefined}
          />
          <SmallButton
            label={autoMuckOn ? '✓ Muck' : 'Muck'}
            onClick={onToggleAutoMuck}
            color={autoMuckOn ? '#8b5cf6' : undefined}
          />
          {sessionStats?.initialBuyIn > 0 && (
            <SmallButton
              label={showStats ? '✓ Stats' : ''}
              onClick={() => setShowStats(!showStats)}
              color={showStats ? '#3b82f6' : undefined}
            />
          )}
          <SmallButton label="Leave" onClick={onStandUp} color={T.foldRed} />
          <SmallButton
            label={showStackInBB ? '✓ BB' : 'BB'}
            onClick={onToggleBBDisplay}
            color={showStackInBB ? '#60a5fa' : undefined}
          />
          <SmallButton
            label={`Sort:${({ dealt: 'Off', rank: 'Rank', suit: 'Suit' })[cardSortMode] || 'Off'}`}
            onClick={onCycleCardSort}
            color={cardSortMode !== 'dealt' ? '#c084fc' : undefined}
          />
          <SmallButton
            label={hapticEnabled ? '✓ Haptic' : 'Haptic'}
            onClick={onToggleHaptic}
            color={hapticEnabled ? '#f472b6' : undefined}
          />
          <SmallButton
            label={showHUD ? '✓ HUD' : 'HUD'}
            onClick={onToggleHUD}
            color={showHUD ? '#22d3ee' : undefined}
          />
          <SmallButton
            label={fourColorDeck ? '✓ 4-Color' : '4-Color'}
            onClick={onToggleFourColor}
            color={fourColorDeck ? '#34d399' : undefined}
          />
          <SmallButton
            label='Board'
            onClick={onShowLeaderboard}
          />
          <SmallButton
            label={rabbitHuntEnabled ? '✓' : ''}
            onClick={onToggleRabbitHunt}
            color={rabbitHuntEnabled ? '#fbbf24' : undefined}
          />
          <SmallButton label='' onClick={onShowKeyboard} />
          <SmallButton label='Layout' onClick={onShowLayouts} />
          <SmallButton label='Felt' onClick={onShowFelt} />
          {stackHistory?.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 4 }}>
              <SessionSparkline history={stackHistory} width={60} height={20} />
            </div>
          )}
        </div>
      )}

      {/* Session Stats Overlay — expandable panel */}
      <AnimatePresence>
        {showStats && isSitting && sessionStats && (
          <SessionStatsOverlay
            sessionStats={sessionStats}
            myStack={myStack}
            onClose={() => setShowStats(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SmallButton({ label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color ? `${color}20` : 'rgba(255,255,255,0.05)',
        color: color || T.textSecondary,
        border: `1px solid ${color ? `${color}40` : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 6,
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT OVERLAY (showdown / hand complete)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// RUN IT OFFER OVERLAY — Consent dialog for run-it-twice/thrice
// ═══════════════════════════════════════════════════════
// RunItOfferOverlay — removed; replaced by inline isRitOfferActive block below

// ═══════════════════════════════════════════════════════════════════════════
// GTO SPOT-CHECK BADGE — Post-showdown play quality indicator
// ═══════════════════════════════════════════════════════════════════════════

function GTOCheckBadge({ result, heroAction, visible }) {
  const [showDetail, setShowDetail] = useState(false);

  if (!visible || !result || !heroAction) return null;

  // Heuristic GTO evaluation based on hero's action context
  const evaluate = () => {
    const { action, potOdds, handStrength, phase } = heroAction;

    // Simple heuristic: compare action vs. expected play
    if (!action) return { grade: 'neutral', label: '—', color: '#888', tip: 'No action recorded' };

    // Fold with strong hand = major deviation
    if (action === 'fold' && handStrength > 60) {
      return { grade: 'deviation', label: '✕ Major Deviation', color: '#ef5350', tip: 'Folded a strong hand. GTO suggests continuing with equity advantage.' };
    }
    // Call with weak hand and bad pot odds = leak
    if (action === 'call' && handStrength < 25 && potOdds > 30) {
      return { grade: 'leak', label: '▲ Slight Leak', color: '#f59e0b', tip: 'Called with insufficient equity. Required better pot odds or a stronger draw.' };
    }
    // Raise with premium = optimal
    if ((action === 'raise' || action === 'bet') && handStrength > 70) {
      return { grade: 'optimal', label: '✓ Optimal', color: '#4caf50', tip: 'Value bet with strong hand — well played.' };
    }
    // Fold with weak hand = optimal
    if (action === 'fold' && handStrength < 20) {
      return { grade: 'optimal', label: '✓ Optimal', color: '#4caf50', tip: 'Good fold — limited equity vs. opponent range.' };
    }
    // Default: slight leak for passive play
    if (action === 'check' && handStrength > 50 && phase === 'river') {
      return { grade: 'leak', label: '▲ Slight Leak', color: '#f59e0b', tip: 'Missed value bet on the river with a strong hand.' };
    }
    // Neutral/acceptable
    return { grade: 'neutral', label: '✓ Acceptable', color: '#4caf50', tip: 'Play was within acceptable GTO range.' };
  };

  const { label, color, tip } = evaluate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.5, duration: 0.4 }}
      style={{ marginTop: 8, textAlign: 'center' }}
    >
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
        style={{
          background: `${color}20`,
          border: `1px solid ${color}50`,
          borderRadius: 20,
          padding: '4px 14px',
          color,
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {label}
      </motion.button>

      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              marginTop: 6,
              padding: '6px 12px',
              background: 'rgba(0,0,0,0.6)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 10,
              color: '#B0B3B8',
              lineHeight: 1.5,
              maxWidth: 220,
              margin: '6px auto 0',
            }}
          >
            {tip}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHIP FLY ANIMATION — chips fly from pot center to winner seat
// ═══════════════════════════════════════════════════════════════════════════

function ChipFlyAnimation({ winners, seatPositions, seats }) {
  const [chips, setChips] = useState([]);
  const [splashes, setSplashes] = useState([]);
  const [amountLabels, setAmountLabels] = useState([]);

  useEffect(() => {
    if (!winners?.length || !seatPositions || !seats) return;

    // E8: Fire chip-clinking sound
    try { eventBus.emit('SOUND_PLAY', { id: 'chip_stack' }); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    const newChips = [];
    const chipPalettes = [
      ['#FFD700', '#FF6B35', '#FFC107'], // Gold stack
      ['#1e88e5', '#42a5f5', '#64b5f6'], // Blue stack
      ['#43a047', '#66bb6a', '#81c784'], // Green stack
      ['#9c27b0', '#ab47bc', '#ce93d8'], // Purple stack
    ];

    winners.forEach((w, wi) => {
      const seat = seats.find(s => s.player && String(s.player.id) === String(w.playerId));
      if (!seat) return;
      const pos = seatPositions[seat.seatIndex];
      if (!pos) return;

      // 3-6 stacked chip tokens per winner (scaled by pot size)
      const count = Math.min(Math.max(2, Math.ceil((w.amount || 0) / 300)), 6);
      const palette = chipPalettes[wi % chipPalettes.length];
      for (let i = 0; i < count; i++) {
        newChips.push({
          id: `chip-${wi}-${i}`,
          targetX: pos.x,
          targetY: pos.y,
          palette,
          delay: 0.2 + wi * 0.12 + i * 0.06,
          winnerIndex: wi,
        });
      }
    });

    setChips(newChips);

    // E4: Show floating amount labels after chips arrive
    const labelTimer = setTimeout(() => {
      const labels = winners.map((w, wi) => {
        const seat = seats.find(s => s.player && String(s.player.id) === String(w.playerId));
        const pos = seat ? seatPositions[seat.seatIndex] : null;
        return pos ? { id: `label-${wi}`, x: pos.x, y: pos.y, amount: w.amount || 0 } : null;
      }).filter(Boolean);
      setAmountLabels(labels);
    }, 800);

    // Show splash after chips arrive
    const splashTimer = setTimeout(() => {
      const newSplashes = winners.map((w, wi) => {
        const seat = seats.find(s => s.player && String(s.player.id) === String(w.playerId));
        const pos = seat ? seatPositions[seat.seatIndex] : null;
        return pos ? { id: `splash-${wi}`, x: pos.x, y: pos.y } : null;
      }).filter(Boolean);
      setSplashes(newSplashes);
    }, 900);
    const clearTimer = setTimeout(() => { setChips([]); setSplashes([]); setAmountLabels([]); }, 3000);
    return () => { clearTimeout(labelTimer); clearTimeout(splashTimer); clearTimeout(clearTimer); };
  }, [winners, seatPositions, seats]);

  if (!chips.length && !splashes.length && !amountLabels.length) return null;

  return (
    <>
      {chips.map(chip => (
        <motion.div
          key={chip.id}
          initial={{
            left: '50%', top: '28%',
            scale: 1, opacity: 1,
            x: '-50%', y: '-50%',
          }}
          animate={{
            left: `${chip.targetX}%`,
            top: `${chip.targetY}%`,
            scale: [1, 1.2, 0.9],
            opacity: [1, 1, 0.6],
          }}
          transition={{
            duration: 0.7,
            delay: chip.delay,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          style={{
            position: 'absolute',
            width: 24, height: 24,
            zIndex: 80, pointerEvents: 'none',
          }}
        >
          {/* Stacked 3-chip token */}
          {chip.palette.map((color, ci) => (
            <div
              key={ci}
              style={{
                position: 'absolute',
                top: ci * -3, left: ci * 1,
                width: 18, height: 18, borderRadius: '50%',
                background: `radial-gradient(circle at 35% 35%, ${color}dd, ${color})`,
                border: '1.5px solid rgba(255,255,255,0.5)',
                boxShadow: `0 0 ${6 + ci * 3}px ${color}60`,
              }}
            />
          ))}
        </motion.div>
      ))}
      {/* E4: Floating amount labels */}
      <AnimatePresence>
        {amountLabels.map(lbl => (
          <motion.div
            key={lbl.id}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -28 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: `${lbl.x}%`, top: `${lbl.y}%`,
              transform: 'translateX(-50%)',
              fontSize: 14, fontWeight: 900, zIndex: 82, pointerEvents: 'none',
              color: '#FFD700',
              textShadow: '0 0 8px rgba(255,215,0,0.6), 0 2px 4px rgba(0,0,0,0.8)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            +{lbl.amount.toLocaleString()}
          </motion.div>
        ))}
      </AnimatePresence>
      {/* Splash glow burst at winner seats */}
      <AnimatePresence>
        {splashes.map(s => (
          <motion.div
            key={s.id}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: `${s.x}%`, top: `${s.y}%`,
              width: 30, height: 30, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,215,0,0.5) 0%, transparent 70%)',
              transform: 'translate(-50%, -50%)',
              zIndex: 79, pointerEvents: 'none',
            }}
          />
        ))}
      </AnimatePresence>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT OVERLAY (showdown / hand complete) + RABBIT HUNT
// ═══════════════════════════════════════════════════════════════════════════

function ResultOverlay({ result, send, userId }) {
  const [showRabbit, setShowRabbit] = useState(false);
  const [cardsShown, setCardsShown] = useState(false);
  const [onDemandRabbit, setOnDemandRabbit] = useState(null);
  const [rabbitLoading, setRabbitLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setShowRabbit(false); setCardsShown(false); setOnDemandRabbit(null); setRabbitLoading(false); setCopied(false); }, [result]);

  if (!result) return null;

  const isFoldWin = result.type === 'fold' || result.result?.type === 'fold';
  const rabbitCards = result.rabbitCards || result.result?.rabbitCards;
  const boardAtEnd = result.boardAtEnd || result.result?.boardAtEnd || [];
  const isWinner = isFoldWin && result.winners?.some(w => String(w.playerId) === String(userId));

  // Format hand for sharing
  const formatHandForShare = () => {
    const lines = ['♠ Smarter.Poker Hand Result'];
    const winners = result.winners || result.result?.winners || [];
    const board = result.board || result.result?.board || result.communityCards || boardAtEnd || [];
    const type = result.type || result.result?.type || 'showdown';

    if (type === 'fold') {
      lines.push('Result: Fold Win');
    } else {
      lines.push('Result: Showdown');
    }

    if (board.length > 0) {
      lines.push(`Board: ${board.join(' ')}`);
    }

    winners.forEach(w => {
      const name = w.displayName || w.playerName || `Player`;
      const amt = w.amount ? ` (+${w.amount})` : '';
      const hand = w.handDescription || '';
      lines.push(`★ ${name}${amt}${hand ? ` — ${hand}` : ''}`);
    });

    if (result.rake) lines.push(`Rake: ${result.rake}`);
    lines.push('');
    lines.push('Play at smarter.poker');
    return lines.join('\n');
  };

  const handleShare = async () => {
    const text = formatHandForShare();
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Poker Hand', text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(0,0,0,0.85)',
        border: `2px solid ${T.accent}`,
        borderRadius: 16,
        padding: '16px 32px',
        zIndex: 50,
        textAlign: 'center',
        minWidth: 200,
      }}
    >
      {result.winners?.map((w, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ color: T.accent, fontSize: 16, fontWeight: 800 }}>
            {w.displayName || w.playerId} wins {w.amount?.toLocaleString()}
          </div>
          {w.handDescription && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #FFD700, #f59e0b)',
                color: '#000',
                fontSize: 11,
                fontWeight: 900,
                padding: '3px 12px',
                borderRadius: 20,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                boxShadow: '0 0 12px rgba(255,215,0,0.4), 0 2px 6px rgba(0,0,0,0.3)',
                marginTop: 4,
              }}
            >
              {w.handDescription}
            </motion.div>
          )}
        </div>
      ))}

      {/* Rabbit Hunt — on fold wins with remaining cards from engine */}
      {isFoldWin && rabbitCards && rabbitCards.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {!showRabbit ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => { e.stopPropagation(); setShowRabbit(true); }}
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 20,
                padding: '6px 16px',
                color: '#B0B3B8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}></span>
              Rabbit Hunt
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.3 }}
            >
              <div style={{
                fontSize: 10, color: '#65676B', marginBottom: 6,
                textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
              }}>
                Would have been dealt
              </div>

              {/* Show existing board + rabbit cards */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                {/* Existing board cards (dimmed) */}
                {boardAtEnd.map((card, i) => (
                  <div key={`board-${i}`} style={{ opacity: 0.45 }}>
                    <CardImg card={card} width={38} delay={0} fourColorDeck={fourColorDeck} />
                  </div>
                ))}

                {/* Rabbit cards (bright, animated reveal) */}
                {rabbitCards.map((card, i) => (
                  <motion.div
                    key={`rabbit-${i}`}
                    initial={{ rotateY: 180, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.15 + i * 0.2 }}
                    style={{
                      filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.4))',
                      border: '1px solid rgba(255,215,0,0.3)',
                      borderRadius: 4,
                    }}
                  >
                    <CardImg card={card} width={38} delay={0.15 + i * 0.2} fourColorDeck={fourColorDeck} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Rabbit Hunt — ON-DEMAND REQUEST when engine didn't send cards */}
      {isFoldWin && (!rabbitCards || rabbitCards.length === 0) && send && !onDemandRabbit && (
        <div style={{ marginTop: 10 }}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={rabbitLoading}
            onClick={async (e) => {
              e.stopPropagation();
              setRabbitLoading(true);
              try {
                const resp = await send('request_rabbit', {});
                if (resp?.success && resp.rabbitCards?.length > 0) {
                  setOnDemandRabbit({ cards: resp.rabbitCards, board: resp.boardAtEnd || boardAtEnd });
                } else {
                  // No rabbit cards available
                  setOnDemandRabbit({ cards: [], board: boardAtEnd });
                }
              } catch (_) {
                setOnDemandRabbit({ cards: [], board: boardAtEnd });
              }
              setRabbitLoading(false);
            }}
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.08))',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: 20,
              padding: '6px 16px',
              color: '#c084fc',
              fontSize: 12,
              fontWeight: 700,
              cursor: rabbitLoading ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              opacity: rabbitLoading ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 16 }}></span>
            {rabbitLoading ? 'Loading...' : 'Request Rabbit Hunt'}
          </motion.button>
        </div>
      )}

      {/* On-demand Rabbit Hunt results */}
      {onDemandRabbit && onDemandRabbit.cards?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.3 }}
          style={{ marginTop: 10 }}
        >
          <div style={{
            fontSize: 10, color: '#65676B', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
          }}>
            Would have been dealt
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
            {(onDemandRabbit.board || []).map((card, i) => (
              <div key={`board-od-${i}`} style={{ opacity: 0.45 }}>
                <CardImg card={card} width={38} delay={0} fourColorDeck={fourColorDeck} />
              </div>
            ))}
            {onDemandRabbit.cards.map((card, i) => (
              <motion.div
                key={`rabbit-od-${i}`}
                initial={{ rotateY: 180, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.2 }}
                style={{
                  filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.4))',
                  border: '1px solid rgba(255,215,0,0.3)',
                  borderRadius: 4,
                }}
              >
                <CardImg card={card} width={38} delay={0.15 + i * 0.2} fourColorDeck={fourColorDeck} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Show Cards — voluntary reveal after fold win */}
      {isWinner && send && !cardsShown && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { send('show_cards', {}); setCardsShown(true); }}
            style={{
              padding: '6px 14px', background: 'rgba(33,150,243,0.3)',
              border: '1px solid #2196F3', borderRadius: 8, color: '#fff',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Show All
          </motion.button>
          {myCards && myCards.length >= 2 && myCards.map((_, idx) => (
            <motion.button
              key={idx}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { send('show_one_card', { cardIndex: idx }); setCardsShown(true); }}
              style={{
                padding: '6px 12px', background: 'rgba(255,152,0,0.2)',
                border: '1px solid #FF9800', borderRadius: 8, color: '#fff',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Show #{idx + 1}
            </motion.button>
          ))}
        </div>
      )}
      {cardsShown && (
        <div style={{ marginTop: 6, color: '#4caf50', fontSize: 11, fontWeight: 600 }}>
          Cards revealed ✓
        </div>
      )}

      {/* Share Hand button */}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleShare}
          style={{
            background: copied ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${copied ? '#4caf50' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 8,
            padding: '5px 14px',
            color: copied ? '#4caf50' : '#B0B3B8',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.2s ease',
          }}
        >
          {copied ? '✓ Copied!' : 'Share Hand'}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: LivePokerTable
// ═══════════════════════════════════════════════════════════════════════════

function LivePokerTable({
  tableId,
  supabase,
  userId,
  displayName = 'Player',
  avatarUrl = null,
  isActive = true,
  onActionRequired = null,
  onActionCleared = null,
  onLeave = null,
  tournamentId = null,
}) {
  // Connection via hook
  const {
    tableState, myCards, legalActions, timerState,
    chatMessages, result, lastHandResult, error, connected, send,
    sessionStats, tableAlert, seatOffer, spinReveal,
  } = useTableConnection({ supabase, tableId, userId });

  // I4: Expose supabase + userId to window for TableLayoutManager
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__SUPABASE_CLIENT = supabase;
      window.__POKER_USER_ID = userId;
    }
  }, [supabase, userId]);

  // P13-1: HUD Messenger State
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [messengerBadgeCount, setMessengerBadgeCount] = useState(0);

  // P13-2 & P13-3: Messenger Event Bus Listeners
  useEffect(() => {
    const unsubMsg = eventBus.on(EventType.MESSAGE_RECEIVED, (e) => {
      // Only increment badge if it's closed
      if (!isMessengerOpen) {
        setMessengerBadgeCount(c => c + 1);
        PokerSoundManager.play('chip_stack'); // Small notification sound
      }
    });

    const unsubCall = eventBus.on(EventType.CALL_STARTED, (e) => {
      // Auto-open messenger on incoming call so user sees the ringing WebRTC modal
      if (!isMessengerOpen) setIsMessengerOpen(true);
      PokerSoundManager.play('deal'); // Alert the user loudly
    });

    return () => {
      unsubMsg();
      unsubCall();
    };
  }, [isMessengerOpen]);

  // Notify parent (MultiTableView) when action state changes
  useEffect(() => {
    if (legalActions && legalActions.length > 0) {
      onActionRequired?.(tableId);
    } else {
      onActionCleared?.(tableId);
    }
  }, [legalActions, tableId, onActionRequired, onActionCleared]);

  // Phase 7: Listen for Global Sit Out All from MultiTableView
  // Wave A/B: Synchronize localized configuration settings across multiple table components
  useEffect(() => {
    const handleGlobalMutate = (payload) => {
      if (payload === 'global_sit_out_all') {
        send('sit_out'); // Trigger the backend action for this specific table
      }
      if (payload === 'global_sit_in_all') {
        send('sit_in');
      }
      if (typeof window !== 'undefined') {
        if (payload === 'bb_display_toggled') {
          setShowStackInBB(localStorage.getItem('poker-stack-bb') === 'true');
        } else if (payload === 'card_sort_changed') {
          setCardSortMode(localStorage.getItem('poker-card-sort') || 'dealt');
        } else if (payload === 'haptic_toggled') {
          setHapticEnabled(localStorage.getItem('poker-haptic') !== 'false');
        } else if (payload === 'hud_toggled') {
          setShowHUD(localStorage.getItem('poker-show-hud') === 'true');
        } else if (payload === 'four_color_deck_toggled') {
          setFourColorDeck(localStorage.getItem('poker-4color-deck') === 'true');
        } else if (payload === 'theme_changed') {
          setThemeId(getStoredThemeId());
        } else if (payload === 'cardback_changed') {
          setCardBack(getStoredCardBack());
        } else if (payload === 'sound_changed') {
          setSoundEnabled(localStorage.getItem('poker-sound-enabled') !== 'false');
        } else if (payload === 'felt_changed') {
          try { setFeltColor(localStorage.getItem('poker-felt-color') || 'classic-green'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
      }
    };
    const unsub = eventBus.on(EventType.DATA_MUTATED, handleGlobalMutate);
    return () => {
      if (typeof unsub === 'function') unsub();
      else eventBus.off(EventType.DATA_MUTATED, handleGlobalMutate);
    };
  }, [send]);

  // Theme system
  const [themeId, setThemeId] = useState(() => getStoredThemeId());
  const handleThemeChange = useCallback((id) => {
    setThemeId(id);
    try { eventBus.emit('DATA_MUTATED', 'theme_changed'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  const [cardBack, setCardBack] = useState(() => getStoredCardBack());
  const handleCardBackChange = useCallback((path) => {
    setCardBack(path);
    try { eventBus.emit('DATA_MUTATED', 'cardback_changed'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  // Admin role detection
  const [userRole, setUserRole] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  useEffect(() => {
    if (!supabase || !userId || !tableState?.clubId) return;
    supabase.from('club_members').select('role')
      .eq('club_id', tableState.clubId).eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data?.role) setUserRole(data.role); });
  }, [supabase, userId, tableState?.clubId]);
  const isAdmin = ['owner', 'admin', 'manager'].includes(userRole);

  // Update module-level T when theme changes so all sub-components see it
  T = TABLE_THEMES[themeId] || TABLE_THEMES.classicGreen;

  // Sound manager
  const soundRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('poker-sound-enabled') !== 'false'; } catch { return true; }
  });
  const handleToggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      try { eventBus.emit('DATA_MUTATED', 'sound_changed'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      return next;
    });
  }, []);
  const [soundVolume, setSoundVolume] = useState(() => {
    try { return parseFloat(localStorage.getItem('poker-sound-volume') || '0.4'); } catch { return 0.4; }
  });
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  if (!soundRef.current && typeof window !== 'undefined') {
    soundRef.current = new PokerSoundManager();
  }
  // Sync mute + volume state
  // Phase 27 audit: Listen for sound-pack-changed from ThemePicker
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePackChange = (e) => {
      if (soundRef.current && e.detail) soundRef.current.setSoundPack(e.detail);
    };
    window.addEventListener('poker-sound-pack-changed', handlePackChange);
    return () => window.removeEventListener('poker-sound-pack-changed', handlePackChange);
  }, []);

  useEffect(() => {
    if (soundRef.current) { soundRef.current.muted = !soundEnabled; soundRef.current.setVolume(soundVolume); }
    if (typeof window !== 'undefined') {
      localStorage.setItem('poker-sound-enabled', String(soundEnabled));
      localStorage.setItem('poker-sound-volume', String(soundVolume));
    }
  }, [soundEnabled, soundVolume]);

  // J12: Sound preference Supabase sync — save on toggle (skip initial mount to avoid race with J1 load)
  const soundSyncMountedRef = useRef(false);
  useEffect(() => {
    if (!supabase || !userId) return;
    if (!soundSyncMountedRef.current) {
      soundSyncMountedRef.current = true;
      return; // Skip initial mount — only sync on actual user toggle
    }
    // Use UPDATE only (not UPSERT) to avoid overwriting felt_color on the same row
    supabase.from('poker_seat_preferences')
      .update({ sound_enabled: soundEnabled, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('max_seats', 0)
      .then(() => {}).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [soundEnabled, supabase, userId]);

  // Sound triggers based on game events
  const prevPhaseRef = useRef(null);
  const prevResultRef = useRef(null);
  const prevLastActionRef = useRef(null);
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !tableState?.game) return;
    const phase = tableState.game.phase;
    const prev = prevPhaseRef.current;
    if (prev !== phase) {
      if (isActive) {
        if (phase === 'preflop' && prev === 'idle') { sm.play('newHand'); if (hapticEnabled) haptic('medium'); }
        if (phase === 'flop' && prev === 'preflop') { sm.play('deal'); if (hapticEnabled) haptic('light'); }
        if (phase === 'turn' && prev === 'flop') { sm.play('deal'); if (hapticEnabled) haptic('light'); }
        if (phase === 'river' && prev === 'turn') { sm.play('deal'); if (hapticEnabled) haptic('light'); }
        if (phase === 'showdown') sm.play('showdown');
      }
      prevPhaseRef.current = phase;
    }
    // G3: ALL-IN SOUND TRIGGER — compare by serialized key, not object reference
    const lastAction = tableState.game.lastAction;
    const lastActionKey = lastAction ? `${lastAction.type}_${lastAction.ts || lastAction.handId || ''}` : null;
    if (lastActionKey && lastActionKey !== prevLastActionRef.current) {
      prevLastActionRef.current = lastActionKey;
      if (isActive && lastAction.type === 'all_in') {
        sm.play('allIn');
        if (hapticEnabled) haptic('heavy');
      }
    }
  }, [tableState?.game?.phase, tableState?.game?.lastAction, isActive, hapticEnabled]);

  // Sound for results (win/lose)
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !result || result === prevResultRef.current) return;
    prevResultRef.current = result;
    if (isActive) {
      if (result.bbj) { sm.play('bbj'); return; }
      const isWinner = result.winners?.some(w => String(w.playerId) === String(userId));
      sm.play(isWinner ? 'potWon' : 'lose');
    }
  }, [result, userId, isActive]);

  // Sound for your turn
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !legalActions || legalActions.length === 0) return;
    if (isActive) {
      sm.play('yourTurn');
      if (hapticEnabled) haptic('double');
    }
  }, [legalActions, isActive, hapticEnabled]);

  // Sound for timer warning
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !timerState) return;
    if (isActive && timerState.remaining <= 5 && timerState.remaining > 0 && String(timerState.playerId) === String(userId)) {
      sm.play('timer');
    }
  }, [timerState?.remaining, timerState?.playerId, userId, isActive]);

  // UI state
  const [buyInSeat, setBuyInSeat] = useState(null);
  const [showRebuy, setShowRebuy] = useState(false);
  const [rebuyBalance, setRebuyBalance] = useState(null);
  const [rebuyBalanceLoading, setRebuyBalanceLoading] = useState(false);
  const [rebuyError, setRebuyError] = useState(null);
  const [clubChipBalance, setClubChipBalance] = useState(null);

  // Mystery Bounty Reveal State
  const [bountyReveal, setBountyReveal] = useState(null);

  // EventBus Listener for Global Sounds (God-Mode Audio Asset Injection)
  useEffect(() => {
    if (!eventBus) return;
    const handleSoundPlay = (e) => {
      const payload = e?.payload || e;
      if (payload?.id && soundRef.current) {
        soundRef.current.play(payload.id);
      }
    };
    const unsub = eventBus.on('SOUND_PLAY', handleSoundPlay);
    return () => unsub();
  }, []);

  // EventBus Listener for Mystery Bounty Knockouts
  useEffect(() => {
    if (!eventBus) return;
    const handleBountyWon = (e) => {
      // e.payload format: { tableId, playerId, amount, eliminatorName }
      if (e.payload?.tableId === tableId && String(e.payload?.playerId) === String(userId)) {
        setBountyReveal({ amount: e.payload.amount });
      }
    };

    const unsub = eventBus.on('tournament_bounty_won', handleBountyWon);
    return () => unsub();
  }, [tableId, userId]);

  // Auto-open buy-in when waitlist seat is offered + flash notification + E5 countdown
  const [seatOpenFlash, setSeatOpenFlash] = useState(false);
  const [seatCountdown, setSeatCountdown] = useState(0);
  const seatCountdownRef = useRef(null);
  useEffect(() => {
    if (seatOffer && !isSitting && buyInSeat === null) {
      setBuyInSeat(seatOffer.seatIndex);
      setSeatOpenFlash(true);
      setSeatCountdown(15);
      try { soundRef.current?.play('notify'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      // Start countdown
      seatCountdownRef.current = setInterval(() => {
        setSeatCountdown(prev => {
          if (prev <= 1) {
            clearInterval(seatCountdownRef.current);
            setSeatOpenFlash(false);
            setBuyInSeat(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (seatCountdownRef.current) clearInterval(seatCountdownRef.current); };
  }, [seatOffer, isSitting, buyInSeat]);

  // ═══ HAND HISTORY ACCUMULATOR ═══
  const [handHistory, setHandHistory] = useState([]);
  const [showHandHistory, setShowHandHistory] = useState(false);
  const prevHandIdRef = useRef(null);

  // G2: Incoming chat reaction listener from other players
  const prevReactionsLenRef = useRef(0);
  const lastReactTimeRef = useRef(0); // I8: reaction cooldown
  useEffect(() => {
    const reactions = tableState?.chatReactions;
    if (!reactions || !Array.isArray(reactions)) return;
    // Only process NEW reactions (skip already-processed ones)
    const newReactions = reactions.slice(prevReactionsLenRef.current);
    prevReactionsLenRef.current = reactions.length;
    newReactions.forEach(r => {
      if (r.msgIdx != null && r.emoji && String(r.fromId) !== String(userId)) {
        setChatReactions(prev => {
          const msgR = { ...(prev[r.msgIdx] || {}) };
          msgR[r.emoji] = (msgR[r.emoji] || 0) + 1;
          return { ...prev, [r.msgIdx]: msgR };
        });
      }
    });
  }, [tableState?.chatReactions, userId]);

  useEffect(() => {
    if (!result || !result.handId || result.handId === prevHandIdRef.current) return;
    prevHandIdRef.current = result.handId;
    const entry = {
      handId: result.handId,
      ts: Date.now(),
      winners: result.winners || [],
      potTotal: result.potTotal || 0,
      board: result.communityCards || result.board || [],
      heroCards: myCards || [],
      heroAction: result.heroAction || null,
      phase: result.phase || 'showdown',
      bombPot: result.bombPot || false,
      actionLog: actionLog.slice(-10), // G3: last 10 actions for this hand
    };
    setHandHistory(prev => [entry, ...prev].slice(0, 50)); // Keep last 50

    // E1: Persist to server (fire-and-forget)
    try {
      supabase?.auth?.getSession?.().then(({ data }) => {
        const token = data?.session?.access_token;
        if (token) {
          fetch('/api/poker/engine/hand-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ tableId, hand: entry }),
          }).then(() => {
            // G6: Broadcast hand history update so HandHistoryBrowser auto-refreshes
            try { eventBus.emit('DATA_MUTATED', 'hand_history_updated'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, [result, myCards]);

  const [noteTarget, setNoteTarget] = useState(null); // { id, displayName } for notes modal
  const [quickViewTarget, setQuickViewTarget] = useState(null); // { id, displayName, avatarUrl, stack, stats }
  const [noteSyncHash, setNoteSyncHash] = useState(0);

  // Phase 24 Audit Fix: Listen to cross-table player note mutations
  useEffect(() => {
    const unsub = eventBus.on('DATA_MUTATED', (topic) => {
      if (topic === 'player_notes_updated') setNoteSyncHash(h => h + 1);
    });
    return () => { if (unsub) unsub(); };
  }, []);

  // ═══ PHASE 26: SESSION STATS ACCUMULATOR ═══
  const [showStatsPanel, setShowStatsPanel] = useState(false);

  // ═══ WAVE F STATE ═══
  const [actionLog, setActionLog] = useState([]);
  const [showActionLog, setShowActionLog] = useState(false);
  const [showStackGraph, setShowStackGraph] = useState(false);
  const [showTableStats, setShowTableStats] = useState(false);
  const [showRIT, setShowRIT] = useState(false);
  const [chatReactions, setChatReactions] = useState({}); // { [msgIndex]: { emoji: count } }
  const prevActionLogRef = useRef(null);

  // F2: Action Log Accumulator — capture game events
  useEffect(() => {
    const la = tableState?.game?.lastAction;
    if (!la || !la.type) return;
    const key = `${la.type}-${la.playerId || ''}-${la.amount || 0}-${la.timestamp || la.handId || 'na'}`;
    if (prevActionLogRef.current === key) return;
    prevActionLogRef.current = key;

    const seats = tableState?.seats || [];
    const playerSeat = seats.find(s => s.player && String(s.player.id) === String(la.playerId));
    const playerName = playerSeat?.player?.displayName || la.playerName || 'Player';

    const textMap = {
      fold: 'folded', check: 'checked', call: 'called',
      bet: 'bet', raise: 'raised to', all_in: 'ALL IN',
    };

    setActionLog(prev => [
      ...prev.slice(-29),
      { type: la.type, playerName, text: textMap[la.type] || la.type, amount: la.amount || 0, ts: Date.now() },
    ]);

    // I1: Track aggression factor for hero actions
    if (String(la.playerId) === String(userId)) {
      const s = sessionStatsRef.current;
      if (la.type === 'bet' || la.type === 'raise' || la.type === 'all_in') s.aggressionBets += 1;
      if (la.type === 'call') s.aggressionCalls += 1;
    }
  }, [tableState?.game?.lastAction, userId]);

  // F5: RIT prompt handler — show when server sends run_it_twice offer
  useEffect(() => {
    if (tableState?.game?.ritOffer && String(tableState.game.ritOffer.playerId) === String(userId)) {
      setShowRIT(true);
    }
  }, [tableState?.game?.ritOffer, userId]);
  const sessionStatsRef = useRef({
    handsPlayed: 0, handsWon: 0, vpipCount: 0, pfrCount: 0,
    aggressionBets: 0, aggressionCalls: 0, biggestWin: 0, biggestLoss: 0,
    plHistory: [0], positionWins: {}, positionTotal: {}, totalPots: 0,
    sessionStart: Date.now(), startingStack: 0, currentStack: 0,
  });
  const [sessionStatsSnap, setSessionStatsSnap] = useState(() => {
    // G4: Restore session stats from localStorage on reconnect
    if (typeof window === 'undefined') return sessionStatsRef.current;
    try {
      const saved = localStorage.getItem(`poker-session-${tableId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(sessionStatsRef.current, parsed);
        return parsed;
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    return sessionStatsRef.current;
  });

  // Track hands completing for stats
  useEffect(() => {
    if (!result || !mySeat) return;
    const s = sessionStatsRef.current;
    if (s.startingStack === 0 && mySeat.stack > 0) s.startingStack = mySeat.stack;
    s.currentStack = mySeat.stack || 0;
    s.handsPlayed += 1;
    s.totalPots += (result.potTotal || 0);
    const netPL = s.currentStack - s.startingStack;
    s.plHistory = [...s.plHistory, netPL].slice(-50);

    // G1: VPIP — hero vol put money in (call, bet, raise — not check/fold/blind)
    const heroActions = result.heroActions || [];
    const vpipActions = ['call', 'bet', 'raise', 'all_in'];
    if (heroActions.some(a => vpipActions.includes(a.type || a))) s.vpipCount += 1;
    // G1: PFR — hero raised preflop
    const pfActions = (result.preflopActions || []).filter(a => String(a.playerId) === String(userId));
    if (pfActions.some(a => a.type === 'raise' || a.type === 'all_in')) s.pfrCount += 1;

    // Did hero win this hand?
    const heroWon = result?.winners?.some(w => String(w.playerId) === String(userId));
    if (heroWon) {
      s.handsWon += 1;
      const winAmt = result.winners.find(w => String(w.playerId) === String(userId))?.amount || 0;
      if (winAmt > s.biggestWin) s.biggestWin = winAmt;
    } else {
      const lostAmt = result?.invested?.[userId] || 0;
      if (lostAmt > s.biggestLoss) s.biggestLoss = lostAmt;
    }

    // Position tracking
    const pos = mySeat.positionLabel || 'MP';
    s.positionTotal[pos] = (s.positionTotal[pos] || 0) + 1;
    if (heroWon) s.positionWins[pos] = (s.positionWins[pos] || 0) + 1;

    const snap = { ...s };
    setSessionStatsSnap(snap);

    // G4: Save session stats to localStorage for crash recovery
    try { localStorage.setItem(`poker-session-${tableId}`, JSON.stringify(snap)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // I2: Auto-persist to Supabase every 5 hands
    if (s.handsPlayed > 0 && s.handsPlayed % 5 === 0) {
      try {
        supabase?.auth?.getSession?.().then(({ data }) => {
          const token = data?.session?.access_token;
          if (token) {
            fetch('/api/poker/engine/session-stats', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ tableId, clubId: tableState?.clubId, stats: snap }),
            }).then(() => {
              try { eventBus.emit('DATA_MUTATED', 'session_stats_updated'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          }
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }
  }, [result]);

  // I2: beforeunload — persist session stats to localStorage on tab close
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeUnload = () => {
      const snap = sessionStatsRef.current;
      if (snap.handsPlayed > 0) {
        try { localStorage.setItem(`poker-session-${tableId}`, JSON.stringify(snap)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        // Also attempt Supabase save via sendBeacon
        try {
          const payload = JSON.stringify({ tableId, clubId: tableState?.clubId, stats: snap });
          navigator.sendBeacon?.('/api/poker/engine/session-stats', new Blob([payload], { type: 'application/json' }));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tableId]);

  // Phase 4 Audit Fix: Fetch club chip balance continuously for accurate Auto Top-Up and Rebuy limits
  useEffect(() => {
    if (!tableState?.clubId || !userId) {
      setClubChipBalance(null);
      return;
    }
    
    let isMounted = true;
    
    // Initial fetch
    (async () => {
      try {
        const { data } = await supabase
          .from('club_members')
          .select('chip_balance')
          .eq('club_id', tableState.clubId)
          .eq('user_id', userId)
          .maybeSingle();
        if (isMounted) setClubChipBalance(data?.chip_balance || 0);
      } catch (e) {
        console.warn('[LivePokerTable] Failed to fetch chip balance:', e);
        if (isMounted) setClubChipBalance(null);
      }
    })();

    // Realtime Postgres sync for live chip movements
    let channel;
    if (typeof supabase?.channel === 'function') {
      channel = supabase.channel(`live-table-balance-${tableState.clubId}-${userId}`)
        .on('postgres_changes', {
           event: 'UPDATE', 
           schema: 'public', 
           table: 'club_members', 
           filter: `user_id=eq.${userId}`
        }, (payload) => {
           if (payload.new?.club_id === tableState.clubId && isMounted) {
              setClubChipBalance(payload.new.chip_balance || 0);
           }
        }).subscribe();
    }

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    };
  }, [tableState?.clubId, userId, supabase]);

  // Derived state — use String() coercion to match engine convention
  const isSitting = tableState?.seats.some(
    s => s.player?.id != null && String(s.player.id) === String(userId) && s.status !== 'empty'
  );
  const isSittingOut = tableState?.seats.some(
    s => s.player?.id != null && String(s.player.id) === String(userId) && s.status === 'sitting_out'
  );
  const mySeat = tableState?.seats.find(s => s.player?.id != null && String(s.player.id) === String(userId));
  const isMyTurn = tableState?.game?.currentPlayerId != null
    && String(tableState.game.currentPlayerId) === String(userId);
  const maxSeats = tableState?.maxSeats || 9;
  const positions = useMemo(() => getSeatPositions(maxSeats), [maxSeats]);
  const [preAction, setPreAction] = useState(null); // 'fold' | 'check_fold' | 'check' | 'call_any' | null
  const [showLastHand, setShowLastHand] = useState(false);

  // ═══ WAVE F: STATE HOOKS ═══
  const [stackHistory, setStackHistory] = useState([]);
  const [rabbitHuntCards, setRabbitHuntCards] = useState(null);
  const [rabbitHuntEnabled, setRabbitHuntEnabled] = useState(() => {
    try { return localStorage.getItem('poker-rabbit-hunt') !== 'false'; } catch { return true; }
  });
  const [showLayoutManager, setShowLayoutManager] = useState(false);
  const [seatPreference] = useState(() => {
    try { return JSON.parse(localStorage.getItem('poker-seat-prefs') || '{}'); } catch { return {}; }
  });

  // (Pre-action auto-execute handled at L5580+ with full sound/haptic/visual feedback)

  // ═══ WAVE F: RABBIT HUNT TRIGGER ═══
  // When result arrives and hero folded, show remaining community cards
  useEffect(() => {
    if (!result || !rabbitHuntEnabled || !isSitting) return;
    // Check if hero folded this hand
    const heroFolded = result.foldedPlayerIds?.includes(String(userId));
    if (!heroFolded) return;
    // Get the community cards that were dealt
    const board = result.communityCards || result.board || tableState?.game?.communityCards || [];
    // Only show rabbit hunt if hand ended before river (< 5 community cards)
    if (board.length >= 5) return;
    // Generate placeholder remaining cards
    const remaining = Array(5 - board.length).fill('?');
    // If result has full board data (some engines provide this), use real cards
    if (result.fullBoard?.length > board.length) {
      const extras = result.fullBoard.slice(board.length);
      for (let i = 0; i < extras.length && i < remaining.length; i++) remaining[i] = extras[i];
    }
    setRabbitHuntCards(remaining);
  }, [result, rabbitHuntEnabled, isSitting, userId, tableState?.game?.communityCards]);

  // ═══ WAVE F: SEAT PREFERENCE MEMORY ═══
  useEffect(() => {
    if (!mySeat || !maxSeats) return;
    const seatIdx = tableState?.seats?.indexOf(mySeat);
    if (seatIdx == null || seatIdx < 0) return;
    try {
      const prefs = JSON.parse(localStorage.getItem('poker-seat-prefs') || '{}');
      prefs[maxSeats] = seatIdx;
      localStorage.setItem('poker-seat-prefs', JSON.stringify(prefs));
      saveAppSetting('poker_seat_prefs', prefs, 'poker-seat-prefs');
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, [mySeat, maxSeats, tableState?.seats]);

  // ═══ WAVE F: STACK HISTORY TRACKING ═══
  useEffect(() => {
    if (!result || !mySeat?.stack) return;
    setStackHistory(prev => [...prev.slice(-49), mySeat.stack]);
  }, [result, mySeat?.stack]);

  // ═══ WAVE H: STATE HOOKS ═══
  const [feltColor, setFeltColor] = useState(() => {
    try { return localStorage.getItem('poker-felt-color') || 'classic-green'; } catch { return 'classic-green'; }
  });
  const [showFeltPicker, setShowFeltPicker] = useState(false);
  const [winFlyUpAmount, setWinFlyUpAmount] = useState(0);
  const [autoMuckFlash, setAutoMuckFlash] = useState(false);

  // H4: Felt color change handler
  const handleFeltChange = useCallback((feltId) => {
    setFeltColor(feltId);
    try {
      localStorage.setItem('poker-felt-color', feltId);
      saveAppSetting('poker_felt_color', feltId, 'poker-felt-color');
      eventBus.emit('DATA_MUTATED', 'felt_changed');
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    setShowFeltPicker(false);
  }, []);

  // H3: Win Fly-Up trigger — show gold amount when hero wins
  useEffect(() => {
    if (!result?.winners) return;
    const heroWin = result.winners.find(w => String(w.playerId) === String(userId));
    if (heroWin && heroWin.amount > 0) {
      setWinFlyUpAmount(heroWin.amount);
      const t = setTimeout(() => setWinFlyUpAmount(0), 2500);
      return () => clearTimeout(t);
    }
  }, [result, userId]);

  // H8: Auto-muck flash trigger — when hero loses with autoMuck ON
  useEffect(() => {
    if (!result?.winners || !autoMuck) return;
    const heroWon = result.winners.some(w => String(w.playerId) === String(userId));
    if (!heroWon && isSitting && myCards?.length > 0) {
      setAutoMuckFlash(true);
      const t = setTimeout(() => setAutoMuckFlash(false), 1800);
      return () => clearTimeout(t);
    }
  }, [result, userId, autoMuck, isSitting, myCards]);

  // ═══ WAVE I1: SESSION STATS AUTO-SAVE TO SUPABASE ═══
  const sessionRowIdRef = useRef(null);
  const saveSessionToSupabase = useCallback(async () => {
    if (!supabase || !userId || !tableId) return;
    const s = sessionStatsRef.current;
    if (s.handsPlayed === 0) return; // Nothing to save
    const payload = {
      user_id: userId,
      table_id: tableId,
      club_id: tableState?.clubId || null,
      hands_played: s.handsPlayed,
      hands_won: s.handsWon,
      starting_stack: s.startingStack,
      ending_stack: s.currentStack,
      biggest_win: s.biggestWin,
      biggest_loss: s.biggestLoss,
      pl_history: s.plHistory,
      position_wins: s.positionWins,
      position_total: s.positionTotal,
      session_start: new Date(s.sessionStart).toISOString(),
      session_end: new Date().toISOString(),
      // J9: Expanded stats
      vpip_pct: s.handsPlayed > 0 ? Math.round((s.vpipCount || 0) / s.handsPlayed * 100) : 0,
      pfr_pct: s.handsPlayed > 0 ? Math.round((s.pfrCount || 0) / s.handsPlayed * 100) : 0,
      duration_minutes: Math.round((Date.now() - s.sessionStart) / 60000),
    };
    try {
      if (sessionRowIdRef.current) {
        const { error: err_poker_session_stats_g5p85 } = await supabase.from('poker_session_stats').update(payload)
          .eq('id', sessionRowIdRef.current);
        if (err_poker_session_stats_g5p85) console.warn('[Supabase] Silent mutation failed in poker_session_stats:', err_poker_session_stats_g5p85.message);
      } else {
        const { data } = await supabase.from('poker_session_stats')
          .insert(payload)
          .select('id')
          .maybeSingle();
        if (data?.id) sessionRowIdRef.current = data.id;
      }
      // J13: Emit session summary for lobby card consumption
      eventBus.emit('SESSION_SUMMARY_UPDATED', {
        handsPlayed: s.handsPlayed,
        netPL: s.currentStack - s.startingStack,
        winRate: s.handsPlayed > 0 ? Math.round((s.handsWon / s.handsPlayed) * 100) : 0,
        duration: Math.round((Date.now() - s.sessionStart) / 60000),
      });
      // Also notify session history page
      eventBus.emit('DATA_MUTATED', 'session_saved');
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, [supabase, userId, tableId, tableState?.clubId]);

  // Save session on page unload / disconnect
  useEffect(() => {
    const handleBeforeUnload = () => saveSessionToSupabase();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveSessionToSupabase(); // Save on unmount too
    };
  }, [saveSessionToSupabase]);

  // J4: Periodic auto-save every 30 seconds (crash protection)
  useEffect(() => {
    if (!supabase || !userId || !tableId) return;
    const interval = setInterval(() => {
      if (sessionStatsRef.current?.handsPlayed > 0) {
        saveSessionToSupabase();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [saveSessionToSupabase, supabase, userId, tableId]);

  // ═══ WAVE I2: SESSION STATS AUTO-LOAD ON RECONNECT ═══
  useEffect(() => {
    if (!supabase || !userId || !tableId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('poker_session_stats')
          .select('*')
          .eq('user_id', userId)
          .eq('table_id', tableId)
          .order('session_start', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || !data) return;
        // Only restore if session was within last 30 minutes
        const age = Date.now() - new Date(data.session_end || data.session_start).getTime();
        if (age > 30 * 60 * 1000) return;
        const s = sessionStatsRef.current;
        if (s.handsPlayed === 0) {
          // Restore previous session
          s.handsPlayed = data.hands_played || 0;
          s.handsWon = data.hands_won || 0;
          s.startingStack = data.starting_stack || 0;
          s.currentStack = data.ending_stack || 0;
          s.biggestWin = data.biggest_win || 0;
          s.biggestLoss = data.biggest_loss || 0;
          s.plHistory = data.pl_history || [0];
          s.positionWins = data.position_wins || {};
          s.positionTotal = data.position_total || {};
          s.sessionStart = new Date(data.session_start).getTime();
          setSessionStatsSnap({ ...s });
          setStackHistory(data.pl_history || []);
          sessionRowIdRef.current = data.id; // Track row for future UPDATEs
        }
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    })();
    return () => { cancelled = true; };
  }, [supabase, userId, tableId]);

  // ═══ WAVE I3: SEAT PREFS SUPABASE UPSERT ═══
  const lastSavedSeatRef = useRef(null);
  useEffect(() => {
    if (!mySeat || !maxSeats || !supabase || !userId) return;
    const seatIdx = tableState?.seats?.indexOf(mySeat);
    if (seatIdx == null || seatIdx < 0) return;
    // Only UPSERT if seat actually changed (avoid excessive writes on opponent state changes)
    const key = `${maxSeats}-${seatIdx}`;
    if (lastSavedSeatRef.current === key) return;
    lastSavedSeatRef.current = key;
    // Save to Supabase (non-blocking)
    supabase.from('poker_seat_preferences').upsert({
      user_id: userId,
      max_seats: maxSeats,
      preferred_seat: seatIdx,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,max_seats' }).then(() => {}).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [mySeat, maxSeats, tableState?.seats, supabase, userId]);

  // J2: Load seat preference FROM Supabase on table join — suggest preferred seat
  useEffect(() => {
    if (!supabase || !userId || !maxSeats || isSitting) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('poker_seat_preferences')
          .select('preferred_seat')
          .eq('user_id', userId)
          .eq('max_seats', maxSeats)
          .maybeSingle();
        if (cancelled || !data || data.preferred_seat == null) return;
        // Emit suggestion via EventBus — UI can show "Your preferred seat is #X"
        eventBus.emit('SEAT_PREFERENCE_LOADED', { seat: data.preferred_seat, maxSeats });
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    })();
    return () => { cancelled = true; };
  }, [supabase, userId, maxSeats, isSitting]);

  // ═══ WAVE I5: FELT COLOR SUPABASE SYNC ═══
  // Save felt preference to Supabase alongside localStorage
  const handleFeltChangeWithSync = useCallback((feltId) => {
    handleFeltChange(feltId);
    if (supabase && userId) {
      // UPSERT with ALL columns to avoid nulling any field on shared row (max_seats=0)
      supabase.from('poker_seat_preferences').upsert({
        user_id: userId,
        max_seats: 0,
        preferred_seat: 0,
        felt_color: feltId,
        sound_enabled: soundEnabled,
        sound_volume: soundVolume,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,max_seats' }).then(() => {}).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }
  }, [handleFeltChange, supabase, userId, soundEnabled, soundVolume]);

  // J1 + K2: Load felt color AND sound preference FROM Supabase on mount
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('poker_seat_preferences')
          .select('felt_color, sound_enabled, sound_volume, updated_at')
          .eq('user_id', userId)
          .eq('max_seats', 0)
          .maybeSingle();
        if (cancelled || !data) return;
        // Apply felt color if valid
        if (data.felt_color && FELT_OPTIONS.some(f => f.id === data.felt_color)) {
          setFeltColor(data.felt_color);
          try { localStorage.setItem('poker-felt-color', data.felt_color); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
        // K2: Apply sound preference from Supabase
        if (data.sound_enabled != null) {
          setSoundEnabled(data.sound_enabled);
          try { localStorage.setItem('poker-sound-enabled', String(data.sound_enabled)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
        // K4: Apply sound volume from Supabase
        if (data.sound_volume != null && data.sound_volume >= 0 && data.sound_volume <= 1) {
          setSoundVolume(data.sound_volume);
          try { localStorage.setItem('poker-sound-volume', String(data.sound_volume)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    })();
    return () => { cancelled = true; };
  }, [supabase, userId]);

  // K3: Preferred seat glow — listen for SEAT_PREFERENCE_LOADED from J2
  const [preferredSeatIdx, setPreferredSeatIdx] = useState(null);
  useEffect(() => {
    const handler = (payload) => {
      if (payload?.seat != null) setPreferredSeatIdx(payload.seat);
    };
    const unsub = eventBus.on('SEAT_PREFERENCE_LOADED', handler);
    return () => {
      if (typeof unsub === 'function') unsub();
      else eventBus.off('SEAT_PREFERENCE_LOADED', handler);
    };
  }, []);
  // Clear preferred seat glow when user sits down
  useEffect(() => {
    if (isSitting) setPreferredSeatIdx(null);
  }, [isSitting]);

  // K4: Sound volume level Supabase sync (skip initial mount)
  const volumeSyncMountedRef = useRef(false);
  useEffect(() => {
    if (!supabase || !userId) return;
    if (!volumeSyncMountedRef.current) {
      volumeSyncMountedRef.current = true;
      return;
    }
    supabase.from('poker_seat_preferences')
      .update({ sound_volume: soundVolume, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('max_seats', 0)
      .then(() => {}).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [soundVolume, supabase, userId]);

  // ═══ WAVE I6: WIN FLY-UP CHA-CHING SOUND ═══
  useEffect(() => {
    if (winFlyUpAmount > 0 && soundRef.current && soundEnabled) {
      soundRef.current.play('chips'); // Play chip sound on win
    }
  }, [winFlyUpAmount, soundEnabled]);

  // ═══ WAVE I7: CHAT @MENTION NOTIFICATION SOUND ═══
  const lastChatCountRef = useRef(0);
  useEffect(() => {
    if (!chatMessages || chatMessages.length <= lastChatCountRef.current) {
      lastChatCountRef.current = chatMessages?.length || 0;
      return;
    }
    // Check new messages for @mentions of hero
    const newMsgs = chatMessages.slice(lastChatCountRef.current);
    lastChatCountRef.current = chatMessages.length;
    const heroName = displayName?.toLowerCase();
    if (!heroName) return;
    const mentioned = newMsgs.some(m =>
      m.text?.toLowerCase().includes(`@${heroName}`) ||
      m.text?.toLowerCase().includes(`@${heroName.split(' ')[0]}`)
    );
    if (mentioned && soundRef.current && soundEnabled) {
      soundRef.current.play('yourTurn'); // Distinct attention sound
    }
  }, [chatMessages, displayName, soundEnabled]);

  // I10: Escape key handled in main keyboard shortcuts handler at L6819 below
  // (merged setShowFeltPicker + setShowLayoutManager into that handler)

  // ═══ WAVE I15: POT SCOOP STATE + TRIGGER ═══
  const [potScoopActive, setPotScoopActive] = useState(false);
  const [potScoopTarget, setPotScoopTarget] = useState(null);
  useEffect(() => {
    if (!result?.winners?.[0]) return;
    const winnerSeatIdx = seats?.findIndex(s => s?.player?.id && String(s.player.id) === String(result.winners[0].playerId));
    if (winnerSeatIdx >= 0 && positions?.[winnerSeatIdx]) {
      const pos = positions[winnerSeatIdx];
      setPotScoopTarget({ x: pos.x ?? 50, y: pos.y ?? 30 });
      setPotScoopActive(true);
      const t = setTimeout(() => { setPotScoopActive(false); setPotScoopTarget(null); }, 2000);
      return () => clearTimeout(t);
    }
  }, [result, seats, positions]);

  // ═══ WAVE I14: REALTIME CHIP BALANCE SUPABASE SYNC ═══
  useEffect(() => {
    if (!supabase || !tableState?.clubId || !userId) return;
    const channel = supabase
      .channel(`chip_balance_${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'club_members',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.new?.chip_balance !== undefined) {
          eventBus.emit('WALLET_REFRESHED', { balance: payload.new.chip_balance });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, tableState?.clubId, userId]);



  // ═══ ENHANCED SESSION STATS ═══
  const [biggestPot, setBiggestPot] = useState(0);
  const [handsWon, setHandsWon] = useState(0);
  const [vpipCount, setVpipCount] = useState(0);

  useEffect(() => {
    if (!result || !result.handId) return;
    // Track biggest pot
    const pot = result.potTotal || 0;
    if (pot > biggestPot) setBiggestPot(pot);
    // Track hands won by hero
    const heroWon = result.winners?.some(w => String(w.playerId) === String(userId));
    if (heroWon) setHandsWon(prev => prev + 1);
    // Track VPIP (voluntarily put money in the pot)
    if (result.heroVPIP) setVpipCount(prev => prev + 1);
  }, [result, userId, biggestPot]);

  // Toggle States
  const [sitOutNextBB, setSitOutNextBB] = useState(false);
  const [straddleOn, setStraddleOn] = useState(false);
  const handleToggleStraddle = useCallback(() => {
    const newVal = !straddleOn;
    setStraddleOn(newVal);
    send(newVal ? 'declare_straddle' : 'cancel_straddle', {});
  }, [send, straddleOn]);

  const [autoTopUpOn, setAutoTopUpOn] = useState(false);
  const handleToggleAutoTopUp = useCallback(() => {
    const newVal = !autoTopUpOn;
    setAutoTopUpOn(newVal);
    send('set_auto_topup', { enabled: newVal });
  }, [send, autoTopUpOn]);

  // ═══ WAITLIST STATE ═══
  const [waitlistState, setWaitlistState] = useState({ onWaitlist: false, position: null, loading: false });
  const tableFull = !isSitting && tableState?.seats?.length > 0 && tableState.seats.every(s => s.player?.id != null && s.status !== 'empty');

  // Check waitlist position on mount and when seat state changes
  const checkWaitlistPosition = useCallback(async () => {
    if (!tableState?.tableId || !userId || isSitting) return;
    try {
      const token = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')?.access_token;
      if (!token) return;
      const res = await fetch('/api/club-arena/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'position', tableId: tableState.tableId }),
      });
      if (res.ok) {
        const d = await res.json();
        setWaitlistState(prev => ({ ...prev, onWaitlist: d.onWaitlist, position: d.position }));
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, [tableState?.tableId, userId, isSitting]);

  // Initial position check + re-check when seats change
  useEffect(() => {
    checkWaitlistPosition();
  }, [checkWaitlistPosition, tableState?.seats?.map(s => s.player?.id).join(',')]);

  // Realtime waitlist position updates via EventBus
  useEffect(() => {
    if (!tableState?.tableId || isSitting) return;
    const onWaitlistChange = () => checkWaitlistPosition();
    const unsub1 = eventBus.on('WAITLIST_PLAYER_ADDED', onWaitlistChange);
    const unsub2 = eventBus.on('DATA_MUTATED', (detail) => {
      if (typeof detail === 'string' && detail.includes('waitlist')) onWaitlistChange();
    });
    return () => {
      if (typeof unsub1 === 'function') unsub1(); else eventBus.off('WAITLIST_PLAYER_ADDED', onWaitlistChange);
      if (typeof unsub2 === 'function') unsub2();
    };
  }, [tableState?.tableId, isSitting, checkWaitlistPosition]);

  const handleJoinWaitlist = useCallback(async () => {
    if (!tableState?.tableId || waitlistState.loading) return;
    setWaitlistState(prev => ({ ...prev, loading: true }));
    try {
      const token = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')?.access_token;
      const res = await fetch('/api/club-arena/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'join', tableId: tableState.tableId }),
      });
      if (res.ok) {
        const d = await res.json();
        setWaitlistState({ onWaitlist: true, position: d.position, loading: false });
        try { eventBus.emit('WAITLIST_PLAYER_ADDED', { tableId: tableState.tableId, position: d.position }); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
      } else {
        const d = await res.json().catch(() => ({}));
        if (d.error === 'Already on waitlist') setWaitlistState(prev => ({ ...prev, onWaitlist: true, loading: false }));
        else setWaitlistState(prev => ({ ...prev, loading: false }));
      }
    } catch (_) { setWaitlistState(prev => ({ ...prev, loading: false })); }
  }, [tableState?.tableId, waitlistState.loading]);

  const handleLeaveWaitlist = useCallback(async () => {
    if (!tableState?.tableId) return;
    setWaitlistState(prev => ({ ...prev, loading: true }));
    try {
      const token = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')?.access_token;
      await fetch('/api/club-arena/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'leave', tableId: tableState.tableId }),
      });
      setWaitlistState({ onWaitlist: false, position: null, loading: false });
      try { eventBus.emit('DATA_MUTATED', 'waitlist_left'); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    } catch (_) { setWaitlistState(prev => ({ ...prev, loading: false })); }
  }, [tableState?.tableId]);

  // ═══ PRE-ACTION VISUAL FEEDBACK STATE ═══
  const [preActionFired, setPreActionFired] = useState(null); // { action, ts }
  const preActionCleanupRef = useRef(null);

  // ═══ RUN-IT-TWICE / THRICE PROMPT (from backend result.runItOffer) ═══
  const offer = result?.runItOffer;
  const offerResponders = Array.isArray(offer?.responderIds) ? offer.responderIds : [];
  const isRitOfferActive = !!offer && (String(offer.proposerId) === String(userId) || offerResponders.includes(String(userId)));
  const isRitProposer = !!offer && String(offer.proposerId) === String(userId);
  const isRitResponder = offerResponders.includes(String(userId));

  const handleRITResponse = useCallback((choice) => {
    send('respond_run_it', { choice });
    try { eventBus.emit('DATA_MUTATED', `rit_response_${choice}`); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
  }, [send]);

  // ═══ RIT COUNTDOWN TIMER ═══
  const [ritCountdown, setRitCountdown] = useState(0);
  const ritCountdownRef = useRef(null);

  useEffect(() => {
    if (isRitOfferActive && offer?.deadline) {
      setRitCountdown(offer.deadline);
      if (ritCountdownRef.current) clearInterval(ritCountdownRef.current);
      ritCountdownRef.current = setInterval(() => {
        setRitCountdown(prev => {
          if (prev <= 1) {
            clearInterval(ritCountdownRef.current);
            ritCountdownRef.current = null;
            // Auto-decline on timeout
            handleRITResponse(isRitProposer ? 'once' : 'decline');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (ritCountdownRef.current) clearInterval(ritCountdownRef.current); };
    } else {
      if (ritCountdownRef.current) { clearInterval(ritCountdownRef.current); ritCountdownRef.current = null; }
      setRitCountdown(0);
    }
  }, [isRitOfferActive, offer?.deadline, isRitProposer, handleRITResponse]);

  // ═══ HERO SEAT ROTATION — Always place hero at bottom center (position 0) ═══
  const heroSeatIndex = mySeat?.seatIndex ?? -1;
  const rotatedPositionMap = useMemo(() => {
    // Map each seat's array index to a visual position index
    // Hero's seat index should map to position 0 (bottom center)
    if (heroSeatIndex < 0) return null; // not seated, no rotation
    const map = new Array(maxSeats);
    for (let i = 0; i < maxSeats; i++) {
      // Rotate so heroSeatIndex -> 0, heroSeatIndex+1 -> 1, etc.
      map[i] = (i - heroSeatIndex + maxSeats) % maxSeats;
    }
    return map;
  }, [heroSeatIndex, maxSeats]);

  // Auto-execute pre-action when it's our turn
  useEffect(() => {
    if (!isMyTurn || !legalActions?.length || !preAction) return;

    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canFold = legalActions.some(a => a.type === 'fold');

    let autoAction = null;
    switch (preAction) {
      case 'fold':
      case 'fold_any':
        if (canFold) autoAction = { type: 'fold' };
        break;
      case 'check_fold':
        autoAction = canCheck ? { type: 'check' } : canFold ? { type: 'fold' } : null;
        break;
      case 'check':
        if (canCheck) autoAction = { type: 'check' };
        break;
      case 'call_any':
        autoAction = canCall ? { type: 'call' } : canCheck ? { type: 'check' } : null;
        break;
    }

    if (autoAction) {
      // Small delay so player sees the action happening
      const timer = setTimeout(() => {
        send('player_action', { action: autoAction });
        setPreAction(null);
        // Play sound + haptic for auto-action
        const sm = soundRef.current;
        if (sm) {
          const soundMap = { fold: 'fold', check: 'check', call: 'call' };
          if (soundMap[autoAction.type]) sm.play(soundMap[autoAction.type]);
        }
        if (hapticEnabled) haptic(autoAction.type === 'fold' ? 'light' : 'medium');
        // Visual feedback — show what pre-action fired
        setPreActionFired({ action: autoAction.type, ts: Date.now() });
        // Clear feedback after 2s (safe — component-level cleanup via key-based AnimatePresence)
        const clearTimer = setTimeout(() => setPreActionFired(null), 2000);
        // Store so useEffect cleanup can cancel if component unmounts
        preActionCleanupRef.current = clearTimer;
        try { eventBus.emit('DATA_MUTATED', `pre_action_fired_${autoAction.type}`); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
      }, 300);
      return () => { clearTimeout(timer); if (preActionCleanupRef.current) clearTimeout(preActionCleanupRef.current); };
    } else {
      // Pre-action doesn't match — clear it, let player decide manually
      setPreAction(null);
    }
  }, [isMyTurn, legalActions, preAction, send, hapticEnabled]);

  // Clear pre-action when hand ends, and process Auto Top-Up
  useEffect(() => {
    if (result) {
      setPreAction(null);

      // ═══ AUTO TOP-UP LOGIC ════
      if (autoTopUpOn && mySeat?.stack != null && clubChipBalance > 0) {
        const maxBuyIn = tableState?.config?.maxBuyIn || 200;
        if (mySeat.stack < maxBuyIn) {
          const deficit = maxBuyIn - mySeat.stack;
          const topUpAmt = Math.min(deficit, clubChipBalance);
          if (topUpAmt > 0) {
            // Delay auto top-up slightly so showdown/payout animations finish first
            setTimeout(() => {
              send('add_chips', { amount: topUpAmt });
            }, 3000);
          }
        }
      }

      // ═══ #7: AUTO-REBUY CHECK (Phase 24) ════
      if (tableId && mySeat?.stack != null) {
        checkAutoRebuy(tableId, mySeat.stack, send);
      }
    }
  }, [result, autoTopUpOn, mySeat?.stack, clubChipBalance, tableState?.config?.maxBuyIn, send, tableId]);

  // ═══ FLOATING ACTION LABELS ═══
  const [floatingLabels, setFloatingLabels] = useState([]);
  const floatingIdRef = useRef(0);

  // Track actions from broadcasts for floating labels
  useEffect(() => {
    if (!tableState?.game?.lastAction) return;
    const la = tableState.game.lastAction;
    if (la.seatIndex == null) return;
    const seatIdx = la.seatIndex;
    const visualIdx = rotatedPositionMap ? rotatedPositionMap[seatIdx] : seatIdx;
    const pos = positions[visualIdx] || positions[0];
    const id = ++floatingIdRef.current;
    setFloatingLabels(prev => [...prev.slice(-5), { id, action: la.type, amount: la.amount, position: pos }]);
    const t = setTimeout(() => setFloatingLabels(prev => prev.filter(l => l.id !== id)), 1800);
    return () => clearTimeout(t);
  }, [tableState?.game?.lastAction?.seq, rotatedPositionMap, positions]);

  // ═══ AUTO-MUCK TOGGLE ═══
  const [autoMuck, setAutoMuck] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('poker-auto-muck') === 'true';
    return false;
  });
  const handleToggleAutoMuck = useCallback(() => {
    setAutoMuck(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('poker-auto-muck', String(next));
      return next;
    });
  }, []);

  // Phase 27 audit: Listen for auto-muck-changed from ThemePicker
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMuckChange = (e) => setAutoMuck(!!e.detail);
    window.addEventListener('poker-auto-muck-changed', handleMuckChange);
    return () => window.removeEventListener('poker-auto-muck-changed', handleMuckChange);
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // ACTION HANDLERS (use send from hook)
  // ═══════════════════════════════════════════════════════════════════

  const handleAction = useCallback((action) => {
    // Play action sound
    const sm = soundRef.current;
    if (sm && action?.type) {
      const soundMap = { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise', all_in: 'allIn' };
      if (soundMap[action.type]) sm.play(soundMap[action.type]);
    }
    // Haptic feedback on mobile
    if (hapticEnabled) {
      if (action?.type === 'all_in') haptic('allIn');
      else if (action?.type === 'fold') haptic('light');
      else haptic('medium');
    }
    send('player_action', { action });
  }, [send]);

  // ═══ KEYBOARD SHORTCUTS ═══
  // Game: F=Fold, C=Check/Call, A=All-In, Space=Check/Call, 1-9=Bet sizes
  // Utility: T=Time Bank, S=Sit Out, M=Muck, H=HUD, L=Last Hand, ?=Help
  const [showKbHelp, setShowKbHelp] = useState(false);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!isActive) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();

      // Utility shortcuts — work anytime (no turn guard)
      // G10: Wave F panel shortcuts (Shift modifiers — checked FIRST to avoid shadowing)
      if (e.shiftKey && key === 'l') { e.preventDefault(); setShowActionLog(p => !p); return; }
      if (e.shiftKey && key === 'g') { e.preventDefault(); setShowStackGraph(p => !p); return; }
      if (e.shiftKey && key === 't') { e.preventDefault(); setShowTableStats(p => !p); return; }
      // Plain letter shortcuts (no shift)
      if (key === 's' && !e.shiftKey && isSitting) { e.preventDefault(); isSittingOut ? send('sit_in') : send('sit_out'); return; }
      if (key === 'm' && !e.shiftKey && isSitting) { e.preventDefault(); handleToggleAutoMuck(); return; }
      if (key === 'h' && !e.shiftKey) { e.preventDefault(); setShowHUD(p => { const v = !p; try { localStorage.setItem('poker-show-hud', v); eventBus.emit('DATA_MUTATED', 'hud_toggled'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); } return v; }); return; }
      if (key === 'l' && !e.shiftKey && lastHandResult) { e.preventDefault(); setShowLastHand(true); return; }
      if (key === '?' || key === '/') { e.preventDefault(); setShowKbHelp(p => !p); return; }
      // K13: Wave H/I/J shortcuts — sound, felt, session stats, layout
      if (key === 'v' && !e.shiftKey) { e.preventDefault(); handleToggleSound(); return; }
      if (key === 'p' && !e.shiftKey) { e.preventDefault(); setShowFeltPicker(p => !p); return; }
      if (e.shiftKey && key === 's') { e.preventDefault(); setShowSessionSummary(p => !p); return; }
      if (e.shiftKey && key === 'h') { e.preventDefault(); setShowLayoutManager(p => !p); return; }
      if (key === 'escape') { setShowKbHelp(false); setShowActionLog(false); setShowStackGraph(false); setShowTableStats(false); setShowFeltPicker(false); setShowLayoutManager(false); return; }

      // Game action shortcuts — only when it's our turn
      if (!isMyTurn || !legalActions?.length) return;

      const canFold = legalActions.some(a => a.type === 'fold');
      const canCheck = legalActions.some(a => a.type === 'check');
      const canCall = legalActions.find(a => a.type === 'call');
      const canAllIn = legalActions.some(a => a.type === 'all_in');
      const canBet = legalActions.find(a => a.type === 'bet' || a.type === 'raise');

      // 1-9: bet size presets (1=min, 9=max, linear interpolation)
      if (key >= '1' && key <= '9' && canBet) {
        e.preventDefault();
        const min = canBet.minAmount || tableState?.config?.bigBlind || 2;
        const max = canBet.maxAmount || mySeat?.stack || min;
        const idx = parseInt(key) - 1; // 0-8
        const amount = Math.round(min + (max - min) * (idx / 8));
        handleAction({ type: canBet.type, amount: Math.min(Math.max(amount, min), max) });
        return;
      }

      switch (key) {
        case 'f':
          if (canFold) { e.preventDefault(); handleAction({ type: 'fold' }); }
          break;
        case 'c':
        case ' ':
          e.preventDefault();
          if (canCheck) handleAction({ type: 'check' });
          else if (canCall) handleAction({ type: 'call' });
          break;
        case 'a':
          if (canAllIn) { e.preventDefault(); handleAction({ type: 'all_in' }); }
          break;
        case 't':
          e.preventDefault();
          send('use_timebank');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, isMyTurn, legalActions, handleAction, isSitting, isSittingOut, send, lastHandResult, handleToggleAutoMuck, tableState?.config?.bigBlind, mySeat?.stack]);

  const handleSitDown = useCallback((amount) => {
    send('sit_down', { seatIndex: buyInSeat, buyIn: amount, displayName, avatarUrl });
    setBuyInSeat(null);
  }, [send, buyInSeat, displayName, avatarUrl]);

  const [sessionSummary, setSessionSummary] = useState(null);
  const pendingLeaveRef = useRef(false);
  const handleStandUp = useCallback(() => {
    setSitOutNextBB(false); // Clear pending sit-out flag
    // Calculate session summary before leaving
    const stats = sessionStats;
    const stack = mySeat?.stack || 0;
    if (stats && stats.initialBuyIn > 0) {
      const pnl = stack - stats.initialBuyIn - (stats.totalAdded || 0);
      const hrs = stats.sessionStart ? ((Date.now() - stats.sessionStart) / 3600000).toFixed(1) : '0';
      const sign = pnl >= 0 ? '+' : '';
      setSessionSummary({ pnl, hands: stats.handsPlayed, hrs, message: `Session: ${sign}${pnl.toLocaleString()} chips | ${stats.handsPlayed} hands | ${hrs}hr` });
      setTimeout(() => setSessionSummary(null), 8000);
    }
    pendingLeaveRef.current = true;
    send('stand_up', {});
  }, [send, sessionStats, mySeat?.stack]);

  // Auto-complete pending leave after hand ends
  // When player clicks Leave during a hand, engine returns pending: true.
  // After hand_complete, player is sitting_out but still at table.
  // This effect re-issues stand_up to complete departure.
  useEffect(() => {
    if (!pendingLeaveRef.current) return;
    if (isSittingOut && (!tableState?.game?.phase || tableState.game.phase === 'idle')) {
      pendingLeaveRef.current = false;
      send('stand_up', {});
    }
  }, [isSittingOut, tableState?.game?.phase, send]);
  const handleSitOut = useCallback(() => send('sit_out', {}), [send]);
  const handleSitIn = useCallback(() => { setSitOutNextBB(false); send('sit_in', {}); }, [send]);

  // Sit Out Next BB: after each hand, check if we should sit out
  useEffect(() => {
    if (!sitOutNextBB || !result || isSittingOut) return;
    // Hand just completed — sit out now (the BB has passed)
    send('sit_out', {});
    setSitOutNextBB(false);
  }, [result, sitOutNextBB, isSittingOut, send]);

  // ═══ WAVE A: BB DISPLAY TOGGLE ═══
  const [showStackInBB, setShowStackInBB] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('poker-stack-bb') === 'true';
    return false;
  });
  const [showHistoryBrowser, setShowHistoryBrowser] = useState(false);
  const handleToggleBBDisplay = useCallback(() => {
    setShowStackInBB(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('poker-stack-bb', String(next));
      try { eventBus.emit('DATA_MUTATED', 'bb_display_toggled'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      return next;
    });
  }, []);
  const bigBlindVal = tableState?.config?.bigBlind || 2;
  const formatStack = useCallback((chips) => {
    if (!showStackInBB || !bigBlindVal) return typeof chips === 'number' ? chips.toLocaleString() : '0';
    return (chips / bigBlindVal).toFixed(1).replace(/\.0$/, '') + ' BB';
  }, [showStackInBB, bigBlindVal]);

  // ═══ WAVE A: CARD SORT PREFERENCE ═══
  const [cardSortMode, setCardSortMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('poker-card-sort') || 'dealt';
    return 'dealt';
  });
  const cycleCardSort = useCallback(() => {
    setCardSortMode(prev => {
      const modes = ['dealt', 'rank', 'suit'];
      const next = modes[(modes.indexOf(prev) + 1) % modes.length];
      if (typeof window !== 'undefined') localStorage.setItem('poker-card-sort', next);
      try { eventBus.emit('DATA_MUTATED', 'card_sort_changed'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      return next;
    });
  }, []);

  // ═══ WAVE A: HAPTIC TOGGLE ═══
  const [hapticEnabled, setHapticEnabled] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('poker-haptic') !== 'false';
    return true;
  });
  const handleToggleHaptic = useCallback(() => {
    setHapticEnabled(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('poker-haptic', String(next));
      try { eventBus.emit('DATA_MUTATED', 'haptic_toggled'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      return next;
    });
  }, []);



  // ═══ WAVE B: SMART HUD TOGGLE ═══
  const [showHUD, setShowHUD] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('poker-show-hud') === 'true';
    return false;
  });
  const handleToggleHUD = useCallback(() => {
    setShowHUD(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('poker-show-hud', String(next));
      try { eventBus.emit('DATA_MUTATED', 'hud_toggled'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      return next;
    });
  }, []);

  // ═══ WAVE B: 4-COLOR DECK TOGGLE ═══
  const [fourColorDeck, setFourColorDeck] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('poker-4color-deck') === 'true';
    return false;
  });
  const handleToggleFourColor = useCallback(() => {
    setFourColorDeck(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('poker-4color-deck', String(next));
      try { eventBus.emit('DATA_MUTATED', 'four_color_deck_toggled'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      return next;
    });
  }, []);

  // ═══ WAVE B: TABLE LEADERBOARD TOGGLE ═══
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // ═══ PHASE 23: TABLE EXPERIENCE STATE ═══
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [disconnectedAt, setDisconnectedAt] = useState(null);
  
  // #8: Connection Quality Ping Measurement (Phase 24)
  const { latency: wsLatency, handlePong } = usePingMeasurement(send, connected);
  
  useEffect(() => {
    const unsub = eventBus.on('INCOMING_PONG', () => handlePong());
    return () => { if (unsub) unsub(); };
  }, [handlePong]);

  // #7: Track connection state for reconnection overlay
  useEffect(() => {
    if (connected) {
      setDisconnectedAt(null);
    } else if (!connected && !disconnectedAt) {
      setDisconnectedAt(Date.now());
    }
  }, [connected, disconnectedAt]);

  // #4: Handle emoji send → broadcast + float animation
  const handleEmojiSend = useCallback((emoji) => {
    // Phase 24 check: Enforce server-side 3s rate limit to prevent spam
    if (!checkEmojiRateLimit(userId || mySeat?.id)) return;

    // Add floating reaction at center of table
    const id = Date.now();
    setFloatingReactions(prev => [...prev, { id, emoji }]);
    // Broadcast to other players via the table channel
    send?.('throw_emoji', { emoji });
  }, [send, userId, mySeat?.id]);

  // #2: Phase 24 Incoming Emoji Listener
  useEffect(() => {
    const unsub = eventBus.on('INCOMING_EMOJI', (data) => {
      // Ignore our own echoes if any
      if (String(data.fromId) === String(userId || mySeat?.id)) return;
      
      const emoji = data.emoji;
      if (!emoji) return;
      const id = Date.now() + Math.random();
      setFloatingReactions(prev => [...prev, { id, emoji }]);
    });
    return () => { if (unsub) unsub(); };
  }, [userId, mySeat?.id]);

  // #3: Handle session summary on leave
  const handleLeaveWithSummary = useCallback(() => {
    if (sessionStats?.handsPlayed > 0) {
      setShowSessionSummary(true);
    } else {
      onLeave?.();
    }
  }, [sessionStats, onLeave]);

  const handleShareSession = useCallback(() => {
    const text = `Smarter.Poker Session\nHands: ${sessionStats?.handsPlayed || 0}\nP&L: ${(sessionStats?.totalAdded || 0) >= 0 ? '+' : ''}${sessionStats?.totalAdded || 0}\nDuration: ${sessionStats?.sessionStart ? Math.round((Date.now() - sessionStats.sessionStart) / 60000) : 0}m`;
    navigator.clipboard?.writeText(text);
  }, [sessionStats]);

  const handleChat = useCallback((message) => {
    soundRef.current?.play('chat');
    send('send_chat', { message });
    // Fire-and-forget persistence to Supabase
    if (tableState?.clubId) {
      try {
        const token = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')?.access_token;
        fetch('/api/club-arena/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ message, displayName: tableState?.playerName || 'Player', clubId: tableState.clubId }),
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }
  }, [send, tableState?.clubId, tableState?.playerName]);
  const handleAddChips = useCallback(() => {
    setRebuyError(null);
    setRebuyBalance(clubChipBalance || 0);
    setShowRebuy(true);
    setRebuyBalanceLoading(false); // Native sync resolves instantly
  }, [clubChipBalance]);

  const handleRebuyConfirm = useCallback(async (amount) => {
    setRebuyError(null);
    try {
      // seat.js add_chips handler locks chips via ChipBridge.rebuyChips()
      // and adds to engine stack — returns { success, error }
      const result = await send('add_chips', { amount });
      if (result && !result.success) {
        setRebuyError(result.error || 'Rebuy failed');
        return;
      }
      setShowRebuy(false);
    } catch (e) {
      setRebuyError('Network error. Please try again.');
    }
  }, [send]);
  const handleDiscard = useCallback((cardIndex) => {
    send('discard', { cardIndex });
  }, [send]);

  // ═══════════════════════════════════════════════════════════════════
  // BUILD SEAT DATA (merge server state with hero cards)
  // ═══════════════════════════════════════════════════════════════════

  const seats = useMemo(() => {
    if (!tableState) return positions.map((_, i) => ({
      seatIndex: i, status: 'empty', player: null, stack: 0,
      holeCards: null, isInHand: false, isFolded: false, isCurrentActor: false, invested: 0,
    }));

    return tableState.seats.slice(0, maxSeats).map((seat) => ({
      ...seat,
      holeCards: (seat.player?.id != null && String(seat.player.id) === String(userId)) ? myCards : seat.holeCards,
    }));
  }, [tableState, myCards, userId, maxSeats, positions]);

  // Per-seat fallback portraits for players with no avatarUrl -- see
  // buildSeatFallbackAvatars/resolveTableAvatar above. Dealt once per table
  // (keyed on tableId), not per seat, so the whole cast at one table is
  // distinct; the viewer's own account avatar (avatarUrl prop) is reserved
  // for the viewer's own seat and withheld from everyone else's fallback.
  const seatFallbackAvatars = useMemo(() => {
    const heroFallback = (avatarUrl && avatarUrl.startsWith('/avatars/')) ? avatarUrl : HERO_DEFAULT_AVATAR;
    const heroSeatIndex = seats.findIndex(
      (s) => s.player?.id != null && String(s.player.id) === String(userId)
    );
    return buildSeatFallbackAvatars(tableId, maxSeats, heroFallback, heroSeatIndex);
  }, [tableId, maxSeats, avatarUrl, seats, userId]);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: T.bgDark,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Table surface — vertical layout for Club Arena mobile */}
      <div
        style={{
          position: 'absolute',
          top: '6%',
          left: '2%',
          right: '2%',
          bottom: '10%',
        }}
      >
        {/* Poker table image — vertical orientation for portrait mode */}
        <img
          src="/images/poker-table-vertical.png"
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            height: '100%',
            maxWidth: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        {/* H4: Felt color overlay */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          height: '100%', width: '100%', zIndex: 0, pointerEvents: 'none',
          background: (FELT_OPTIONS.find(f => f.id === feltColor) || FELT_OPTIONS[0]).gradient,
          mixBlendMode: 'multiply', opacity: 0.6, borderRadius: 'inherit',
        }} />

        {/* Table content overlay — positioned over the vertical table */}
        <div
          style={{
            position: 'absolute',
            top: '18%',
            left: '15%',
            right: '15%',
            bottom: '18%',
            zIndex: 1,
          }}
        >
          {/* BBJ Ticker */}
          {tableState?.config?.bbjEnabled && tableState?.clubId && (
            <BBJTicker
              clubId={tableState.clubId}
              variant="table"
              bbjWonEvent={result?.bbj || null}
              supabase={supabase}
            />
          )}

          {/* Community cards */}
          <CommunityCards
            cards={tableState?.game?.communityCards || []}
            boards={result?.runItMultiple?.boards?.map(b => b.cards || []) || tableState?.game?.boards}
            fourColorDeck={fourColorDeck}
          />

          {/* Pot */}
          <PotDisplay
            potTotal={tableState?.game?.potTotal || 0}
            pots={tableState?.game?.pots || []}
            formatFn={formatStack}
            seats={tableState?.seats || []}
          />

          {/* Run It Twice/Thrice — handled by inline isRitOfferActive block below */}

          {/* Result overlay */}
          <AnimatePresence>
            {result && <ResultOverlay result={result} send={send} userId={userId} />}
          </AnimatePresence>

          {/* Chip fly animation — chips fly from pot to winner seats */}
          {result?.winners && (
            <ChipFlyAnimation
              winners={result.winners}
              seatPositions={positions}
              seats={seats}
            />
          )}

          {/* Confetti burst on big pots (≥50× BB) */}
          <ConfettiBurst
            active={!!(result?.winners && tableState?.config?.bigBlind &&
              (result.winners.reduce((s, w) => s + (w.amount || 0), 0) >= tableState.config.bigBlind * 50))}
          />

          {/* Equity progress bar on all-in */}
          {result?.allInEquity?.players && (
            <EquityBar players={result.allInEquity.players} tableState={tableState} />
          )}

          {/* Pot Odds Tooltip — visible when hero has a call action */}
          <AnimatePresence>
            {isMyTurn && legalActions?.find(a => a.type === 'call') && (
              <PotOddsTooltip
                potTotal={tableState?.game?.potTotal || 0}
                callAmount={legalActions.find(a => a.type === 'call')?.amount || 0}
                isVisible={true}
              />
            )}
          </AnimatePresence>

          {/* Bet-to-Pot Animation */}
          <BetChipAnimation tableState={tableState} />

          {/* Floating action labels */}
          <AnimatePresence>
            {floatingLabels.map(fl => (
              <FloatingActionLabel
                key={fl.id}
                action={fl.action}
                amount={fl.amount}
                position={fl.position}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Seats — rotated so hero is always at bottom center */}
        {seats.map((seat, i) => {
          const pid = seat.player?.id;
          const _sync = noteSyncHash; // implicitly forces re-render
          const noteColorVal = pid && String(pid) !== String(userId) 
            ? (getPlayerNoteColor(pid) || (seat.player?.stats?.player_type && seat.player.stats.player_type !== 'unknown' ? NOTE_TYPE_COLORS_MAP[seat.player.stats.player_type] || '#FFD700' : null))
            : null;
          const noteTypeVal = pid && getPlayerNoteText(pid) ? 'custom_note' : seat.player?.stats?.player_type;
          // Poker position from game state (btn, sb, bb, utg, mp)
          const gamePlayer = tableState?.game?.players?.find(p => String(p.id) === String(pid));
          const gamePosition = gamePlayer?.position || null;
          // Button seat fallback
          const isButton = tableState?.game?.buttonSeat === i;
          // Use rotated visual position if hero is seated, otherwise raw index
          const visualIndex = rotatedPositionMap ? rotatedPositionMap[i] : i;
          return (
            <PlayerSeat
              key={i}
              seat={seat}
              position={positions[visualIndex] || positions[0]}
              isHero={pid != null && String(pid) === String(userId)}
              isCurrentActor={seat.isCurrentActor}
              timerState={seat.isCurrentActor ? timerState : null}
              onClick={() => setBuyInSeat(i)}
              onNote={pid && String(pid) !== String(userId) ? () => setQuickViewTarget({ id: pid, displayName: seat.player?.displayName, avatarUrl: seat.player?.avatarUrl, stack: seat.stack, stats: seat.player?.stats || {} }) : undefined}
              noteColor={noteColorVal}
              noteType={noteTypeVal}
              isWinner={result?.winners?.some(w => String(w.playerId) === String(seat.player?.id))}
              equity={result?.allInEquity?.players?.find(p => String(p.id) === String(seat.player?.id))?.equity ?? null}
              gamePosition={gamePosition || (isButton ? 'btn' : null)}
              numHoleCards={
                ({ holdem: 2, omaha4: 4, omaha5: 5, omaha6: 6, omaha_hilo: 4, short_deck: 2, pineapple: 3 })[
                tableState?.config?.variant
                ] || 2
              }
              board={tableState?.game?.communityCards || []}
              formatStack={formatStack}
              cardSortMode={cardSortMode}
              showHUD={showHUD}
              fourColorDeck={fourColorDeck}
              fallbackAvatar={seatFallbackAvatars[seat.seatIndex ?? i] ?? HERO_DEFAULT_AVATAR}
            />
          );
        })}
      </div>

      {/* G2: AutoTopUpBadge — positioned over hero's seat area */}
      {isSitting && mySeat && positions[0] && (
        <div style={{
          position: 'absolute',
          left: `calc(${positions[0].left} + 30px)`,
          top: `calc(${positions[0].top} + 50px)`,
          zIndex: 25,
        }}>
          <AutoTopUpBadge
            isOn={autoTopUpOn}
            onToggle={handleToggleAutoTopUp}
            stack={mySeat?.stack || 0}
            maxBuyIn={tableState?.config?.maxBuyIn || 0}
          />
        </div>
      )}

      {/* Tournament HUD — blind clock, level, players */}
      {(tournamentId || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tournament'))) && (
        <TournamentHUD
          tournamentId={tournamentId || new URLSearchParams(window.location.search).get('tournament')}
          userId={userId}
        />
      )}

      {/* Table alert banner (game length warning, paused, auto-removed, etc.) */}
      <AnimatePresence>
        {tableAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
              zIndex: 200, padding: '8px 20px', borderRadius: 10,
              background: tableAlert.type === 'warning' ? 'rgba(255,152,0,0.95)'
                : tableAlert.type === 'expired' ? 'rgba(244,67,54,0.95)'
                  : tableAlert.type === 'paused' ? 'rgba(33,150,243,0.95)'
                    : tableAlert.type === 'removed' ? 'rgba(244,67,54,0.95)'
                      : 'rgba(76,175,80,0.95)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {tableAlert.type === 'warning' && '▲ '}
            {tableAlert.type === 'expired' && ''}
            {tableAlert.type === 'paused' && ''}
            {tableAlert.type === 'removed' && ''}
            {tableAlert.type === 'extended' && ''}
            {tableAlert.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session summary banner (shown when standing up) */}
      <AnimatePresence>
        {sessionSummary && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              zIndex: 300, padding: '12px 24px', borderRadius: 12,
              background: sessionSummary.pnl >= 0 ? 'rgba(76,175,80,0.95)' : 'rgba(244,67,54,0.95)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)', textAlign: 'center', maxWidth: 340,
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>Session Complete</div>
            {sessionSummary.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table info bar */}
      <TableInfoBar
        tableState={tableState}
        onSitOut={handleSitOut}
        onSitIn={handleSitIn}
        onStandUp={handleStandUp}
        onAddChips={handleAddChips}
        isSitting={isSitting}
        isSittingOut={isSittingOut}
        straddleEnabled={tableState?.config?.voluntaryStraddle || tableState?.config?.straddleEnabled}
        straddleOn={straddleOn}
        onToggleStraddle={handleToggleStraddle}
        autoTopUpOn={autoTopUpOn}
        onToggleAutoTopUp={handleToggleAutoTopUp}
        autoMuckOn={autoMuck}
        onToggleAutoMuck={handleToggleAutoMuck}
        lastHandResult={lastHandResult}
        onShowLastHand={() => setShowLastHand(true)}
        sessionStats={sessionStats}
        myStack={mySeat?.stack || 0}
        sitOutNextBB={sitOutNextBB}
        onToggleSitOutNextBB={() => setSitOutNextBB(p => !p)}
        showStackInBB={showStackInBB}
        onToggleBBDisplay={handleToggleBBDisplay}
        onShowHistory={() => setShowHistoryBrowser(true)}
        cardSortMode={cardSortMode}
        onCycleCardSort={cycleCardSort}
        hapticEnabled={hapticEnabled}
        onToggleHaptic={handleToggleHaptic}
        showHUD={showHUD}
        onToggleHUD={handleToggleHUD}
        fourColorDeck={fourColorDeck}
        onToggleFourColor={handleToggleFourColor}
        onShowLeaderboard={() => setShowLeaderboard(true)}
        rabbitHuntEnabled={rabbitHuntEnabled}
        onToggleRabbitHunt={() => {
          const next = !rabbitHuntEnabled;
          setRabbitHuntEnabled(next);
          try { localStorage.setItem('poker-rabbit-hunt', String(next)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }}
        onShowKeyboard={() => setShowKbHelp(true)}
        onShowLayouts={() => setShowLayoutManager(true)}
        onShowFelt={() => setShowFeltPicker(true)}
        stackHistory={stackHistory}
        onShowActionLog={() => setShowActionLog(p => !p)}
        onShowStackGraph={() => setShowStackGraph(true)}
        onShowTableStats={() => setShowTableStats(p => !p)}
      />

      {/* ═══ PHASE 27: HAND STRENGTH INDICATOR — Premium 5-tier color bar ═══ */}
      {myCards && myCards.length > 0 && isSitting && !result?.winners && (() => {
        const board = tableState?.game?.communityCards || [];
        const strength = getHandStrength(myCards, board);
        if (!strength || !strength.label) return null;
        const cat = strength.category || 0;
        // 5-tier: 0-1 Weak (red) | 2-3 Marginal (orange) | 4-5 Medium (yellow) | 6-7 Strong (green) | 8-9 Monster (gold/diamond)
        const tiers = [
          { min: 0, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: '', label: 'Weak' },
          { min: 2, color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: '', label: 'Marginal' },
          { min: 4, color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: '', label: 'Medium' },
          { min: 6, color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: '', label: 'Strong' },
          { min: 8, color: '#FFD700', bg: 'rgba(255,215,0,0.15)', icon: '', label: 'Monster' },
        ];
        const tier = [...tiers].reverse().find(t => cat >= t.min) || tiers[0];
        const fillPct = Math.min(100, ((cat + 1) / 10) * 100);
        return (
          <motion.div
            key={tier.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: 'fixed',
              bottom: isMyTurn && legalActions ? 120 : 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              background: 'rgba(0,0,0,0.8)',
              border: `1px solid ${tier.color}30`,
              borderRadius: 14,
              padding: '4px 14px 6px',
              minWidth: 160,
              textAlign: 'center',
              backdropFilter: 'blur(10px)',
              pointerEvents: 'none',
              transition: 'bottom 0.3s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10 }}>{tier.icon}</span>
              <span style={{ color: tier.color, fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>{strength.label}</span>
            </div>
            {/* Gradient fill bar */}
            <div style={{
              width: '100%', height: 4, borderRadius: 2,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${fillPct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                  height: '100%', borderRadius: 2,
                  background: `linear-gradient(90deg, ${tier.color}80, ${tier.color})`,
                  boxShadow: `0 0 6px ${tier.color}60`,
                }}
              />
            </div>
          </motion.div>
        );
      })()}

      {/* ═══ PHASE 27: POT ODDS HUD — shows when hero faces a bet ═══ */}
      {(() => {
        const callAction = isMyTurn && legalActions?.find(a => a.type === 'call');
        if (!callAction) return null;
        const pot = tableState?.game?.pot || tableState?.game?.potTotal || 0;
        const heroSeat = seats?.find(s => s?.player?.id != null && String(s.player.id) === String(userId));
        return (
          <PotOddsHUD
            potSize={pot}
            betToCall={callAction.amount || 0}
            heroStack={heroSeat?.stack || 0}
            isVisible={true}
          />
        );
      })()}

      {/* ═══ PHASE 27: ACTION TIMELINE — horizontal pill bar of current hand actions ═══ */}
      {(() => {
        const timelineLog = tableState?.game?.actionLog || actionLog || [];
        if (!timelineLog.length || !isSitting) return null;
        return (
        <div style={{
          position: 'fixed', top: 50, left: '50%', transform: 'translateX(-50%)',
          zIndex: 90, display: 'flex', gap: 3, maxWidth: '80vw',
          overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none',
          padding: '3px 6px', backdropFilter: 'blur(8px)',
          background: 'rgba(0,0,0,0.6)', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {timelineLog.slice(-8).map((action, i) => {
            const colors = {
              bet: '#3b82f6', call: '#22c55e', raise: '#eab308',
              fold: '#6b7280', check: '#8b5cf6', allIn: '#ef4444',
            };
            const actionColor = colors[action.type] || '#666';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', borderRadius: 6, flexShrink: 0,
                background: `${actionColor}18`,
                border: `1px solid ${actionColor}30`,
              }}>
                <span style={{ color: '#B0B3B8', fontSize: 9, fontWeight: 700 }}>
                  {action.playerName?.split(' ')[0] || 'P'}
                </span>
                <span style={{ color: actionColor, fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>
                  {action.type}
                </span>
                {action.amount > 0 && (
                  <span style={{ color: '#888', fontSize: 8, fontVariantNumeric: 'tabular-nums' }}>
                    {action.amount.toLocaleString()}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        );
      })()}

      {/* ═══ YOUR TURN INDICATOR — Pulsing banner when action is on hero ═══ */}
      <AnimatePresence>
        {isMyTurn && legalActions && legalActions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'fixed',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 210,
              background: 'linear-gradient(135deg, rgba(35,116,225,0.95), rgba(99,102,241,0.95))',
              color: '#fff',
              padding: '6px 24px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              boxShadow: '0 4px 20px rgba(35,116,225,0.6)',
              animation: 'yourTurnPulse 1.2s ease-in-out infinite alternate',
            }}
          >
            YOUR TURN
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action panel (when it's hero's turn) — includes Raise/Bet + Slider */}
      <AnimatePresence>
        {isMyTurn && legalActions && (
          <ActionPanel
            actions={legalActions}
            onAction={handleAction}
            stack={mySeat?.stack || 0}
            currentBet={tableState?.game?.currentBet || 0}
            bigBlind={tableState?.config?.bigBlind || tableState?.bigBlind || 2}
            potTotal={tableState?.game?.potTotal || 0}
            street={tableState?.game?.phase || 'preflop'}
          />
        )}

        {/* Pre-action buttons: show when seated, not your turn, hand in progress */}
        {!isMyTurn && isSitting && !isSittingOut && tableState?.game?.phase && tableState.game.phase !== 'idle' && !result && (
          <PreActionPanel
            preSelectedAction={preAction}
            setPreSelectedAction={setPreAction}
            currentBet={tableState?.game?.currentBet || 0}
            myBet={mySeat?.invested || 0}
          />
        )}
      </AnimatePresence>

      {/* Pineapple discard panel */}
      <AnimatePresence>
        {tableState?.game?.phase === 'discard' && myCards && myCards.length === 3 && (
          <DiscardPanel cards={myCards} onDiscard={handleDiscard} />
        )}
      </AnimatePresence>

      {/* Chat */}
      {/* Chat — hidden when ban_chat enabled */}
      {!tableState?.config?.banChat && (
        <ChatOverlay messages={chatMessages} onSend={handleChat} players={seats?.filter(s => s?.player?.displayName).map(s => s.player.displayName) || []}
          reactions={chatReactions}
          onReact={(msgIdx, emoji) => {
            // I8: Reaction cooldown (2s per user)
            const now = Date.now();
            if (lastReactTimeRef.current && now - lastReactTimeRef.current < 2000) return;
            lastReactTimeRef.current = now;
            // G7: Play reaction sound
            try { eventBus.emit('SOUND_PLAY', { id: 'notify' }); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            // G11: Haptic feedback
            if (hapticEnabled) haptic('light');
            // G2: Broadcast reaction to other players via WebSocket
            try { send({ type: 'chat_reaction', msgIdx, emoji }); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            // Update local state
            setChatReactions(prev => {
              const msgR = { ...(prev[msgIdx] || {}) };
              msgR[emoji] = (msgR[emoji] || 0) + 1;
              return { ...prev, [msgIdx]: msgR };
            });
          }}
        />
      )}

      {/* Quick Emoji Bar — always-visible emoji buttons */}
      {isSitting && connected && (
        <QuickEmojiBar
          onSend={handleEmojiSend}
          disabled={!connected}
        />
      )}

      {/* Rabbit Hunt Overlay */}
      <AnimatePresence>
        {rabbitHuntCards && (
          <RabbitHuntOverlay
            cards={rabbitHuntCards}
            onClose={() => setRabbitHuntCards(null)}
          />
        )}
      </AnimatePresence>

      {/* H3: Win Amount Fly-Up */}
      <WinFlyUp amount={winFlyUpAmount} isVisible={winFlyUpAmount > 0} />

      {/* I15: Pot Scoop Animation */}
      <PotScoopAnimation isActive={potScoopActive} winnerPosition={potScoopTarget} />

      {/* I9: ChipStackViz near hero seat */}
      {isSitting && mySeat?.stack > 0 && tableState?.config?.bigBlind > 0 && (
        <div style={{ position: 'absolute', bottom: '28%', left: 'calc(50% + 40px)', zIndex: 25, pointerEvents: 'none' }}>
          <ChipStackViz stack={mySeat.stack} bigBlind={tableState.config.bigBlind} />
        </div>
      )}

      {/* H8: Auto-Muck Flash */}
      <AutoMuckFlash isVisible={autoMuckFlash} />

      {/* H4: Felt Color Picker Modal */}
      <AnimatePresence>
        {showFeltPicker && (
          <FeltColorPicker
            currentFelt={feltColor}
            onSelect={handleFeltChangeWithSync}
            onClose={() => setShowFeltPicker(false)}
          />
        )}
      </AnimatePresence>

      {/* H14: Stack Graph Modal */}
      <AnimatePresence>
        {showStackGraph && (
          <StackGraphModal
            history={sessionStatsRef.current?.plHistory || stackHistory}
            startingStack={sessionStatsRef.current?.startingStack || 0}
            onClose={() => setShowStackGraph(false)}
            formatStack={formatStack}
          />
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Help Overlay */}
      <AnimatePresence>
        {showKbHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowKbHelp(false)}
            style={{
              position: 'absolute', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'rgba(15,20,30,0.95)', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
                padding: '20px 28px', maxWidth: 340, width: '90%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 12, textAlign: 'center' }}>
                Keyboard Shortcuts
              </div>
              {[
                { section: 'Game Actions', keys: [
                  ['F', 'Fold'], ['C / Space', 'Check / Call'], ['A', 'All-In'],
                  ['T', 'Use Time Bank'], ['1–9', 'Bet Size (Min → Max)'],
                ]},
                { section: 'Utilities', keys: [
                  ['S', 'Sit Out / Sit In'], ['M', 'Toggle Auto-Muck'],
                  ['H', 'Toggle HUD'], ['L', 'Last Hand Replayer'],
                  ['? or /', 'This Help'], ['Esc', 'Close All Panels'],
                ]},
                // I10: Wave F panel shortcuts
                { section: 'Panels (Shift+key)', keys: [
                  ['⇧L', 'Action Log'], ['⇧G', 'Stack Graph'],
                  ['⇧T', 'Table Stats'],
                ]},
                // K13: Wave H/I/J shortcuts
                { section: 'Settings & Views', keys: [
                  ['V', 'Toggle Sound'], ['P', 'Felt Color Picker'],
                  ['⇧S', 'Session Stats'], ['⇧H', 'Layout Manager'],
                ]},
              ].map(group => (
                <div key={group.section} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                    {group.section}
                  </div>
                  {group.keys.map(([key, desc]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{
                        background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 10,
                        fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.15)',
                        minWidth: 36, textAlign: 'center',
                      }}>{key}</span>
                      <span style={{ fontSize: 11, color: T.textSecondary, flex: 1, marginLeft: 10 }}>{desc}</span>
                    </div>
                  ))}
                </div>
              ))}
              <button
                onClick={() => setShowKbHelp(false)}
                style={{
                  width: '100%', marginTop: 8, background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                  color: T.textSecondary, padding: '6px 0', fontSize: 11,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >Close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ WAVE B: TABLE LEADERBOARD OVERLAY ═══ */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLeaderboard(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 250,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: '#18191a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16, width: 360, maxWidth: '92vw',
                maxHeight: '80vh', overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              }}
            >
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Session Leaderboard</span>
                <button
                  onClick={() => setShowLeaderboard(false)}
                  style={{ background: 'none', border: 'none', color: '#65676B', fontSize: 20, cursor: 'pointer', padding: 0 }}
                >✕</button>
              </div>
              <div style={{ padding: 16, overflowY: 'auto', maxHeight: '55vh' }}>
                {(() => {
                  const seats = tableState?.seats || [];
                  const ranked = seats
                    .filter(s => s.player?.id && s.status !== 'empty')
                    .map(s => ({
                      name: s.player.displayName || 'Player',
                      stack: s.stack || 0,
                      buyIn: s.stats?.initialBuyIn || s.stack,
                      pnl: (s.stack || 0) - (s.stats?.initialBuyIn || s.stack),
                      hands: s.stats?.handsPlayed || 0,
                    }))
                    .sort((a, b) => b.pnl - a.pnl);
                  if (ranked.length === 0) {
                    return <div style={{ color: '#65676B', textAlign: 'center', fontSize: 13 }}>No players seated</div>;
                  }
                  return ranked.map((p, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 4,
                      background: i === 0 ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)',
                      border: i === 0 ? '1px solid rgba(255,215,0,0.2)' : '1px solid transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#65676B', fontSize: 14, fontWeight: 800, width: 24 }}>
                          {`#${i + 1}`}
                        </span>
                        <span style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: p.pnl >= 0 ? '#4ade80' : '#ef4444', fontSize: 14, fontWeight: 700 }}>
                          {p.pnl >= 0 ? '+' : ''}{p.pnl.toLocaleString()}
                        </div>
                        <div style={{ color: '#65676B', fontSize: 10 }}>{p.hands}h | Stack: {p.stack.toLocaleString()}</div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Observer / Waitlist bar — shown when NOT seated */}
      {!isSitting && buyInSeat === null && tableState && (
        <ObserverBar
          tableState={tableState}
          userId={userId}
          send={send}
          onClickSeat={(idx) => setBuyInSeat(idx)}
          seatOffer={seatOffer}
        />
      )}

      {/* Buy-in dialog */}
      <AnimatePresence>
        {buyInSeat !== null && (
          <BuyInDialog
            minBuyIn={tableState?.config?.minBuyIn || 40}
            maxBuyIn={
              clubChipBalance !== null
                ? Math.min(tableState?.config?.maxBuyIn || 200, clubChipBalance)
                : (tableState?.config?.maxBuyIn || 200)
            }
            bigBlind={tableState?.config?.bigBlind || tableState?.bigBlind || 2}
            chipBalance={clubChipBalance}
            isClubTable={!!tableState?.clubId}
            onConfirm={handleSitDown}
            onCancel={() => setBuyInSeat(null)}
          />
        )}
      </AnimatePresence>

      {/* Rebuy / Add Chips modal */}
      <AnimatePresence>
        {showRebuy && (
          <RebuyModal
            currentStack={mySeat?.stack || 0}
            maxBuyIn={tableState?.config?.maxBuyIn || 200}
            chipBalance={rebuyBalance}
            loading={rebuyBalanceLoading}
            error={rebuyError}
            onConfirm={handleRebuyConfirm}
            onCancel={() => { setShowRebuy(false); setRebuyError(null); }}
          />
        )}
      </AnimatePresence>

      {/* ═══════════ BBJ TICKER (top of table) ═══════════ */}
      {tableState?.bbjPool > 0 && (
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(90deg, rgba(255,215,0,0.15), rgba(255,215,0,0.25), rgba(255,215,0,0.15))',
          border: '1px solid rgba(255,215,0,0.4)',
          borderRadius: 20, padding: '3px 16px', zIndex: 55,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 12 }}></span>
          <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 700 }}>
            BAD BEAT JACKPOT
          </span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>
            {Number(tableState.bbjPool).toLocaleString()}
          </span>
        </div>
      )}

      {/* ═══════════ P13-1: HUD MESSENGER TOGGLE (Top Right) ═══════════ */}
      <button
        onClick={() => {
          setIsMessengerOpen(o => !o);
          if (!isMessengerOpen) setMessengerBadgeCount(0);
        }}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 60,
          background: isMessengerOpen ? 'rgba(45, 136, 255, 0.9)' : 'rgba(0,0,0,0.6)',
          border: `1px solid ${isMessengerOpen ? '#2D88FF' : 'rgba(255,255,255,0.2)'}`,
          backdropFilter: 'blur(8px)', borderRadius: '50%', width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
          boxShadow: isMessengerOpen ? '0 0 12px rgba(45, 136, 255, 0.4)' : 'none',
        }}
        title="Open Messenger"
      >
        <div style={{ fontSize: 16 }}></div>
        {messengerBadgeCount > 0 && !isMessengerOpen && (
          <div style={{
            position: 'absolute', top: -4, right: -4, background: '#FF3B30',
            color: '#fff', fontSize: 9, fontWeight: 800, width: 16, height: 16,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #111',
          }}>
            {messengerBadgeCount > 9 ? '9+' : messengerBadgeCount}
          </div>
        )}
      </button>

      {/* ═══════════ BBJ WIN CELEBRATION ═══════════ */}
      <AnimatePresence>
        {result?.bbj && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              border: '3px solid #FFD700', borderRadius: 16,
              padding: '32px 48px', textAlign: 'center', maxWidth: 460,
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}></div>
              <h2 style={{ color: '#FFD700', fontSize: 26, margin: '0 0 8px', fontWeight: 800 }}>
                BAD BEAT JACKPOT!
              </h2>
              <p style={{ color: '#fff', fontSize: 15, margin: '4px 0' }}>
                {result.bbj.loserHand} <span style={{ color: '#FA383E' }}>loses to</span> {result.bbj.winnerHand}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, margin: '16px 0' }}>
                <div>
                  <div style={{ color: '#B0B3B8', fontSize: 11 }}>Loser Wins</div>
                  <div style={{ color: '#FFD700', fontSize: 20, fontWeight: 700 }}>
                    {Number(result.bbj.loserPayout || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#B0B3B8', fontSize: 11 }}>Winner Wins</div>
                  <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 700 }}>
                    {Number(result.bbj.winnerPayout || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#B0B3B8', fontSize: 11 }}>Table Share</div>
                  <div style={{ color: '#60a5fa', fontSize: 20, fontWeight: 700 }}>
                    {Number(result.bbj.tableSharePayout || 0).toLocaleString()}
                  </div>
                </div>
              </div>
              <p style={{ color: '#B0B3B8', fontSize: 11 }}>
                Total: {Number(result.bbj.totalPayout || 0).toLocaleString()}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ ANIMATED THROWABLES (premium-style) ═══════════ */}
      <ThrowableEmojis
        userId={userId}
        seats={seats}
        seatPositions={positions}
        chatMessages={chatMessages}
        onThrow={(throwable, targetId) => {
          soundRef.current?.play('chat');
          send('throw_emoji', { emoji: throwable, throwable, targetId });
        }}
      />

      {/* ═══════════ PHASE 26: LIVE STATS DASHBOARD ═══════════ */}
      <LiveStatsDashboard
        isOpen={showStatsPanel}
        onClose={() => setShowStatsPanel(false)}
        stats={sessionStatsSnap}
      />
      
      {/* Stats Toggle Button — top-right, beside existing HUD controls */}
      <div style={{ position: 'absolute', top: 8, right: showStatsPanel ? 276 : 8, zIndex: 55, transition: 'right 0.3s ease' }}>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowStatsPanel(s => !s)}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: showStatsPanel ? '#2374E1' : 'rgba(0,0,0,0.6)',
            color: showStatsPanel ? '#fff' : '#B0B3B8',
            fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
          }}
          title="Session Statistics"
        ></motion.button>
      </div>

      {/* ═══════════ TABLE THEME PICKER ═══════════ */}
      <ThemePicker
        currentThemeId={themeId}
        onThemeChange={handleThemeChange}
        currentCardBack={cardBack}
        onCardBackChange={handleCardBackChange}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        fourColorDeck={fourColorDeck}
        onToggleFourColor={handleToggleFourColor}
        hapticEnabled={hapticEnabled}
        onToggleHaptic={handleToggleHaptic}
      />

      {/* ═══ THEME PRESETS ═══ */}
      <ThemePresetBar
        onSave={() => {
          const name = prompt('Preset name:');
          if (!name?.trim()) return;
          try {
            const presets = JSON.parse(localStorage.getItem('poker-theme-presets') || '[]');
            presets.push({
              name: name.trim(),
              themeId, cardBack, soundEnabled, fourColorDeck, hapticEnabled,
              showHUD, showStackInBB, autoMuck, soundVolume,
              createdAt: Date.now(),
            });
            localStorage.setItem('poker-theme-presets', JSON.stringify(presets));
            eventBus.emit('DATA_MUTATED', 'theme_preset_saved');
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }}
        onLoad={(preset) => {
          if (preset.themeId) handleThemeChange(preset.themeId);
          if (preset.cardBack) handleCardBackChange(preset.cardBack);
          if (preset.soundEnabled !== undefined) { setSoundEnabled(preset.soundEnabled); localStorage.setItem('poker-sound', preset.soundEnabled ? 'on' : 'off'); }
          if (preset.fourColorDeck !== undefined) { setFourColorDeck(preset.fourColorDeck); localStorage.setItem('poker-four-color-deck', String(preset.fourColorDeck)); }
          if (preset.hapticEnabled !== undefined) { setHapticEnabled(preset.hapticEnabled); localStorage.setItem('poker-haptic', String(preset.hapticEnabled)); }
          if (preset.showHUD !== undefined) { setShowHUD(preset.showHUD); localStorage.setItem('poker-show-hud', String(preset.showHUD)); }
          if (preset.showStackInBB !== undefined) { setShowStackInBB(preset.showStackInBB); localStorage.setItem('poker-bb-display', String(preset.showStackInBB)); }
          if (preset.soundVolume !== undefined) { setSoundVolume(preset.soundVolume); localStorage.setItem('poker-sound-volume', String(preset.soundVolume)); }
          eventBus.emit('DATA_MUTATED', 'theme_preset_loaded');
        }}
        onDelete={(idx) => {
          try {
            const presets = JSON.parse(localStorage.getItem('poker-theme-presets') || '[]');
            presets.splice(idx, 1);
            localStorage.setItem('poker-theme-presets', JSON.stringify(presets));
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }}
      />

      {showHistoryBrowser && (
        <HandHistoryBrowser
          tableId={tableId}
          userId={userId}
          onClose={() => setShowHistoryBrowser(false)}
        />
      )}

      {/* Table Layout Manager */}
      <AnimatePresence>
        {showLayoutManager && (
          <TableLayoutManager onClose={() => setShowLayoutManager(false)} />
        )}
      </AnimatePresence>

      {/* ═══════════ INSURANCE OFFER OVERLAY ═══════════ */}
      <AnimatePresence>
        {result?.insuranceOffer && String(result.insuranceOffer.leaderId) === String(userId) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(36,37,38,0.97)', border: '1px solid rgba(24,119,242,0.5)',
              borderRadius: 14, padding: '16px 24px', zIndex: 85, width: 320,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}></span>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: '4px 0' }}>Insurance Available</h3>
              <p style={{ color: '#B0B3B8', fontSize: 12, margin: 0 }}>
                You&apos;re ahead! Protect against {result.insuranceOffer.trailerEquity}% equity ({result.insuranceOffer.estimatedOuts} outs)
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#65676B', fontSize: 10 }}>Pot</div>
                <div style={{ color: '#FFD700', fontSize: 16, fontWeight: 700 }}>{(result.insuranceOffer.totalPot || 0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#65676B', fontSize: 10 }}>Max Insure</div>
                <div style={{ color: '#4ade80', fontSize: 16, fontWeight: 700 }}>{(result.insuranceOffer.maxInsurance || 0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#65676B', fontSize: 10 }}>Premium Rate</div>
                <div style={{ color: '#60a5fa', fontSize: 16, fontWeight: 700 }}>{((result.insuranceOffer.premiumRate || 0) * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0.25, 0.5, 1].map(pct => {
                const amt = Math.floor((result.insuranceOffer.maxInsurance || 0) * pct);
                return (
                  <button key={pct} onClick={() => send('buy_insurance', { amount: amt })} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none',
                    background: '#1877F2', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    {amt.toLocaleString()} ({Math.round(pct * 100)}%)
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => send('decline_insurance')}
              style={{
                width: '100%', marginTop: 8, padding: '8px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
                color: '#B0B3B8', fontSize: 12, cursor: 'pointer',
              }}
            >
              No Insurance
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ RUN IT MULTIPLE OVERLAY ═══════════ */}
      <AnimatePresence>
        {result?.runItMultiple && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(36,37,38,0.95)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 14, padding: '12px 20px', zIndex: 75, minWidth: 300,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ textAlign: 'center', marginBottom: 8 }}
            >
              <span style={{ fontSize: 14, color: '#FFD700', fontWeight: 700 }}>
                Run It {result.runItMultiple.numBoards === 2 ? 'Twice' : 'Three Times'}
              </span>
            </motion.div>
            {/* Board split divider animation */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ delay: 0.3, duration: 0.5 }}
              style={{ height: 2, background: 'linear-gradient(90deg, transparent, #FFD700, transparent)', marginBottom: 8, borderRadius: 1 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {(result.runItMultiple.boards || []).map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: i === 0 ? -30 : 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.2, type: 'spring', stiffness: 200 }}
                  style={{
                    background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: '8px 12px',
                    border: `1px solid ${b.isWinner ? '#FFD700' : 'rgba(255,255,255,0.1)'}`,
                    textAlign: 'center', minWidth: 80,
                    boxShadow: b.isWinner ? '0 0 12px rgba(255,215,0,0.3)' : 'none',
                  }}
                >
                  <div style={{ color: '#B0B3B8', fontSize: 10, marginBottom: 4 }}>Board {b.boardIndex}</div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 4 }}>
                    {(b.cards || []).slice(-5).map((card, ci) => (
                      <motion.span
                        key={ci}
                        initial={{ opacity: 0, rotateY: 180 }}
                        animate={{ opacity: 1, rotateY: 0 }}
                        transition={{ delay: 0.7 + i * 0.2 + ci * 0.1 }}
                        style={{
                          display: 'inline-block', background: '#fff', color: (typeof card === 'string' && (card.includes('h') || card.includes('d'))) ? '#e53935' : '#000',
                          borderRadius: 3, padding: '1px 3px', fontSize: 10, fontWeight: 700,
                          border: '1px solid #ddd',
                        }}
                      >
                        {typeof card === 'string' ? card : card?.display || '?'}
                      </motion.span>
                    ))}
                  </div>
                  <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 700 }}>
                    {(b.payout || 0).toLocaleString()}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ ALL-IN EQUITY DISPLAY ═══════════ */}
      {result?.allInEquity && Array.isArray(result.allInEquity) && result.allInEquity.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '18%', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6, zIndex: 70, padding: '6px 12px',
          background: 'rgba(0,0,0,0.85)', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {result.allInEquity.map((eq, i) => {
            const pct = typeof eq === 'object' ? (eq.equity || eq.winPct || 0) : eq;
            const pid = typeof eq === 'object' ? eq.playerId : null;
            const colors = ['#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#38bdf8'];
            return (
              <div key={i} style={{ textAlign: 'center', minWidth: 50 }}>
                <div style={{ fontSize: 9, color: '#B0B3B8', marginBottom: 2 }}>
                  {pid ? (tableState?.seats?.find(s => s?.player?.id === pid)?.player?.displayName?.slice(0, 8) || `P${i + 1}`) : `P${i + 1}`}
                </div>
                <div style={{
                  width: 50, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden',
                }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: colors[i % colors.length], borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors[i % colors.length], marginTop: 2 }}>
                  {(pct || 0).toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ SEVEN-DEUCE BONUS ═══════════ */}
      <AnimatePresence>
        {result?.sevenDeuceBonus && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            style={{
              position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, rgba(36,37,38,0.97), rgba(60,40,0,0.97))',
              border: '2px solid #FFD700', borderRadius: 16, padding: '16px 28px',
              zIndex: 80, textAlign: 'center', boxShadow: '0 0 40px rgba(255,215,0,0.3)',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}></div>
            <div style={{ color: '#FFD700', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              7-2 BONUS!
            </div>
            <div style={{ color: '#E4E6EB', fontSize: 13 }}>
              {result.sevenDeuceBonus.winnerName || 'Player'} wins{' '}
              <span style={{ color: '#4ade80', fontWeight: 700 }}>
                {(result.sevenDeuceBonus.bonus || 0).toLocaleString()}
              </span>
              {' '}with 7-2 offsuit!
            </div>
            {result.sevenDeuceBonus.payers?.length > 0 && (
              <div style={{ color: '#B0B3B8', fontSize: 11, marginTop: 4 }}>
                {result.sevenDeuceBonus.perPlayer?.toLocaleString()} each from {result.sevenDeuceBonus.payers.length} player{result.sevenDeuceBonus.payers.length > 1 ? 's' : ''}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ BOMB POT OVERLAY + CHIP ANIMATION ═══════════ */}
      <AnimatePresence>
        {tableState?.bombPot && (
          <motion.div
            initial={{ opacity: 0, scale: 2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, type: 'spring' }}
            style={{
              position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
              zIndex: 85, textAlign: 'center', pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 48 }}></div>
            <div style={{
              color: '#FF6B35', fontSize: 22, fontWeight: 900, textShadow: '0 2px 10px rgba(255,107,53,0.5)',
              letterSpacing: 3,
            }}>
              BOMB POT
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ BOMB POT CHIP FLY ANIMATION (Enhanced — stacked triple tokens with glow trail) ═══ */}
      <AnimatePresence>
        {tableState?.bombPot && seats && seats.map((seat, i) => {
          if (!seat.player?.id || seat.status === 'empty') return null;
          const visualIndex = rotatedPositionMap ? rotatedPositionMap[i] : i;
          const pos = positions[visualIndex];
          if (!pos) return null;
          return (
            <motion.div
              key={`bp-chip-${i}`}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: (50 - pos.x) * 3,
                y: (38 - pos.y) * 3,
                opacity: 0,
                scale: 0.5,
              }}
              transition={{ duration: 1, delay: i * 0.1, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                left: `${pos.x}%`, top: `${pos.y}%`,
                width: 26, height: 26,
                zIndex: 84, pointerEvents: 'none',
              }}
            >
              {/* Stacked 3-chip token */}
              {[0, 1, 2].map(ci => (
                <div
                  key={ci}
                  style={{
                    position: 'absolute',
                    top: ci * -3, left: ci * 1,
                    width: 22, height: 22, borderRadius: '50%',
                    background: ci === 0 ? 'radial-gradient(circle, #FFD700 30%, #FF6B35 100%)'
                      : ci === 1 ? 'radial-gradient(circle, #FF9800 30%, #E65100 100%)'
                      : 'radial-gradient(circle, #FFC107 30%, #FF8F00 100%)',
                    border: '2px solid rgba(255,255,255,0.8)',
                    boxShadow: `0 0 ${8 + ci * 4}px rgba(255,215,0,${0.4 + ci * 0.2})`,
                  }}
                />
              ))}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* ═══ PRE-ACTION FIRED TOAST ═══ */}
      <AnimatePresence>
        {preActionFired && (
          <motion.div
            key={`pa-${preActionFired.ts}`}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute', bottom: '18%', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(78,205,196,0.4)',
              borderRadius: 10, padding: '8px 20px', zIndex: 88,
              color: '#4ECDC4', fontSize: 13, fontWeight: 800,
              letterSpacing: 0.5, whiteSpace: 'nowrap',
              boxShadow: '0 4px 16px rgba(78,205,196,0.2)',
            }}
          >
            ✓ Auto-{preActionFired.action === 'fold' ? 'Folded' : preActionFired.action === 'check' ? 'Checked' : preActionFired.action === 'call' ? 'Called' : preActionFired.action.charAt(0).toUpperCase() + preActionFired.action.slice(1) + 'ed'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ WAITLIST OVERLAY (table full, not seated) ═══ */}
      {tableFull && !isSitting && userId && (
        <div style={{
          position: 'absolute', bottom: '8%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 90, textAlign: 'center',
        }}>
          {waitlistState.onWaitlist ? (
            <div style={{
              background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,152,0,0.5)',
              borderRadius: 12, padding: '10px 24px',
              boxShadow: '0 4px 20px rgba(255,152,0,0.2)',
            }}>
              <div style={{ color: '#FF9800', fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
                Waitlist Position #{waitlistState.position || '?'}
              </div>
              <div style={{ color: '#B0B3B8', fontSize: 11, marginBottom: 8 }}>
                You will be notified when a seat opens
              </div>
              <button
                onClick={handleLeaveWaitlist}
                disabled={waitlistState.loading}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 8, color: '#E4E6EB', fontSize: 11, fontWeight: 600,
                  padding: '5px 16px', cursor: 'pointer',
                }}
              >
                {waitlistState.loading ? '...' : 'Leave Waitlist'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleJoinWaitlist}
              disabled={waitlistState.loading}
              style={{
                background: 'linear-gradient(135deg, #FF9800, #F57C00)',
                border: 'none', borderRadius: 12, color: '#fff',
                fontSize: 14, fontWeight: 800, padding: '12px 28px',
                cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,152,0,0.4)',
                letterSpacing: 0.5,
              }}
            >
              {waitlistState.loading ? 'Joining...' : 'Join Waitlist'}
            </button>
          )}
        </div>
      )}

      {/* ═══ RUN-IT MULTIPLE PROMPT (Backend Driven) ═══ */}
      <AnimatePresence>
        {isRitOfferActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, rgba(36,37,38,0.97), rgba(25,25,35,0.97))',
              border: '2px solid #a855f7', borderRadius: 16, padding: '20px 32px',
              zIndex: 92, textAlign: 'center',
              boxShadow: '0 0 40px rgba(168,85,247,0.3)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}></div>
            <div style={{ color: '#a855f7', fontSize: 18, fontWeight: 800, marginBottom: 4, letterSpacing: 1 }}>
              {isRitProposer ? 'YOU HAVE THE BEST HAND' : 'RUN IT MULTIPLE TIMES?'}
            </div>
            <div style={{ color: '#B0B3B8', fontSize: 12, marginBottom: 6 }}>
              {isRitProposer ? 'Choose how many boards to run:' : 'The leader proposes multiple boards. Accept or decline.'}
            </div>

            {/* Countdown timer bar */}
            {ritCountdown > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: ritCountdown <= 5 ? '#ef4444' : '#a855f7', fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{ritCountdown}s</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: `${(ritCountdown / (offer?.deadline || 15)) * 100}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{
                      height: '100%', borderRadius: 4,
                      background: ritCountdown <= 5
                        ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                        : 'linear-gradient(90deg, #a855f7, #7c3aed)',
                    }}
                  />
                </div>
              </div>
            )}
            
            {isRitProposer ? (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={() => handleRITResponse('once')}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 10, color: '#E4E6EB', fontSize: 14, fontWeight: 700, padding: '10px 20px', cursor: 'pointer',
                  }}
                >
                  Just Once
                </button>
                <button
                  onClick={() => handleRITResponse('twice')}
                  style={{
                    background: 'linear-gradient(135deg, #a855f7, #9333ea)', border: 'none',
                    borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 800, padding: '10px 20px', cursor: 'pointer',
                  }}
                >
                  Twice
                </button>
                <button
                  onClick={() => handleRITResponse('thrice')}
                  style={{
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none',
                    borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 800, padding: '10px 20px', cursor: 'pointer',
                  }}
                >
                  Three Times
                </button>
              </div>
            ) : isRitResponder ? (
              offer.proposal ? (
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button
                    onClick={() => handleRITResponse('accept')}
                    style={{
                      background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none',
                      borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 800, padding: '10px 28px', cursor: 'pointer',
                    }}
                  >
                    Accept {offer.proposal === 'thrice' ? '3x' : '2x'}
                  </button>
                  <button
                    onClick={() => handleRITResponse('decline')}
                    style={{
                      background: 'rgba(255,255,255,0.1)', border: '1px solid #ef4444',
                      borderRadius: 10, color: '#ef4444', fontSize: 14, fontWeight: 700, padding: '10px 28px', cursor: 'pointer',
                    }}
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <div style={{ color: '#fff', fontSize: 14 }}>Waiting for proposer to choose...</div>
              )
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => {
          if (soundRef.current) {
            soundRef.current.setEnabled(!soundRef.current.enabled);
          }
        }}
        style={{
          position: 'absolute', bottom: 8, right: 8, zIndex: 55,
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', borderRadius: 20, padding: '4px 10px',
          fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {soundRef.current?.enabled !== false ? '' : ''} Sound
      </button>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'absolute',
              top: 50,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(220,38,38,0.9)',
              color: '#fff',
              padding: '8px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              zIndex: 60,
            }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting state */}
      {!tableState && !connected && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.textSecondary,
            fontSize: 16,
          }}
        >
          Connecting to table...
        </div>
      )}

      {/* Mid-game reconnection banner */}
      {tableState && !connected && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(250, 56, 62, 0.9)',
            color: '#fff',
            padding: '8px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          Reconnecting...
        </div>
      )}

      {/* ═══════════ LAST HAND REVIEW POPUP (DVR) ═══════════ */}
      <AnimatePresence>
        {showLastHand && lastHandResult?.handId && (
          <HandReplayerModal
            handId={lastHandResult.handId}
            supabase={supabase}
            currentUserId={userId}
            cardBackPath={cardBackPath}
            tableId={tableId}
            clubId={tableState?.clubId}
            onClose={() => setShowLastHand(false)}
          />
        )}
      </AnimatePresence>

      {/* ═══════════ PHASE 23: TABLE EXPERIENCE COMPONENTS ═══════════ */}
      
      {/* #9: Connection Quality HUD — top-left corner */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 50, display: 'flex', gap: 6, alignItems: 'center' }}>
        <ConnectionQualityHUD connected={connected} latency={wsLatency} />
        {/* #6: Spectator Badge */}
        <SpectatorBadge count={tableState?.spectatorCount || 0} />
      </div>

      {/* #4: Custom Emoji Bar — bottom-right toggle */}
      <div style={{ position: 'absolute', bottom: 180, right: 12, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <AnimatePresence>
          {showEmojiBar && <TableEmojiBar onSend={handleEmojiSend} disabled={!connected} />}
        </AnimatePresence>
        <button
          onClick={() => setShowEmojiBar(s => !s)}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none',
            background: showEmojiBar ? '#2374E1' : 'rgba(0,0,0,0.6)',
            color: '#fff', fontSize: 18, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
          title="Table Reactions"
        >

        </button>
      </div>

      {/* #4: Floating Emoji Reactions */}
      <AnimatePresence>
        {floatingReactions.map(r => (
          <FloatingReaction
            key={r.id}
            emoji={r.emoji}
            onComplete={() => setFloatingReactions(prev => prev.filter(x => x.id !== r.id))}
          />
        ))}
      </AnimatePresence>

      {/* #7: Reconnection Overlay */}
      <ReconnectionOverlay
        disconnectedAt={disconnectedAt}
        onForceReconnect={() => { setDisconnectedAt(null); window.location.reload(); }}
      />

      {/* #3: Session Summary Modal */}
      <AnimatePresence>
        {showSessionSummary && (
          <SessionSummaryModal
            stats={{
              handsPlayed: sessionStats?.handsPlayed || 0,
              netPnl: sessionStats?.totalAdded || 0,
              initialBuyIn: sessionStats?.initialBuyIn || 0,
              totalAdded: sessionStats?.totalAdded || 0,
              sessionStart: sessionStats?.sessionStart,
              biggestPot,
              handsWon,
              vpipCount,
              vpipPct: sessionStats?.handsPlayed > 0 ? Math.round((vpipCount / sessionStats.handsPlayed) * 100) : 0,
              winRate: sessionStats?.handsPlayed > 0 ? Math.round((handsWon / sessionStats.handsPlayed) * 100) : 0,
            }}
            onClose={() => {
              // Persist session stats to Supabase before leaving
              try {
                const snap = sessionStatsRef.current;
                supabase?.auth?.getSession?.().then(({ data }) => {
                  const token = data?.session?.access_token;
                  if (token && snap.handsPlayed > 0) {
                    fetch('/api/poker/engine/session-stats', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ tableId, clubId: tableState?.clubId, stats: snap }),
                    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                  }
                }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                // Clear localStorage session
                try { localStorage.removeItem(`poker-session-${tableId}`); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
              } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
              setShowSessionSummary(false);
              onLeave?.();
            }}
            onShare={handleShareSession}
          />
        )}
      </AnimatePresence>

      {/* Hand History Drawer */}
      <HandHistoryDrawer
        isOpen={showHandHistory}
        onClose={() => setShowHandHistory(false)}
        hands={handHistory}
        formatStack={formatStack}
      />

      {/* F2: Action Log Feed */}
      <AnimatePresence>
        {showActionLog && (
          <ActionLogFeed
            entries={actionLog}
            isOpen={showActionLog}
            onClose={() => setShowActionLog(false)}
          />
        )}
      </AnimatePresence>


      {/* F4: Table Stats Banner */}
      <AnimatePresence>
        {showTableStats && (
          <TableStatsBanner
            sessionStats={sessionStatsSnap}
            tableState={tableState}
            isOpen={showTableStats}
            onClose={() => setShowTableStats(false)}
          />
        )}
      </AnimatePresence>

      {/* F5: Run It Twice Prompt */}
      <AnimatePresence>
        <RunItTwicePrompt
          visible={showRIT}
          onAccept={() => { send({ type: 'run_it_twice', accept: true }); setShowRIT(false); }}
          onDecline={() => { send({ type: 'run_it_twice', accept: false }); setShowRIT(false); }}
        />
      </AnimatePresence>

      {/* G9: RIT Dual-Board Visual Result + I7: Auto-dismiss after 6s */}
      <AnimatePresence>
        {tableState?.game?.ritResult && (() => {
          const rit = tableState.game.ritResult;
          const board1 = rit.board1 || [];
          const board2 = rit.board2 || [];
          const heroWon1 = rit.winner1 && String(rit.winner1) === String(userId);
          const heroWon2 = rit.winner2 && String(rit.winner2) === String(userId);
          return (
            <motion.div
              key="rit-result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
                background: 'rgba(15,15,25,0.96)', backdropFilter: 'blur(16px)',
                borderRadius: 16, border: '1px solid rgba(79,195,247,0.2)',
                padding: '16px 24px', zIndex: 95, textAlign: 'center',
                boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: '#E4E6EB', marginBottom: 12 }}>Run It Twice — Results</div>
              {/* I7: Auto-dismiss countdown bar */}
              <div style={{ width: '100%', height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 10, overflow: 'hidden' }}>
                <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 6, ease: 'linear' }}
                  style={{ height: '100%', borderRadius: 1, background: 'rgba(79,195,247,0.5)' }} />
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[{ board: board1, won: heroWon1, label: 'Board 1' }, { board: board2, won: heroWon2, label: 'Board 2' }].map((b, bi) => (
                  <div key={bi} style={{
                    padding: '8px 12px', borderRadius: 10,
                    border: `2px solid ${b.won ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.3)'}`,
                    background: b.won ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.05)',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: b.won ? '#4ade80' : '#ef5350', marginBottom: 6 }}>
                      {b.label} {b.won ? '✓ WIN' : '✕'}
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {b.board.map((card, ci) => (
                        <motion.div key={ci}
                          initial={{ rotateY: 90, opacity: 0 }}
                          animate={{ rotateY: 0, opacity: 1 }}
                          transition={{ delay: bi * 0.3 + ci * 0.1, duration: 0.3 }}
                          style={{
                            width: 24, height: 34, borderRadius: 4,
                            background: 'linear-gradient(135deg, #1a1a3e, #2a2a4e)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 800,
                            color: typeof card === 'string' && (card.includes('h') || card.includes('d')) ? '#e53935' : '#fff',
                          }}
                        >
                          {typeof card === 'string' ? card : '?'}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Seat Open Flash */}
      <AnimatePresence>
        {seatOpenFlash && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            style={{
              position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff', padding: '10px 24px', borderRadius: 12,
              fontSize: 14, fontWeight: 800, zIndex: 250,
              boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            A seat opened up! Buy in now. {seatCountdown > 0 && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>({seatCountdown}s)</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ SPIN MULTIPLIER REVEAL ═══════════ */}
      <AnimatePresence>
        {spinReveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.9) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.3 }}
              style={{
                width: 160, height: 160, borderRadius: '50%',
                background: 'radial-gradient(circle, #FFD700 0%, #FF8C00 50%, #B8860B 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 60px rgba(255,215,0,0.6), 0 0 120px rgba(255,215,0,0.3)',
                border: '4px solid rgba(255,255,255,0.3)',
              }}
            >
              <motion.span
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, type: 'spring', stiffness: 200 }}
                style={{ fontSize: 48, fontWeight: 900, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
              >
                {spinReveal.multiplier}x
              </motion.span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              style={{ marginTop: 20, fontSize: 18, fontWeight: 700, color: '#FFD700', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
            >
              SPIN & GO
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ SOUND CONTROLS ═══════════ */}
      <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 250 }}>
        <button
          onClick={handleToggleSound}
          onContextMenu={(e) => { e.preventDefault(); setShowSoundPanel(p => !p); }}
          onDoubleClick={() => setShowSoundPanel(p => !p)}
          style={{
            background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
          title="Tap: mute/unmute • Double-tap: volume"
        >
          {soundEnabled ? '' : ''}
        </button>
        {showSoundPanel && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '12px 14px', width: 180,
            backdropFilter: 'blur(20px)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#B0B3B8', marginBottom: 8, textTransform: 'uppercase' }}>Volume</div>
            <input
              type="range" min="0" max="100" step="5"
              value={Math.round(soundVolume * 100)}
              onChange={(e) => setSoundVolume(parseInt(e.target.value) / 100)}
              style={{ width: '100%', accentColor: '#2374E1', marginBottom: 6 }}
            />
            <div style={{ fontSize: 11, color: '#E4E6EB', textAlign: 'center' }}>{Math.round(soundVolume * 100)}%</div>
            <button
              onClick={() => setShowSoundPanel(false)}
              style={{ width: '100%', marginTop: 8, background: '#3E4042', color: '#E4E6EB', border: 'none', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* ═══════════ ADMIN TABLE PANEL ═══════════ */}
      {isAdmin && (
        <button onClick={() => setShowAdminPanel(!showAdminPanel)} style={{
          position: 'fixed', top: 8, right: 52, zIndex: 250,
          background: showAdminPanel ? '#FA383E' : 'rgba(35,116,225,0.85)',
          color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {showAdminPanel ? '✕ Close' : 'Admin'}
        </button>
      )}
      <AnimatePresence>
        {showAdminPanel && isAdmin && (
          <AdminTablePanel
            tableId={tableId}
            clubId={tableState?.clubId}
            tableState={tableState}
            seats={seats}
            userId={userId}
            userRole={userRole}
            send={send}
            onClose={() => setShowAdminPanel(false)}
            supabase={supabase}
          />
        )}
      </AnimatePresence>

      {/* ═══════════ PLAYER QUICK-VIEW STAT CARD ═══════════ */}
      <PlayerQuickView
        player={quickViewTarget}
        isOpen={!!quickViewTarget}
        onClose={() => setQuickViewTarget(null)}
        onOpenNotes={() => {
          const target = quickViewTarget;
          setQuickViewTarget(null);
          setNoteTarget({ id: target.id, displayName: target.displayName });
        }}
        note={quickViewTarget ? { text: getPlayerNoteText(quickViewTarget.id), color_label: getPlayerNoteColor(quickViewTarget.id) } : null}
      />

      {/* ═══════════ PLAYER NOTES MODAL ═══════════ */}
      <PlayerNoteModal
        isOpen={!!noteTarget}
        onClose={() => {
          setNoteTarget(null);
          // Refresh notes after close
          if (userId && seats?.length) {
            const opIds = seats.filter(s => s.player?.id && String(s.player.id) !== String(userId)).map(s => s.player.id);
            if (opIds.length) {
              Promise.resolve({ access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token }).then((noteSession) => {
                fetch('/api/club-arena/player-notes', {
                  method: 'POST', headers: {
                    'Content-Type': 'application/json',
                    ...(noteSession?.access_token ? { Authorization: `Bearer ${noteSession.access_token}` } : {}),
                  },
                  body: JSON.stringify({ action: 'get_bulk', targetUserIds: opIds }),
                }).then(r => r.json()).then(r => { if (r.notes) setPlayerNotes(r.notes); }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
              }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
            }
          }
        }}
        player={noteTarget}
        initialNote={noteTarget ? playerNotes[noteTarget.id] : null}
      />

      {/* MYSTERY BOUNTY OVERLAY */}
      <AnimatePresence>
        {bountyReveal && (
          <MysteryBountyOverlay
            amount={bountyReveal.amount}
            onComplete={() => setBountyReveal(null)}
          />
        )}
      </AnimatePresence>

      {/* Global keyframes for table animations */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
        @keyframes winGlow { 0% { filter: drop-shadow(0 0 8px #FFD700); } 100% { filter: drop-shadow(0 0 20px #FFD700) drop-shadow(0 0 40px rgba(255,215,0,0.4)); } }
        @keyframes yourTurnPulse { 0% { box-shadow: 0 4px 20px rgba(35,116,225,0.6); transform: translateX(-50%) scale(1); } 100% { box-shadow: 0 4px 30px rgba(99,102,241,0.9); transform: translateX(-50%) scale(1.05); } }
        @keyframes seatPulse { 0%, 100% { box-shadow: 0 0 12px rgba(35,116,225,0.3); } 50% { box-shadow: 0 0 28px rgba(35,116,225,0.7), 0 0 48px rgba(35,116,225,0.3); } }
        @keyframes cardSpotlight { 0% { filter: brightness(1); } 50% { filter: brightness(1.3) drop-shadow(0 0 12px rgba(255,215,0,0.6)); } 100% { filter: brightness(1); } }
        @keyframes equityPulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 8px rgba(34,197,94,0.3); } 50% { transform: scale(1.06); box-shadow: 0 0 16px rgba(34,197,94,0.6); } }
      `}</style>
    </div>
  );
}

export default memo(LivePokerTable);
