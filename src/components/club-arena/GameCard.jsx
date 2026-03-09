/**
 * ═══════════════════════════════════════════════════════════════════
 * GAME CARD — Club Arena Lobby  (v3 — Vertical Poker Table Visual)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Uses the EXACT SAME poker table image from the Table Tablet screen,
 * positioned VERTICALLY inside the Club Arena card.
 *
 * Image: /images/poker-table-vertical-nobg.png
 * (Same table as /images/poker-table-black-gold.png rotated to portrait)
 *
 * Cash Game card shows:
 *   • Vertical poker table image as visual background
 *   • Variant badge overlaid top-left
 *   • Seat count top-right
 *   • Game type + blinds centered on table
 *   • Buy-in range below table center
 *   • Mini seat dots around table perimeter
 *   • Sticker icons below table
 *   • Club name + created-ago footer
 *
 * Tournament card shows:
 *   • Vertical poker table image as visual background
 *   • Type badge top-left
 *   • Player count top-right
 *   • Trophy + tournament name centered
 *   • Buy-in + countdown overlaid
 *   • Sticker icons
 *   • Club name + registered count footer
 *
 * Layout: 2-col grid, fits 375px mobile screens.
 */

import React, { useState, useEffect } from 'react';
import { getGameStickers } from '../../lib/stickerOrchestrator';

// ─────────────────────────────────────────────────────────────────────
// VARIANT CONFIG
// ─────────────────────────────────────────────────────────────────────
const VC = {
  nlh: { label: 'NLH', color: '#E74C3C', accent: '#E74C3C' },
  flh: { label: 'FLH', color: '#2ECC71', accent: '#2ECC71' },
  short_deck: { label: '6+', color: '#3498DB', accent: '#3498DB' },
  plo4: { label: 'PLO', color: '#A855F7', accent: '#A855F7' },
  plo5: { label: 'PLO5', color: '#8B5CF6', accent: '#8B5CF6' },
  plo6: { label: 'PLO6', color: '#7C3AED', accent: '#7C3AED' },
  plo8: { label: 'Hi/Lo', color: '#F97316', accent: '#F97316' },
  flo: { label: 'FLO', color: '#14B8A6', accent: '#14B8A6' },
  mixed: { label: 'MIX', color: '#EAB308', accent: '#EAB308' },
  ofc: { label: 'OFC', color: '#EC4899', accent: '#EC4899' },
  pineapple: { label: '🍍', color: '#F1C40F', accent: '#F1C40F' },
  spin: { label: 'SPIN', color: '#F1C40F', accent: '#F1C40F' },
};
const DV = { label: '?', color: '#888', accent: '#555' };

const STATUS_DOT = { active: '#00E676', running: '#00E676', waiting: '#FFA726', full: '#EF5350', paused: '#78909C', completed: '#546E7A' };

// ─────────────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────────
function fmtChips(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function fmtBlind(v) {
  if (v == null) return '0';
  const n = Number(v);
  if (n >= 1) return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  return n.toFixed(2).replace(/^0/, '');  // 0.05 → .05
}

function fmtBuyRange(min, max) {
  if (!min && !max) return null;
  if (min && max) return fmtChips(min) + ' – ' + fmtChips(max);
  if (min) return 'Min ' + fmtChips(min);
  return 'Max ' + fmtChips(max);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return diff + 'm ago';
  const h = Math.floor(diff / 60);
  return h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
}

function getCountdown(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr) - Date.now();
  if (ms <= 0) return { label: 'Starting…', color: '#00E676', urgent: true };
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalMin < 1) return { label: '< 1 min', color: '#FF5252', urgent: true };
  if (totalMin < 60) return { label: totalMin + ' min', color: totalMin < 10 ? '#FF5252' : '#FFA726', urgent: totalMin < 10 };
  if (h < 24) return { label: h + 'h ' + m + 'm', color: '#FFA726', urgent: false };
  return { label: Math.floor(h / 24) + 'd ' + (h % 24) + 'h', color: '#78909C', urgent: false };
}

function fmtStartDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toDateString() === now.toDateString()
    ? hm
    : d.getFullYear() + '-' + mo + '-' + dy + ' ' + hm;
}

// ─────────────────────────────────────────────────────────────────────
// COUNTDOWN HOOK — re-ticks every 30s
// ─────────────────────────────────────────────────────────────────────
function useCountdown(dateStr) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!dateStr) return;
    const id = setInterval(() => tick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, [dateStr]);
  return getCountdown(dateStr);
}

// ─────────────────────────────────────────────────────────────────────
// STICKER BADGE
// ─────────────────────────────────────────────────────────────────────
function StickerBadge({ stickerKey, assetMap, gtdAmount }) {
  const asset = assetMap?.[stickerKey];
  const isGtd = stickerKey === 'gtd';
  const [imgFailed, setImgFailed] = React.useState(false);

  if (asset && asset.path && !imgFailed) {
    return (
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <img
          src={asset.path}
          alt={asset.label || stickerKey}
          title={asset.label || stickerKey}
          onError={() => setImgFailed(true)}
          style={{ width: 26, height: 26, objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}
        />
        {isGtd && gtdAmount > 0 && (
          <span style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 6,
            fontWeight: 800,
            fontFamily: '"Orbitron", monospace',
            color: '#FFD700',
            textShadow: '0 0 3px #000, 0 0 2px #000',
            whiteSpace: 'nowrap',
            letterSpacing: -0.3,
            pointerEvents: 'none',
          }}>
            {fmtChips(gtdAmount)}
          </span>
        )}
      </span>
    );
  }

  const label = asset?.label || stickerKey.replace(/_/g, ' ').toUpperCase();
  return <span style={S.pill}>{label}</span>;
}

// ─────────────────────────────────────────────────────────────────────
// MINI SEAT MAP — dots showing filled/empty seats around table edge
// ─────────────────────────────────────────────────────────────────────
function MiniSeatMap({ current, max, accentColor }) {
  const seats = [];
  for (let i = 0; i < max; i++) {
    seats.push(
      <div key={i} style={{
        width: 5, height: 5, borderRadius: '50%',
        background: i < current ? accentColor : 'rgba(255,255,255,0.15)',
        border: i < current ? 'none' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: i < current ? `0 0 4px ${accentColor}` : 'none',
      }} />
    );
  }
  return <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>{seats}</div>;
}

