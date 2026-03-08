/**
 * ═══════════════════════════════════════════════════════════
 * GAME CARD — Club Arena Lobby
 * ═══════════════════════════════════════════════════════════
 *
 * Renders a compact lobby card for:
 *   • Cash games  (NLH / PLO / 6+ / etc.)
 *   • SNG / Spin-It
 *   • MTT
 *
 * Sized so 8 cards fit on one mobile screen (2-col grid, 4 rows).
 * Stickers are rendered from stickerOrchestrator + sticker_assets DB data.
 */

import React, { useState } from 'react';
import { getGameStickers } from '@/lib/stickerOrchestrator';

// ─────────────────────────────────────────────────────────────
// VARIANT CONFIG
// ─────────────────────────────────────────────────────────────
const VARIANT_CONFIG = {
  nlh:        { label: 'NLH',    color: '#E74C3C', bg: 'linear-gradient(135deg,#1a0505,#2d0a0a)',  accent: '#E74C3C' },
  flh:        { label: 'FLH',    color: '#2ECC71', bg: 'linear-gradient(135deg,#051a0a,#0a2d14)',  accent: '#2ECC71' },
  short_deck: { label: '6+',     color: '#3498DB', bg: 'linear-gradient(135deg,#05101a,#0a1e2d)',  accent: '#3498DB' },
  plo4:       { label: 'PLO',    color: '#9B59B6', bg: 'linear-gradient(135deg,#12051a,#1e0a2d)',  accent: '#9B59B6' },
  plo5:       { label: 'PLO5',   color: '#8E44AD', bg: 'linear-gradient(135deg,#12051a,#1e0a2d)',  accent: '#8E44AD' },
  plo6:       { label: 'PLO6',   color: '#7D3C98', bg: 'linear-gradient(135deg,#12051a,#1e0a2d)',  accent: '#7D3C98' },
  plo8:       { label: 'Hi/Lo',  color: '#E67E22', bg: 'linear-gradient(135deg,#1a0d05,#2d1a0a)',  accent: '#E67E22' },
  flo:        { label: 'FLO',    color: '#1ABC9C', bg: 'linear-gradient(135deg,#05151a,#0a242d)',  accent: '#1ABC9C' },
  mixed:      { label: 'MIX',    color: '#F39C12', bg: 'linear-gradient(135deg,#1a1305,#2d200a)',  accent: '#F39C12' },
  ofc:        { label: 'OFC',    color: '#E91E63', bg: 'linear-gradient(135deg,#1a0510,#2d0a1e)',  accent: '#E91E63' },
  spin:       { label: 'SPIN',   color: '#F1C40F', bg: 'linear-gradient(135deg,#1a1505,#2d240a)',  accent: '#F1C40F' },
};

const defaultVariant = { label: '?', color: '#888', bg: 'linear-gradient(135deg,#111,#222)', accent: '#888' };

// ─────────────────────────────────────────────────────────────
// STATUS DOT
// ─────────────────────────────────────────────────────────────
const STATUS_COLORS = { active: '#00ff88', waiting: '#F5A623', full: '#E74C3C', paused: '#888' };

// ─────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────
function formatChips(v) {
  if (v == null) return '—';
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K';
  return String(v);
}

function fmtBlind(v) {
  if (v == null) return '0';
  return v >= 1 ? String(v) : String(v);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1)  return 'just now';
  if (diff < 60) return `${diff}m`;
  return `${Math.floor(diff / 60)}h`;
}

function formatStartTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return hm;
  const mo = (d.getMonth() + 1).toString().padStart(2, '0');
  const dy = d.getDate().toString().padStart(2, '0');
  return `${mo}-${dy} ${hm}`;
}

