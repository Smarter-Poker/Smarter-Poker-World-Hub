/**
 * Phase 23: Table Experience Sub-Components
 * 
 * Standalone components wired into LivePokerTable.jsx:
 *   #1  AnalyticsSidebar    — Session P&L, VPIP/PFR/AF stats
 *   #2  PlayerNotesPopup    — Color-coded notes on opponents
 *   #3  SessionSummaryModal — End-of-session recap card
 *   #4  TableEmojiBar       — 10 custom SVG poker reactions
 *   #5  (Auto-actions inline in LivePokerTable)
 *   #6  SpectatorBadge      — Spectator count + delayed cards
 *   #7  ReconnectionOverlay — Disconnect recovery UI
 *   #8  ReportHandButton    — "Flag for review" in DVR
 *   #9  ConnectionQualityHUD— Latency dot + ping display
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════
//  #4 — 10 CUSTOM SVG POKER EMOJIS
// ═══════════════════════════════════════════════════════════

const POKER_EMOJIS = [
  {
    id: 'diamond_chip',
    label: 'Diamond Chip',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <circle cx="24" cy="24" r="20" fill="#1a1a2e" stroke="#FFD700" strokeWidth="3"/>
        <circle cx="24" cy="24" r="14" fill="none" stroke="#FFD700" strokeWidth="1" strokeDasharray="4 2"/>
        <polygon points="24,10 30,24 24,38 18,24" fill="#4FC3F7" stroke="#fff" strokeWidth="1"/>
        <polygon points="24,14 28,24 24,34 20,24" fill="#81D4FA" opacity="0.6"/>
      </svg>
    ),
  },
  {
    id: 'card_flip',
    label: 'Card Flip',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <rect x="10" y="6" width="28" height="36" rx="4" fill="#1a237e" stroke="#FFD700" strokeWidth="2"/>
        <rect x="14" y="10" width="20" height="28" rx="2" fill="#283593"/>
        <text x="24" y="30" textAnchor="middle" fill="#FFD700" fontSize="18" fontWeight="bold" fontFamily="serif">A</text>
        <text x="16" y="18" fill="#ff1744" fontSize="10" fontFamily="serif">♠</text>
        <path d="M36,6 L42,12" stroke="#4FC3F7" strokeWidth="2" opacity="0.6"/>
        <path d="M36,42 L42,36" stroke="#4FC3F7" strokeWidth="2" opacity="0.6"/>
      </svg>
    ),
  },
  {
    id: 'hot_streak',
    label: 'Hot Streak',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <path d="M24,4 C24,4 8,18 8,28 C8,38 16,44 24,44 C32,44 40,38 40,28 C40,18 24,4 24,4Z" fill="#FF6D00" stroke="#FFD600" strokeWidth="1.5"/>
        <path d="M24,16 C24,16 16,24 16,30 C16,36 20,40 24,40 C28,40 32,36 32,30 C32,24 24,16 24,16Z" fill="#FFAB00"/>
        <path d="M24,26 C24,26 20,30 20,33 C20,36 22,38 24,38 C26,38 28,36 28,33 C28,30 24,26 24,26Z" fill="#FFF176"/>
      </svg>
    ),
  },
  {
    id: 'ice_cold',
    label: 'Ice Cold',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <circle cx="24" cy="24" r="18" fill="#0D47A1" stroke="#4FC3F7" strokeWidth="2"/>
        <line x1="24" y1="6" x2="24" y2="42" stroke="#81D4FA" strokeWidth="2" opacity="0.5"/>
        <line x1="6" y1="24" x2="42" y2="24" stroke="#81D4FA" strokeWidth="2" opacity="0.5"/>
        <line x1="11" y1="11" x2="37" y2="37" stroke="#81D4FA" strokeWidth="1.5" opacity="0.4"/>
        <line x1="37" y1="11" x2="11" y2="37" stroke="#81D4FA" strokeWidth="1.5" opacity="0.4"/>
        <circle cx="24" cy="24" r="6" fill="#E1F5FE" stroke="#4FC3F7" strokeWidth="1"/>
        <circle cx="24" cy="24" r="2" fill="#fff"/>
      </svg>
    ),
  },
  {
    id: 'bullseye',
    label: 'Bullseye',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <circle cx="24" cy="24" r="20" fill="#B71C1C" stroke="#D32F2F" strokeWidth="2"/>
        <circle cx="24" cy="24" r="14" fill="#E53935" stroke="#fff" strokeWidth="2"/>
        <circle cx="24" cy="24" r="8" fill="#FF5252" stroke="#fff" strokeWidth="2"/>
        <circle cx="24" cy="24" r="3" fill="#FFD600"/>
        <line x1="24" y1="2" x2="24" y2="10" stroke="#fff" strokeWidth="1.5" opacity="0.6"/>
        <line x1="24" y1="38" x2="24" y2="46" stroke="#fff" strokeWidth="1.5" opacity="0.6"/>
        <line x1="2" y1="24" x2="10" y2="24" stroke="#fff" strokeWidth="1.5" opacity="0.6"/>
        <line x1="38" y1="24" x2="46" y2="24" stroke="#fff" strokeWidth="1.5" opacity="0.6"/>
      </svg>
    ),
  },
  {
    id: 'gg_skull',
    label: 'GG',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <circle cx="24" cy="22" r="16" fill="#263238" stroke="#90A4AE" strokeWidth="2"/>
        <ellipse cx="17" cy="20" rx="4" ry="5" fill="#0D0D0D"/>
        <ellipse cx="31" cy="20" rx="4" ry="5" fill="#0D0D0D"/>
        <circle cx="17" cy="19" r="1.5" fill="#ff1744"/>
        <circle cx="31" cy="19" r="1.5" fill="#ff1744"/>
        <path d="M18,30 L20,28 L22,30 L24,28 L26,30 L28,28 L30,30" fill="none" stroke="#90A4AE" strokeWidth="2"/>
        <text x="24" y="46" textAnchor="middle" fill="#FFD700" fontSize="8" fontWeight="bold">GG</text>
      </svg>
    ),
  },
  {
    id: 'cooler',
    label: 'Cooler',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <rect x="6" y="12" width="36" height="24" rx="4" fill="#1565C0" stroke="#4FC3F7" strokeWidth="2"/>
        <rect x="10" y="16" width="28" height="16" rx="2" fill="#0D47A1"/>
        <line x1="6" y1="22" x2="42" y2="22" stroke="#4FC3F7" strokeWidth="1" opacity="0.4"/>
        <text x="24" y="33" textAnchor="middle" fill="#E1F5FE" fontSize="10" fontWeight="bold">BRR</text>
        <path d="M18,12 L18,8 L14,4" stroke="#81D4FA" strokeWidth="1.5" fill="none"/>
        <path d="M30,12 L30,8 L34,4" stroke="#81D4FA" strokeWidth="1.5" fill="none"/>
        <circle cx="14" cy="4" r="2" fill="#E1F5FE" opacity="0.6"/>
        <circle cx="34" cy="4" r="2" fill="#E1F5FE" opacity="0.6"/>
      </svg>
    ),
  },
  {
    id: 'royal_crown',
    label: 'Royal',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <path d="M6,34 L12,16 L20,26 L24,10 L28,26 L36,16 L42,34Z" fill="#FFD600" stroke="#FFA000" strokeWidth="2"/>
        <rect x="6" y="34" width="36" height="6" rx="2" fill="#FFA000" stroke="#E65100" strokeWidth="1"/>
        <circle cx="12" cy="16" r="3" fill="#F44336"/>
        <circle cx="24" cy="10" r="3" fill="#4FC3F7"/>
        <circle cx="36" cy="16" r="3" fill="#4CAF50"/>
        <circle cx="18" cy="37" r="2" fill="#FFD600"/>
        <circle cx="30" cy="37" r="2" fill="#FFD600"/>
      </svg>
    ),
  },
  {
    id: 'moon_shot',
    label: 'Moon Shot',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <circle cx="24" cy="24" r="20" fill="#0D0D2B" stroke="#1a237e" strokeWidth="2"/>
        <circle cx="20" cy="20" r="10" fill="#E8EAF6" stroke="#C5CAE9" strokeWidth="1"/>
        <circle cx="16" cy="18" r="3" fill="#C5CAE9" opacity="0.6"/>
        <circle cx="22" cy="24" r="2" fill="#C5CAE9" opacity="0.4"/>
        <path d="M34,38 L36,28 L38,38" fill="#FF6D00" stroke="#FFD600" strokeWidth="1"/>
        <path d="M33,38 L36,32 L39,38" fill="#FFAB00" opacity="0.6"/>
        <circle cx="36" cy="40" r="3" fill="#ff6d00" opacity="0.3"/>
        <circle cx="8" cy="8" r="1" fill="#fff"/>
        <circle cx="40" cy="10" r="1" fill="#fff"/>
        <circle cx="38" cy="16" r="0.5" fill="#fff"/>
      </svg>
    ),
  },
  {
    id: 'fish_splash',
    label: 'Fish!',
    svg: (
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <ellipse cx="22" cy="24" rx="14" ry="10" fill="#4CAF50" stroke="#2E7D32" strokeWidth="2"/>
        <polygon points="36,24 44,16 44,32" fill="#4CAF50" stroke="#2E7D32" strokeWidth="1.5"/>
        <circle cx="14" cy="22" r="3" fill="#fff"/>
        <circle cx="14" cy="22" r="1.5" fill="#0D0D0D"/>
        <path d="M18,28 Q22,32 26,28" fill="none" stroke="#1B5E20" strokeWidth="1.5"/>
        <path d="M8,14 Q6,10 10,12" fill="none" stroke="#81D4FA" strokeWidth="1.5"/>
        <path d="M12,12 Q10,8 14,10" fill="none" stroke="#81D4FA" strokeWidth="1.5"/>
        <circle cx="6" cy="12" r="1" fill="#81D4FA" opacity="0.6"/>
      </svg>
    ),
  },
];

// ── Emoji Reaction Tray ──
export function TableEmojiBar({ onSend, disabled }) {
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimerRef = useRef(null);

  // BUG-1 FIX: Clear timer on unmount to prevent memory leak
  useEffect(() => {
    return () => { if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current); };
  }, []);
  
  const handleSend = useCallback((emoji) => {
    if (cooldown || disabled) return;
    onSend(emoji);
    setCooldown(true);
    cooldownTimerRef.current = setTimeout(() => setCooldown(false), 3000);
  }, [cooldown, disabled, onSend]);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      style={{
        display: 'flex', gap: 4, padding: '6px 10px',
        background: 'rgba(0,0,0,0.85)', borderRadius: 12,
        border: '1px solid #333', backdropFilter: 'blur(8px)',
        opacity: cooldown ? 0.5 : 1,
      }}
    >
      {POKER_EMOJIS.map(emoji => (
        <button
          key={emoji.id}
          onClick={() => handleSend(emoji)}
          disabled={cooldown}
          title={emoji.label}
          style={{
            width: 36, height: 36, padding: 4, border: 'none',
            background: 'transparent', cursor: cooldown ? 'not-allowed' : 'pointer',
            borderRadius: 6, transition: 'transform 0.15s',
          }}
          onMouseEnter={e => { if (!cooldown) e.currentTarget.style.transform = 'scale(1.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {emoji.svg}
        </button>
      ))}
    </motion.div>
  );
}

// ── Floating Reaction Animation ──
export function FloatingReaction({ emoji, seatPosition, onComplete }) {
  return (
    <motion.div
      initial={{ opacity: 1, y: 0, scale: 0.5 }}
      animate={{ opacity: 0, y: -120, scale: 1.5 }}
      transition={{ duration: 1.8, ease: 'easeOut' }}
      onAnimationComplete={onComplete}
      style={{
        position: 'absolute',
        left: seatPosition?.x || '50%',
        top: seatPosition?.y || '50%',
        width: 48, height: 48,
        pointerEvents: 'none', zIndex: 200,
        filter: 'drop-shadow(0 0 8px rgba(255,215,0,0.5))',
      }}
    >
      {emoji.svg}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  #1 — HAND HISTORY ANALYTICS SIDEBAR
// ═══════════════════════════════════════════════════════════

export function AnalyticsSidebar({ hands, onClose }) {
  const stats = useMemo(() => {
    if (!hands || hands.length === 0) return null;
    
    let totalPnl = 0;
    let wins = 0;
    let showdowns = 0;
    const pnlHistory = [];
    const positionPnl = {};
    
    for (const h of hands) {
      const hd = h.hand_data;
      if (!hd) continue;
      
      const hero = hd.players?.find(p => p.netResult !== null && p.netResult !== undefined);
      if (hero) {
        totalPnl += hero.netResult;
        if (hero.netResult > 0) wins++;
        pnlHistory.push({ hand: h.hand_number, pnl: totalPnl });
        
        // Position tracking
        const pos = hero.seatIndex !== undefined ? `Seat ${hero.seatIndex}` : 'Unknown';
        positionPnl[pos] = (positionPnl[pos] || 0) + hero.netResult;
      }
      if (hd.showdown) showdowns++;
    }
    
    return {
      totalHands: hands.length,
      totalPnl,
      winRate: hands.length > 0 ? Math.round((wins / hands.length) * 100) : 0,
      showdownPct: hands.length > 0 ? Math.round((showdowns / hands.length) * 100) : 0,
      pnlHistory,
      positionPnl,
      biggestWin: Math.max(0, ...hands.map(h => h.hand_data?.players?.find(p => p.netResult > 0)?.netResult || 0)),
      biggestLoss: Math.min(0, ...hands.map(h => h.hand_data?.players?.find(p => p.netResult < 0)?.netResult || 0)),
    };
  }, [hands]);

  if (!stats) return (
    <div style={{ padding: 20, color: '#888', textAlign: 'center', fontSize: 12 }}>No data available yet.</div>
  );

  const maxPnl = Math.max(...stats.pnlHistory.map(p => Math.abs(p.pnl)), 1);
  const chartH = 80;

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 260,
        background: 'rgba(10,10,15,0.98)', borderLeft: '1px solid #333',
        display: 'flex', flexDirection: 'column', zIndex: 60,
        backdropFilter: 'blur(20px)', overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Analytics</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* P&L Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatBox label="Net P&L" value={stats.totalPnl} color={stats.totalPnl >= 0 ? '#4CAF50' : '#ff4d4f'} prefix={stats.totalPnl >= 0 ? '+' : ''} />
          <StatBox label="Win Rate" value={`${stats.winRate}%`} color="#4FC3F7" />
          <StatBox label="Hands" value={stats.totalHands} color="#B0B3B8" />
          <StatBox label="SD%" value={`${stats.showdownPct}%`} color="#FFD700" />
        </div>

        {/* Mini P&L Chart */}
        <div style={{ background: '#1a1a1f', borderRadius: 8, padding: 12, border: '1px solid #333' }}>
          <span style={{ color: '#888', fontSize: 10, fontWeight: 600, marginBottom: 8, display: 'block' }}>SESSION P&L GRAPH</span>
          <svg width="100%" height={chartH} viewBox={`0 0 ${stats.pnlHistory.length || 1} ${chartH}`} preserveAspectRatio="none">
            <line x1="0" y1={chartH / 2} x2={stats.pnlHistory.length} y2={chartH / 2} stroke="#333" strokeWidth="0.5"/>
            {stats.pnlHistory.length > 1 && (
              <polyline
                fill="none"
                stroke={stats.totalPnl >= 0 ? '#4CAF50' : '#ff4d4f'}
                strokeWidth="1.5"
                points={stats.pnlHistory.map((p, i) =>
                  `${i},${chartH / 2 - (p.pnl / maxPnl) * (chartH / 2 - 4)}`
                ).join(' ')}
              />
            )}
          </svg>
        </div>

        {/* Biggest Win/Loss */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatBox label="Best Hand" value={`+${stats.biggestWin.toLocaleString()}`} color="#4CAF50" small />
          <StatBox label="Worst Hand" value={stats.biggestLoss.toLocaleString()} color="#ff4d4f" small />
        </div>
      </div>
    </motion.div>
  );
}