// ─────────────────────────────────────────────────────────────────────
// CASH GAME CARD — Vertical Poker Table
// ─────────────────────────────────────────────────────────────────────
function CashCard({ table: t, assetMap, onPress, avgVpip }) {
  const vc = VC[t.game_variant] || DV;
  const sb = t.small_blind ?? 0;
  const bb = t.big_blind ?? 0;
  const cur = t.current_players ?? 0;
  const max = t.max_players ?? 9;
  const isFull = cur >= max;
  const isEmpty = cur === 0;
  const status = t.status || 'waiting';
  const isLive = (status === 'running' || status === 'active') && cur > 0;
  const stickers = getGameStickers(t, avgVpip ?? t.avg_vpip ?? null);
  const clubName = t.club_name || t.club?.name || '';
  const buyRange = fmtBuyRange(t.min_buy_in, t.max_buy_in);
  const tableName = t.name || '';
  const ago = timeAgo(t.created_at);

  return (
    <button onClick={() => onPress?.(t)} style={S.card}>

      {/* LIVE badge */}
      {isLive && (
        <div style={S.liveBadge}>
          <div style={S.liveDot} />
          <span style={S.liveText}>LIVE</span>
        </div>
      )}

      {/* Top row — Variant badge | Seats */}
      <div style={S.topRow}>
        <span style={{ ...S.varBadge, color: vc.color, background: vc.accent + '25', borderColor: vc.accent + '60' }}>
          {vc.label}
        </span>
        <div style={S.seatsBox}>
          <span style={{ color: isFull ? '#EF5350' : isEmpty ? '#78909C' : '#00E676', fontWeight: 700, fontSize: 11 }}>{cur}</span>
          <span style={{ color: '#555', fontSize: 10 }}>/{max}</span>
          <div style={{ ...S.statusDot, background: STATUS_DOT[isFull ? 'full' : status] || '#555' }} />
        </div>
      </div>

      {/* ── POKER TABLE IMAGE (vertical) ── */}
      <div style={S.tableContainer}>
        <img
          src="/images/poker-table-vertical-nobg.png"
          alt="Poker Table"
          style={S.tableImage}
        />

        {/* Overlay: Game info centered on the table */}
        <div style={S.tableOverlay}>
          {/* Table name (subtle, at top of table area) */}
          {!!tableName && (
            <div style={S.overlayTableName}>
              {tableName.length > 14 ? tableName.slice(0, 14) + '…' : tableName}
            </div>
          )}

          {/* Game type */}
          <div style={{ ...S.overlayGameType, color: vc.color }}>
            {vc.label}
          </div>

          {/* Blinds — the hero value */}
          <div style={{ ...S.overlayBlinds, color: vc.color }}>
            {fmtBlind(sb)}/{fmtBlind(bb)}
          </div>

          {/* Buy-in range */}
          {buyRange && (
            <div style={S.overlayBuyRange}>
              {buyRange}
            </div>
          )}
        </div>

        {/* Mini seat dots below the table */}
        <div style={S.seatMapRow}>
          <MiniSeatMap current={cur} max={max} accentColor={vc.accent} />
        </div>
      </div>

      {/* Sticker icons */}
      {stickers.length > 0 && (
        <div style={S.stickerRow}>
          {stickers.map(k => <StickerBadge key={k} stickerKey={k} assetMap={assetMap} />)}
        </div>
      )}

      {/* Footer — Club | Created ago */}
      <div style={S.footerRow}>
        <span style={S.clubText}>{clubName.length > 13 ? clubName.slice(0, 13) + '…' : clubName}</span>
        <span style={S.dimText}>{ago}</span>
      </div>

      {isLive && <style>{`@keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TOURNAMENT / SNG / SPIN CARD — Vertical Poker Table
// ─────────────────────────────────────────────────────────────────────
function TournamentCard({ tournament: t, assetMap, onPress }) {
  const variant = t.game_variant || t.variant || 'nlh';
  const isSpin = t.type === 'spin' || variant === 'spin';
  const isMTT = t.type === 'mtt';
  const vc = isSpin ? VC.spin : (VC[variant] || DV);

  const stickers = getGameStickers(t);
  const buyIn = t.buy_in ?? t.settings?.buy_in ?? 0;
  const reg = t.registered_count ?? t.current_players ?? 0;
  const maxP = t.max_players ?? t.settings?.max_players ?? 9;
  const isFull = reg >= maxP;
  const status = t.status || 'waiting';
  const isLive = status === 'active' || status === 'running';

  const name = t.name || '';
  const clubName = t.club_name || t.club?.name || '';
  const startDate = t.scheduled_start || t.settings?.start_time || t.start_time || null;

  // GTD prize
  const gtdAmount = t.prize_pool > (t.guaranteed_prize || 0)
    ? t.prize_pool
    : (t.guaranteed_prize || t.settings?.gtd_amount || 0);

  // Type badge
  const typeLabel = isSpin ? 'Spin-' + vc.label : isMTT ? 'XMTT' + vc.label : 'SNG-' + vc.label;

  // Countdown
  const countdown = useCountdown(isLive ? null : startDate);
  const trophyGlow = isSpin ? '#F1C40F' : isMTT ? '#FFD700' : '#C0C0C0';

  return (
    <button onClick={() => onPress?.(t)} style={S.card}>

      {/* LIVE badge */}
      {isLive && (
        <div style={S.liveBadge}>
          <div style={S.liveDot} />
          <span style={S.liveText}>LIVE</span>
        </div>
      )}

      {/* Top row — Type badge | Player count */}
      <div style={S.topRow}>
        <span style={{ ...S.varBadge, color: vc.color, background: vc.accent + '25', borderColor: vc.accent + '60', fontSize: 8 }}>
          {typeLabel}
        </span>
        <div style={S.seatsBox}>
          <span style={{ color: isFull ? '#EF5350' : '#00E676', fontWeight: 700, fontSize: 11 }}>{reg}</span>
          <span style={{ color: '#555', fontSize: 10 }}>/{maxP}</span>
          <div style={{ ...S.statusDot, background: STATUS_DOT[status] || '#555' }} />
        </div>
      </div>

      {/* ── POKER TABLE IMAGE (vertical) ── */}
      <div style={S.tableContainer}>
        <img
          src="/images/poker-table-vertical-nobg.png"
          alt="Poker Table"
          style={S.tableImage}
        />

        {/* Overlay: Tournament info centered on the table */}
        <div style={S.tableOverlay}>
          {/* Trophy icon */}
          <div style={{ fontSize: 22, lineHeight: 1, filter: 'drop-shadow(0 0 6px ' + trophyGlow + '99)', marginBottom: 2 }}>
            {isSpin ? '♠️' : isMTT ? '🏆' : '🥇'}
          </div>

          {/* Tournament name */}
          {!!name && (
            <div style={S.overlayTournName}>
              {name.length > 16 ? name.slice(0, 16) + '…' : name}
            </div>
          )}

          {/* Buy-in */}
          <div style={S.overlayBuyIn}>
            {fmtChips(buyIn)}
          </div>

          {/* Countdown / LIVE / Start date */}
          {isLive ? (
            <span style={{ ...S.overlayCountdown, color: '#00E676', background: '#00E67620', borderColor: '#00E67640' }}>
              🔴 LIVE
            </span>
          ) : countdown ? (
            <span style={{ ...S.overlayCountdown, color: countdown.color, background: countdown.color + '18', borderColor: countdown.color + '44' }}>
              ⏱ {countdown.label}
            </span>
          ) : startDate ? (
            <span style={S.overlayStartDate}>{fmtStartDate(startDate)}</span>
          ) : null}
        </div>
      </div>

      {/* Sticker icons */}
      {stickers.length > 0 && (
        <div style={S.stickerRow}>
          {stickers.map(k => (
            <StickerBadge key={k} stickerKey={k} assetMap={assetMap} gtdAmount={k === 'gtd' ? gtdAmount : 0} />
          ))}
        </div>
      )}

      {/* Footer — Club | Registered */}
      <div style={S.footerRow}>
        <span style={S.clubText}>{clubName.length > 13 ? clubName.slice(0, 13) + '…' : clubName}</span>
        <span style={S.dimText}>{maxP} Max</span>
      </div>

      {isLive && <style>{`@keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────
export default function GameCard({ game, assetMap = {}, onPress, avgVpip }) {
  if (!game) return null;
  const isTournament =
    game.game_type === 'tournament' || game.game_type === 'sng' || game.game_type === 'mtt' ||
    game.type === 'sng' || game.type === 'mtt' || game.type === 'spin' ||
    game.registered_count != null;
  return isTournament
    ? <TournamentCard tournament={game} assetMap={assetMap} onPress={onPress} />
    : <CashCard table={game} assetMap={assetMap} onPress={onPress} avgVpip={avgVpip} />;
}

// ─────────────────────────────────────────────────────────────────────
// STYLES — Vertical poker table card
// ─────────────────────────────────────────────────────────────────────
const S = {
  card: {
    width: '100%',
    minHeight: 200,
    borderRadius: 12,
    padding: '8px 8px 6px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'linear-gradient(160deg, #0c0c14 0%, #111118 50%, #0a0a12 100%)',
    textAlign: 'left',
    boxShadow: '0 4px 16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
    WebkitTapHighlightColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.08s, box-shadow 0.15s',
  },

  // LIVE badge
  liveBadge: {
    position: 'absolute', top: 6, right: 6,
    display: 'flex', alignItems: 'center', gap: 3,
    background: 'rgba(0,230,118,0.12)', border: '1px solid rgba(0,230,118,0.3)',
    borderRadius: 10, padding: '1px 6px', zIndex: 5,
  },
  liveDot: {
    width: 5, height: 5, borderRadius: '50%', background: '#00E676',
    boxShadow: '0 0 4px #00E676',
    animation: 'livePulse 1.5s ease-in-out infinite',
  },
  liveText: { fontSize: 8, fontWeight: 800, color: '#00E676', letterSpacing: 0.5 },

  // Top row
  topRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 2,
  },
  varBadge: {
    fontSize: 10, fontWeight: 800,
    fontFamily: '"Orbitron","Rajdhani",monospace',
    padding: '2px 6px', borderRadius: 4, border: '1px solid',
    letterSpacing: 0.4, textTransform: 'uppercase', lineHeight: 1.3, whiteSpace: 'nowrap',
  },
  seatsBox: { display: 'flex', alignItems: 'center', gap: 2 },
  statusDot: { width: 5, height: 5, borderRadius: '50%', marginLeft: 3, flexShrink: 0 },

  // Table container — holds the vertical poker table image
  tableContainer: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    minHeight: 120,
  },
  tableImage: {
    width: '75%',
    maxWidth: 110,
    height: 'auto',
    objectFit: 'contain',
    pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
  },

  // Overlay — centered on top of the table image
  tableOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 1,
    zIndex: 2,
    pointerEvents: 'none',
    width: '70%',
  },

  // Cash game overlay elements
  overlayTableName: {
    fontSize: 7, fontWeight: 600, color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 1.2,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    maxWidth: '100%',
  },
  overlayGameType: {
    fontSize: 10, fontWeight: 800,
    fontFamily: '"Orbitron","Rajdhani",monospace',
    letterSpacing: 1, textTransform: 'uppercase',
    textShadow: '0 1px 6px rgba(0,0,0,0.8)',
    lineHeight: 1.2,
  },
  overlayBlinds: {
    fontSize: 17, fontWeight: 900,
    fontFamily: '"Orbitron",monospace',
    letterSpacing: -0.5, lineHeight: 1,
    textShadow: '0 1px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)',
  },
  overlayBuyRange: {
    fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.2, lineHeight: 1.3,
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },

  // Tournament overlay elements
  overlayTournName: {
    fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.2,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    maxWidth: '100%', marginBottom: 1,
    textShadow: '0 1px 4px rgba(0,0,0,0.9)',
  },
  overlayBuyIn: {
    fontSize: 14, fontWeight: 800,
    fontFamily: '"Orbitron",monospace',
    color: '#fff', lineHeight: 1,
    textShadow: '0 1px 6px rgba(0,0,0,0.9)',
  },
  overlayCountdown: {
    display: 'inline-block', fontSize: 8, fontWeight: 700,
    padding: '1px 5px', borderRadius: 4, border: '1px solid',
    letterSpacing: 0.2, whiteSpace: 'nowrap', lineHeight: 1.5,
    marginTop: 2,
  },
  overlayStartDate: {
    fontSize: 7, color: 'rgba(255,255,255,0.35)', display: 'block',
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },

  // Seat map row (below table image)
  seatMapRow: {
    marginTop: 2,
    marginBottom: 2,
  },

  // Sticker row
  stickerRow: {
    display: 'flex', alignItems: 'center', gap: 4,
    minHeight: 26, flexWrap: 'nowrap', overflow: 'hidden',
    justifyContent: 'center',
  },
  pill: {
    fontSize: 6, fontWeight: 700, color: '#fff',
    background: 'rgba(255,255,255,0.12)', borderRadius: 3,
    padding: '1px 4px', textTransform: 'uppercase', letterSpacing: 0.4,
    whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.12)',
  },

  // Footer
  footerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 'auto', paddingTop: 2,
  },
  clubText: {
    fontSize: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: 0.3,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '65%',
  },
  dimText: { fontSize: 8, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' },
};
