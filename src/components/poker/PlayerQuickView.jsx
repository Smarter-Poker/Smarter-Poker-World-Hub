/**
 * PlayerQuickView — Quick stat card shown on avatar tap at table
 * Shows: hands played, VPIP, PFR, win rate, session P&L
 * Tap "Notes" to open full PlayerNoteModal
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const T = {
  bg: 'rgba(15,15,20,0.95)', border: 'rgba(255,255,255,0.12)',
  text: '#E4E6EB', dim: '#8E8E93', accent: '#2374E1',
  green: '#31A24C', red: '#FA383E', gold: '#FFD700',
};

const TYPE_LABELS = {
  unknown: '', fish: '', reg: '', shark: '',
  whale: '', nit: '', lag: '', tag: '',
};

function StatPill({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 50 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 9, color: T.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

export default function PlayerQuickView({ player, isOpen, onClose, onOpenNotes, note, position }) {
  if (!isOpen || !player) return null;

  const stats = player.stats || {};
  const vpip = stats.vpip != null ? `${stats.vpip}%` : '—';
  const pfr = stats.pfr != null ? `${stats.pfr}%` : '—';
  const hands = stats.handsPlayed || stats.hands_played || 0;
  const winRate = stats.winRate != null ? `${stats.winRate}%` : '—';
  const sessionPnl = stats.sessionPnl || 0;
  const pnlColor = sessionPnl > 0 ? T.green : sessionPnl < 0 ? T.red : T.dim;
  const pnlSign = sessionPnl > 0 ? '+' : '';
  const typeEmoji = note?.player_type ? (TYPE_LABELS[note.player_type] || '') : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 90 }}
          />
          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            style={{
              position: 'fixed',
              top: position?.top || '30%', left: '50%', transform: 'translateX(-50%)',
              background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: 16, padding: '16px 20px', width: 260,
              zIndex: 91, backdropFilter: 'blur(20px)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', overflow: 'hidden' }}>
                {player.avatarUrl
                  ? <img src={player.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  : (player.displayName || '?')[0].toUpperCase()
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {typeEmoji && <span style={{ marginRight: 4 }}>{typeEmoji}</span>}
                  {player.displayName || 'Player'}
                </div>
                <div style={{ fontSize: 11, color: T.dim }}>
                  {hands > 0 ? `${hands.toLocaleString()} hands` : 'New player'}
                  {player.stack != null && ` • ${player.stack.toLocaleString()} chips`}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12, padding: '8px 0', borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
              <StatPill label="VPIP" value={vpip} color={parseInt(vpip) > 40 ? T.gold : T.green} />
              <StatPill label="PFR" value={pfr} />
              <StatPill label="Win%" value={winRate} color={parseInt(winRate) > 50 ? T.green : undefined} />
              <StatPill label="P&L" value={`${pnlSign}${sessionPnl.toLocaleString()}`} color={pnlColor} />
            </div>

            {/* Note preview */}
            {note?.notes && (
              <div style={{ fontSize: 11, color: T.dim, marginBottom: 10, padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {note.notes}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { onClose(); onOpenNotes?.(); }}
                style={{ flex: 1, padding: '8px 0', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Notes
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