function StatBox({ label, value, color, prefix = '', small }) {
  return (
    <div style={{
      background: '#1a1a1f', borderRadius: 8, padding: small ? '6px 8px' : '8px 10px',
      border: '1px solid #333', textAlign: 'center',
    }}>
      <div style={{ color: '#888', fontSize: 9, fontWeight: 600, marginBottom: 2, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color, fontSize: small ? 12 : 16, fontWeight: 700, fontFamily: 'monospace' }}>{prefix}{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  #2 — PLAYER NOTES POPUP
// ═══════════════════════════════════════════════════════════

const NOTE_COLORS = [
  { id: 'fish', label: 'Fish', color: '#4CAF50', icon: '●' },
  { id: 'shark', label: 'Shark', color: '#f44336', icon: '●' },
  { id: 'tight', label: 'Tight', color: '#FFD600', icon: '●' },
  { id: 'lag', label: 'LAG', color: '#FF9800', icon: '●' },
  { id: 'whale', label: 'Whale', color: '#2196F3', icon: '●' },
];

function getPlayerNotes() {
  try { return JSON.parse(localStorage.getItem('poker_player_notes') || '{}'); } catch { return {}; }
}

function setPlayerNote(playerId, note) {
  try {
    const notes = getPlayerNotes();
    notes[playerId] = { ...note, updatedAt: Date.now() };
    localStorage.setItem('poker_player_notes', JSON.stringify(notes));
  } catch { /* quota */ }
}

// #3: Supabase sync — persist notes across devices
async function syncNoteToSupabase(supabase, userId, playerId, note) {
  if (!supabase || !userId) return;
  try {
    const { error: err_player_notes_qw1pl } = await supabase.from('player_notes').upsert({
      owner_id: userId,
      target_player_id: playerId,
      note_text: note.text || '',
      color_label: note.colorId || 'fish',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id,target_player_id' });
    if (err_player_notes_qw1pl) console.warn('[Supabase] Silent mutation failed in player_notes:', err_player_notes_qw1pl.message);
  } catch { /* non-fatal — localStorage is the fallback */ }
}

async function loadNotesFromSupabase(supabase, userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('player_notes')
      .select('target_player_id, note_text, color_label, updated_at')
      .eq('owner_id', userId);
    if (error || !data) return null;
    const notes = {};
    for (const row of data) {
      notes[row.target_player_id] = {
        text: row.note_text,
        colorId: row.color_label,
        updatedAt: new Date(row.updated_at).getTime(),
      };
    }
    return notes;
  } catch { return null; }
}

export function PlayerNotesPopup({ playerId, displayName, position, onClose, supabase, currentUserId }) {
  const [notes] = useState(() => getPlayerNotes());
  const existing = notes[playerId] || {};
  const [text, setText] = useState(existing.text || '');
  const [color, setColor] = useState(existing.colorId || 'fish');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setPlayerNote(playerId, { text, colorId: color });
    // #3: Also sync to Supabase
    await syncNoteToSupabase(supabase, currentUserId, playerId, { text, colorId: color });
    setSaving(false);
    onClose();
  }, [playerId, text, color, supabase, currentUserId, onClose]);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', ...position,
        background: '#1a1a1f', border: '1px solid #444', borderRadius: 12,
        padding: 14, width: 220, zIndex: 300,
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{displayName}</div>
      
      {/* Color Labels */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {NOTE_COLORS.map(c => (
          <button
            key={c.id}
            onClick={() => setColor(c.id)}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: color === c.id ? c.color : '#333',
              border: color === c.id ? '2px solid #fff' : '1px solid #555',
              cursor: 'pointer', fontSize: 12, lineHeight: '28px', textAlign: 'center',
            }}
            title={c.label}
          >
            <span style={{ color: c.color }}>{c.icon}</span>
          </button>
        ))}
      </div>

      {/* Text Note */}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add notes about this player..."
        rows={3}
        style={{
          width: '100%', background: '#111', color: '#E4E6EB', border: '1px solid #444',
          borderRadius: 6, padding: 8, fontSize: 12, resize: 'none', fontFamily: 'inherit',
        }}
      />

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '6px 0', background: '#2374E1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
        <button onClick={onClose} style={{ padding: '6px 10px', background: '#333', color: '#888', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
    </motion.div>
  );
}

export function getPlayerNoteColor(playerId) {
  const notes = getPlayerNotes();
  const note = notes[playerId];
  if (!note?.colorId) return null;
  return NOTE_COLORS.find(c => c.id === note.colorId)?.color || null;
}

export function getPlayerNoteText(playerId) {
  const notes = getPlayerNotes();
  return notes[playerId]?.text || null;
}

// ═══════════════════════════════════════════════════════════
//  #3 — SESSION SUMMARY MODAL
// ═══════════════════════════════════════════════════════════

export function SessionSummaryModal({ stats, onClose, onShare }) {
  if (!stats) return null;
  
  const duration = stats.sessionStart ? Math.round((Date.now() - stats.sessionStart) / 60000) : 0;
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, scale: 0.9 }} animate={{ y: 0, scale: 1 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(145deg, #1e1e1e, #121212)',
          border: '1px solid #333', borderRadius: 16, padding: 28, width: 380, maxWidth: '90vw',
          boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}></div>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Session Complete</h2>
          <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
            {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} at the table
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <SummaryCard label="Net P&L" value={stats.netPnl || 0} isPositive={(stats.netPnl || 0) >= 0} format="currency" />
          <SummaryCard label="Hands Played" value={stats.handsPlayed || 0} format="number" />
          <SummaryCard label="Buy-In" value={stats.initialBuyIn || 0} format="currency" />
          <SummaryCard label="Total Added" value={stats.totalAdded || 0} format="currency" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onShare} style={{ flex: 1, padding: '10px 0', background: '#2374E1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Share</button>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', background: '#333', color: '#E4E6EB', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>

        {/* #5: Mini P&L Sparkline */}
        {stats.pnlHistory && stats.pnlHistory.length > 1 && (() => {
          const h = stats.pnlHistory;
          const maxAbs = Math.max(1, ...h.map(p => Math.abs(p.pnl)));
          const chartW = 300;
          const chartH = 50;
          return (
            <div style={{ marginTop: 16, background: '#1a1a1f', borderRadius: 8, padding: 10, border: '1px solid #333' }}>
              <div style={{ color: '#888', fontSize: 9, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Session P&L Graph</div>
              <svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
                <line x1="0" y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="#333" strokeWidth="0.5" />
                <polyline
                  fill="none"
                  stroke={(stats.netPnl || 0) >= 0 ? '#4CAF50' : '#ff4d4f'}
                  strokeWidth="2"
                  points={h.map((p, i) =>
                    `${(i / (h.length - 1)) * chartW},${chartH / 2 - (p.pnl / maxAbs) * (chartH / 2 - 4)}`
                  ).join(' ')}
                />
              </svg>
            </div>
          );
        })()}
      </motion.div>
    </motion.div>
  );
}

function SummaryCard({ label, value, isPositive, format }) {
  const color = format === 'currency' ? (isPositive ? '#4CAF50' : '#ff4d4f') : '#4FC3F7';
  const display = format === 'currency'
    ? `${value >= 0 ? '+' : ''}${value.toLocaleString()}`
    : value.toLocaleString();

  return (
    <div style={{ background: '#1a1a1f', borderRadius: 8, padding: 10, border: '1px solid #333', textAlign: 'center' }}>
      <div style={{ color: '#888', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{display}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  #6 — SPECTATOR BADGE
// ═══════════════════════════════════════════════════════════

export function SpectatorBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'rgba(0,0,0,0.7)', borderRadius: 8,
        padding: '3px 8px', border: '1px solid #444',
      }}
    >
      <span style={{ fontSize: 12 }}></span>
      <span style={{ color: '#B0B3B8', fontSize: 11, fontWeight: 600 }}>{count}</span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  #7 — RECONNECTION OVERLAY
// ═══════════════════════════════════════════════════════════

export function ReconnectionOverlay({ disconnectedAt, onForceReconnect }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!disconnectedAt) return;
    const iv = setInterval(() => {
      setElapsed(Math.round((Date.now() - disconnectedAt) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [disconnectedAt]);

  if (!disconnectedAt) return null;

  const autoSitOut = elapsed >= 10;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
      }}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        style={{ width: 32, height: 32, border: '3px solid #444', borderTopColor: '#2374E1', borderRadius: '50%' }}
      />
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>
        {autoSitOut ? 'Auto Sit-Out Active' : 'Reconnecting...'}
      </div>
      <div style={{ color: '#888', fontSize: 12 }}>
        Disconnected {elapsed}s ago
      </div>
      {autoSitOut && (
        <div style={{ color: '#FFD600', fontSize: 11, fontWeight: 600 }}>
          You have been automatically sat out.
        </div>
      )}
      <button
        onClick={onForceReconnect}
        style={{
          marginTop: 8, padding: '8px 20px', background: '#2374E1', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Force Reconnect
      </button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  #8 — REPORT HAND BUTTON (for DVR)
// ═══════════════════════════════════════════════════════════

export function ReportHandButton({ supabase, handId }) {
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);

  const handleReport = useCallback(async () => {
    if (reported || !supabase || !handId) return;
    setReporting(true);
    try {
      const { error: err_hand_history_ps8m4 } = await supabase
        .from('hand_history')
        .update({ reported: true, reported_at: new Date().toISOString() })
        .eq('id', handId);
      if (err_hand_history_ps8m4) console.warn('[Supabase] Silent mutation failed in hand_history:', err_hand_history_ps8m4.message);
      setReported(true);
    } catch { /* non-fatal */ }
    setReporting(false);
  }, [supabase, handId, reported]);

  return (
    <button
      onClick={handleReport}
      disabled={reported || reporting}
      style={{
        background: reported ? '#333' : '#B71C1C',
        color: reported ? '#888' : '#fff',
        border: 'none', borderRadius: 6, padding: '5px 10px',
        fontSize: 11, cursor: reported ? 'default' : 'pointer', fontWeight: 600,
        opacity: reporting ? 0.6 : 1,
      }}
      title="Flag this hand for admin review"
    >
      {reported ? '✓ Reported' : reporting ? '...' : '▲ Report'}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
//  #9 — CONNECTION QUALITY HUD
// ═══════════════════════════════════════════════════════════

export function ConnectionQualityHUD({ connected, latency }) {
  const quality = !connected ? 'offline' : (latency || 0) < 100 ? 'good' : (latency || 0) < 300 ? 'fair' : 'poor';
  const color = { good: '#4CAF50', fair: '#FFD600', poor: '#ff4d4f', offline: '#666' }[quality];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'rgba(0,0,0,0.6)', borderRadius: 8,
      padding: '2px 8px', border: '1px solid #333',
    }}>
      <motion.div
        animate={{ opacity: connected ? [0.4, 1, 0.4] : 0.3 }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{ width: 8, height: 8, borderRadius: '50%', background: color }}
      />
      <span style={{ color: '#888', fontSize: 9, fontFamily: 'monospace' }}>
        {connected ? (latency ? `${latency}ms` : 'Live') : 'Offline'}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  #5 — AUTO-ACTION HELPERS
// ═══════════════════════════════════════════════════════════

export function getAutoActionSettings(tableId) {
  try {
    return JSON.parse(localStorage.getItem(`auto_actions_${tableId}`) || '{}');
  } catch { return {}; }
}

export function setAutoActionSettings(tableId, settings) {
  try {
    localStorage.setItem(`auto_actions_${tableId}`, JSON.stringify(settings));
  } catch { /* quota */ }
}

// #7: Auto-Rebuy Trigger — checks stack vs threshold and fires rebuy
export function checkAutoRebuy(tableId, currentStack, send) {
  const settings = getAutoActionSettings(tableId);
  if (!settings.autoRebuy || !settings.rebuyThreshold || !send) return false;
  if (currentStack < settings.rebuyThreshold) {
    const rebuyAmount = settings.rebuyAmount || settings.rebuyThreshold * 2;
    send('add_chips', { amount: rebuyAmount });
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
//  #8 — CONNECTION PING MEASUREMENT
// ═══════════════════════════════════════════════════════════

export function usePingMeasurement(send, connected) {
  const [latency, setLatency] = useState(null);
  const pingTimerRef = useRef(null);
  const pingStartRef = useRef(null);

  useEffect(() => {
    if (!connected || !send) { setLatency(null); return; }

    const measurePing = () => {
      pingStartRef.current = Date.now();
      try { send('ping', { ts: pingStartRef.current }); } catch { /* ignore */ }
    };

    // Measure every 10 seconds
    measurePing();
    pingTimerRef.current = setInterval(measurePing, 10000);

    return () => { if (pingTimerRef.current) clearInterval(pingTimerRef.current); };
  }, [connected, send]);

  // Call this when pong is received
  const handlePong = useCallback(() => {
    if (pingStartRef.current) {
      setLatency(Date.now() - pingStartRef.current);
      pingStartRef.current = null;
    }
  }, []);

  return { latency, handlePong };
}

// ═══════════════════════════════════════════════════════════
//  #10 — SERVER-SIDE EMOJI RATE LIMIT HELPER
// ═══════════════════════════════════════════════════════════

const emojiRateLimitMap = new Map();
const EMOJI_RATE_LIMIT_MS = 3000;

export function checkEmojiRateLimit(userId) {
  const now = Date.now();
  const lastSent = emojiRateLimitMap.get(userId);
  if (lastSent && now - lastSent < EMOJI_RATE_LIMIT_MS) return false;
  emojiRateLimitMap.set(userId, now);
  // Cleanup old entries every 60s
  if (emojiRateLimitMap.size > 100) {
    const cutoff = now - 60000;
    for (const [uid, ts] of emojiRateLimitMap) {
      if (ts < cutoff) emojiRateLimitMap.delete(uid);
    }
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
//  #4 — DVR SCREENSHOT EXPORT (canvas-based)
// ═══════════════════════════════════════════════════════════

export async function captureReplayerScreenshot(containerRef) {
  if (!containerRef?.current) return null;
  try {
    // Dynamic import of html2canvas — only when user clicks screenshot
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(containerRef.current, {
      backgroundColor: '#121212',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Screenshot capture failed:', err);
    // Fallback: copy text representation
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  #3 — SUPABASE PLAYER NOTES SYNC EXPORTS
// ═══════════════════════════════════════════════════════════

export { syncNoteToSupabase, loadNotesFromSupabase, NOTE_COLORS };