// ─────────────────────────────────────────────────────────────
// STICKER BADGE  (small inline pill using asset image or text fallback)
// ─────────────────────────────────────────────────────────────
function StickerBadge({ stickerKey, assetMap }) {
  const asset = assetMap?.[stickerKey];
  if (!asset) return null;

  // If we have a real image path from DB, show it
  if (asset.path) {
    return (
      <img
        src={asset.path}
        alt={asset.label}
        title={asset.label}
        style={{
          width: 28,
          height: 28,
          objectFit: 'contain',
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
        }}
      />
    );
  }

  // Fallback text pill
  return (
    <span style={{
      fontSize: 8,
      fontWeight: 700,
      color: '#fff',
      background: 'rgba(255,255,255,0.15)',
      borderRadius: 3,
      padding: '1px 4px',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>
      {asset.label || stickerKey.replace(/_/g, ' ')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// CASH GAME CARD
// ─────────────────────────────────────────────────────────────
function CashCard({ table, assetMap, onPress, avgVpip }) {
  const vc  = VARIANT_CONFIG[table.game_variant] || defaultVariant;
  const sb  = table.small_blind || 0;
  const bb  = table.big_blind  || 0;
  const cur = table.current_players || 0;
  const max = table.max_players || 9;
  const isFull   = cur >= max;
  const isEmpty  = cur === 0;
  const status   = table.status || 'waiting';
  const stickers = getGameStickers(table, avgVpip ?? table.avg_vpip);
  const clubName = table.club_name || table.club?.name || '';
  const created  = timeAgo(table.created_at);

  return (
    <button onClick={() => onPress?.(table)} style={{ ...styles.card, background: vc.bg, border: `1px solid ${vc.accent}33` }}>

      {/* ── TOP ROW: variant badge + player count ── */}
      <div style={styles.topRow}>
        <div style={{ ...styles.variantBadge, background: vc.accent + '22', color: vc.color, borderColor: vc.accent + '55' }}>
          {vc.label}
        </div>
        <div style={styles.playerCount}>
          <span style={{ color: isFull ? '#E74C3C' : isEmpty ? '#888' : '#00ff88', fontWeight: 700 }}>{cur}</span>
          <span style={{ color: '#555' }}>/{max}</span>
        </div>
      </div>

      {/* ── BLIND DISPLAY (big, center) ── */}
      <div style={styles.blindsRow}>
        <span style={{ color: '#aaa', fontSize: 9, marginBottom: 1 }}>Blinds</span>
        <span style={{ ...styles.blindValue, color: vc.color }}>
          {fmtBlind(sb)}/{fmtBlind(bb)}
        </span>
      </div>

      {/* ── STICKER ROW ── */}
      {stickers.length > 0 && (
        <div style={styles.stickerRow}>
          {stickers.map(k => <StickerBadge key={k} stickerKey={k} assetMap={assetMap} />)}
        </div>
      )}

      {/* ── BOTTOM ROW: club + status ── */}
      <div style={styles.bottomRow}>
        <span style={styles.clubLabel} title={clubName}>
          {clubName.length > 10 ? clubName.slice(0, 10) + '…' : clubName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ ...styles.statusDot, background: STATUS_COLORS[status] || '#888' }} />
          <span style={styles.timeLabel}>{created}</span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// TOURNAMENT CARD (SNG / MTT / Spin)
// ─────────────────────────────────────────────────────────────
function TournamentCard({ tournament: t, assetMap, onPress }) {
  const variant  = t.game_variant || t.variant || 'nlh';
  const isSpin   = t.type === 'spin' || variant === 'spin';
  const isMTT    = t.type === 'mtt';
  const vc       = isSpin ? VARIANT_CONFIG.spin : (VARIANT_CONFIG[variant] || defaultVariant);
  const stickers = getGameStickers(t);
  const buyIn    = t.buy_in ?? t.settings?.buy_in ?? 0;
  const reg      = t.registered_count ?? t.current_players ?? 0;
  const maxP     = t.max_players ?? t.settings?.max_players ?? 9;
  const status   = t.status || 'waiting';
  const name     = t.name || '';
  const clubName = t.club_name || t.club?.name || '';
  const startTime = t.settings?.start_time || t.start_time;
  const isFull   = reg >= maxP;
  const settings = t.settings || {};

  // Trophy color by type
  const trophyColor = isSpin ? '#F1C40F' : isMTT ? '#FFD700' : '#C0C0C0';

  return (
    <button onClick={() => onPress?.(t)} style={{ ...styles.card, background: vc.bg, border: `1px solid ${vc.accent}33` }}>

      {/* ── TOP ROW: variant + player count ── */}
      <div style={styles.topRow}>
        <div style={{ ...styles.variantBadge, background: vc.accent + '22', color: vc.color, borderColor: vc.accent + '55' }}>
          {isMTT ? `XMTT${vc.label}` : isSpin ? 'Spin-It' : `${vc.label}`}
        </div>
        <div style={styles.playerCount}>
          <span style={{ color: isFull ? '#E74C3C' : '#00ff88', fontWeight: 700 }}>{reg}</span>
          <span style={{ color: '#555' }}>/{maxP}</span>
        </div>
      </div>

      {/* ── TROPHY + BUY-IN ── */}
      <div style={styles.tourneyCenter}>
        <span style={{ fontSize: 22, lineHeight: 1, filter: `drop-shadow(0 0 6px ${trophyColor}88)` }}>
          {isSpin ? '🎰' : isMTT ? '🏆' : '🥇'}
        </span>
        <div style={styles.buyInBlock}>
          <span style={{ color: '#888', fontSize: 8 }}>Buy-in</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{formatChips(buyIn)}</span>
        </div>
      </div>

      {/* ── STICKER ROW ── */}
      {stickers.length > 0 && (
        <div style={styles.stickerRow}>
          {stickers.map(k => <StickerBadge key={k} stickerKey={k} assetMap={assetMap} />)}
        </div>
      )}

      {/* ── NAME + START TIME ── */}
      {(name || startTime) && (
        <div style={styles.tourneyName}>
          {name && <span style={styles.tourneyNameText}>{name.length > 18 ? name.slice(0, 18) + '…' : name}</span>}
          {startTime && <span style={styles.startTimeText}>{formatStartTime(startTime)}</span>}
        </div>
      )}

      {/* ── BOTTOM ROW ── */}
      <div style={styles.bottomRow}>
        <span style={styles.clubLabel}>{clubName.length > 10 ? clubName.slice(0, 10) + '…' : clubName}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ ...styles.statusDot, background: STATUS_COLORS[status] || '#888' }} />
          <span style={styles.timeLabel}>
            {t.settings?.action_time || settings.action_time || 15}s
          </span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT — auto-detects card type
// ─────────────────────────────────────────────────────────────
/**
 * GameCard
 *
 * @param {object}  game       - Table or tournament row from Supabase
 * @param {object}  assetMap   - From buildStickerAssetMap(stickerAssets)
 * @param {function} onPress   - Called with game row when tapped
 * @param {number}  [avgVpip]  - Live VPIP for cash games
 */
export default function GameCard({ game, assetMap = {}, onPress, avgVpip }) {
  if (!game) return null;

  const isTournament =
    game.game_type === 'tournament' ||
    game.game_type === 'sng' ||
    game.game_type === 'mtt' ||
    game.type === 'sng' ||
    game.type === 'mtt' ||
    game.type === 'spin' ||
    game.registered_count != null;

  return isTournament
    ? <TournamentCard tournament={game} assetMap={assetMap} onPress={onPress} />
    : <CashCard       table={game}      assetMap={assetMap} onPress={onPress} avgVpip={avgVpip} />;
}

// ─────────────────────────────────────────────────────────────
// STYLES  — tuned so 8 cards fit on one 375px-wide screen
// ─────────────────────────────────────────────────────────────
const styles = {
  card: {
    // Each card is exactly (100% - gap) / 2 wide → handled by parent grid
    width: '100%',
    aspectRatio: '1 / 0.92',        // compact height, 8 on screen
    borderRadius: 10,
    padding: '8px 8px 6px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: 'pointer',
    border: 'none',
    textAlign: 'left',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    transition: 'transform 0.1s, box-shadow 0.1s',
    WebkitTapHighlightColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  variantBadge: {
    fontSize: 10,
    fontWeight: 800,
    fontFamily: 'Orbitron, "Rajdhani", sans-serif',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  playerCount: {
    fontSize: 11,
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'baseline',
    gap: 1,
  },
  blindsRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginTop: 2,
  },
  blindValue: {
    fontSize: 16,
    fontWeight: 800,
    fontFamily: 'Orbitron, monospace',
    lineHeight: 1.1,
    letterSpacing: -0.5,
  },
  tourneyCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  buyInBlock: {
    display: 'flex',
    flexDirection: 'column',
  },
  stickerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minHeight: 28,
    marginTop: 2,
  },
  tourneyName: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  tourneyNameText: {
    fontSize: 9,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 1.2,
  },
  startTimeText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.45)',
  },
  bottomRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  clubLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    flexShrink: 0,
  },
  timeLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
  },
};
