/**
 * ═══════════════════════════════════════════════════════════════════
 * GAME CARD — Club Arena Lobby  (v2 — full dynamic data)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Cash Game card shows:
 *   • Variant badge + seats (6/9) + status dot
 *   • Table name
 *   • Blinds (0.1/0.2) — large
 *   • Buy-in range (min–max chips)
 *   • Sticker icons (VPIP / Bomb Pot / Straddle / etc.)
 *   • Club name + created-ago
 *
 * Tournament / SNG / Spin card shows:
 *   • Type badge (XMTTNLH / Spin-PLO6 / SNG) + max seats
 *   • Buy-in amount + action time
 *   • Trophy icon + tournament name
 *   • Live countdown / start date-time
 *   • Stickers — GTD sticker overlays the actual prize pool amount
 *   • Club name + registered count
 *
 * Layout: 2-col grid, 8 cards per 375px mobile screen.
 */

import React, { useState, useEffect } from 'react';
import { getGameStickers } from '../../lib/stickerOrchestrator';

// ─────────────────────────────────────────────────────────────────────
// VARIANT CONFIG
// ─────────────────────────────────────────────────────────────────────
const VC = {
  nlh:        { label: 'NLH',   color: '#E74C3C', bg: 'linear-gradient(145deg,#1f0808,#2d0c0c)', accent: '#E74C3C' },
  flh:        { label: 'FLH',   color: '#2ECC71', bg: 'linear-gradient(145deg,#071a0c,#0a2d14)', accent: '#2ECC71' },
  short_deck: { label: '6+',    color: '#3498DB', bg: 'linear-gradient(145deg,#071018,#0a1e2d)', accent: '#3498DB' },
  plo4:       { label: 'PLO',   color: '#A855F7', bg: 'linear-gradient(145deg,#13071a,#1e0a2d)', accent: '#A855F7' },
  plo5:       { label: 'PLO5',  color: '#8B5CF6', bg: 'linear-gradient(145deg,#13071a,#1e0a2d)', accent: '#8B5CF6' },
  plo6:       { label: 'PLO6',  color: '#7C3AED', bg: 'linear-gradient(145deg,#13071a,#1e0a2d)', accent: '#7C3AED' },
  plo8:       { label: 'Hi/Lo', color: '#F97316', bg: 'linear-gradient(145deg,#1a0d05,#2d1a08)', accent: '#F97316' },
  flo:        { label: 'FLO',   color: '#14B8A6', bg: 'linear-gradient(145deg,#051514,#0a2422)', accent: '#14B8A6' },
  mixed:      { label: 'MIX',   color: '#EAB308', bg: 'linear-gradient(145deg,#1a1505,#2d2008)', accent: '#EAB308' },
  ofc:        { label: 'OFC',   color: '#EC4899', bg: 'linear-gradient(145deg,#1a0510,#2d0a1e)', accent: '#EC4899' },
  spin:       { label: 'SPIN',  color: '#F1C40F', bg: 'linear-gradient(145deg,#1a1505,#2d2408)', accent: '#F1C40F' },
};
const DV = { label: '?', color: '#888', bg: 'linear-gradient(145deg,#111,#1e1e1e)', accent: '#555' };

const STATUS_DOT = { active: '#00E676', running: '#00E676', waiting: '#FFA726', full: '#EF5350', paused: '#78909C', completed: '#546E7A' };

// ─────────────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────────
function fmtChips(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
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
  if (diff < 1)  return 'just now';
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
  if (totalMin < 1)  return { label: '< 1 min',        color: '#FF5252', urgent: true };
  if (totalMin < 60) return { label: totalMin + ' min', color: totalMin < 10 ? '#FF5252' : '#FFA726', urgent: totalMin < 10 };
  if (h < 24)        return { label: h + 'h ' + m + 'm', color: '#FFA726', urgent: false };
  return { label: Math.floor(h / 24) + 'd ' + (h % 24) + 'h', color: '#78909C', urgent: false };
}

function fmtStartDate(dateStr) {
  if (!dateStr) return null;
  const d   = new Date(dateStr);
  const now = new Date();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const dy  = String(d.getDate()).padStart(2, '0');
  const hm  = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
// GTD sticker: overlays the live prize pool / guarantee amount.
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
          style={{ width: 30, height: 30, objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}
        />
        {isGtd && gtdAmount > 0 && (
          <span style={{
            position: 'absolute',
            bottom: 1,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 7,
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

  // Text fallback (no path in DB yet, or unknown key)
  const label = asset?.label || stickerKey.replace(/_/g, ' ').toUpperCase();
  return <span style={S.pill}>{label}</span>;
}

// ─────────────────────────────────────────────────────────────────────
// CASH GAME CARD
// ─────────────────────────────────────────────────────────────────────

// Mini seat map — visual dots showing filled/empty seats
function MiniSeatMap({ current, max, accentColor }) {
  const seats = [];
  for (let i = 0; i < max; i++) {
    seats.push(
      <div key={i} style={{
        width: 5, height: 5, borderRadius: '50%',
        background: i < current ? accentColor : 'rgba(255,255,255,0.1)',
        border: i < current ? 'none' : '1px solid rgba(255,255,255,0.08)',
      }} />
    );
  }
  return <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>{seats}</div>;
}

function CashCard({ table: t, assetMap, onPress, avgVpip }) {
  const vc       = VC[t.game_variant] || DV;
  const sb       = t.small_blind     ?? 0;
  const bb       = t.big_blind       ?? 0;
  const cur      = t.current_players ?? 0;
  const max      = t.max_players     ?? 9;
  const isFull   = cur >= max;
  const isEmpty  = cur === 0;
  const status   = t.status || 'waiting';
  const isLive   = (status === 'running' || status === 'active') && cur > 0;
  const stickers = getGameStickers(t, avgVpip ?? t.avg_vpip ?? null);
  const clubName = t.club_name || t.club?.name || '';
  const buyRange = fmtBuyRange(t.min_buy_in, t.max_buy_in);
  const tableName = t.name || '';
  const ago      = timeAgo(t.created_at);
  const actionSec = t.action_time_seconds || t.settings?.action_time || 30;

  return (
    <button onClick={() => onPress?.(t)} style={{ ...S.card, background: vc.bg, borderColor: vc.accent + '44' }}>

      {/* LIVE badge — pulsing indicator for active tables */}
      {isLive && (
        <div style={{
          position: 'absolute', top: 5, right: 6,
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'rgba(0,230,118,0.12)', border: '1px solid rgba(0,230,118,0.3)',
          borderRadius: 10, padding: '1px 6px', zIndex: 2,
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%', background: '#00E676',
            boxShadow: '0 0 4px #00E676',
            animation: 'livePulse 1.5s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 8, fontWeight: 800, color: '#00E676', letterSpacing: 0.5 }}>LIVE</span>
        </div>
      )}

      {/* ROW 1 — Variant badge | Seats + dot */}
      <div style={S.row}>
        <span style={{ ...S.varBadge, color: vc.color, background: vc.accent + '20', borderColor: vc.accent + '55' }}>
          {vc.label}
        </span>
        <div style={S.seatsBox}>
          <span style={{ color: isFull ? '#EF5350' : isEmpty ? '#78909C' : '#00E676', fontWeight: 700, fontSize: 12 }}>{cur}</span>
          <span style={{ color: '#555', fontSize: 11 }}>/{max}</span>
          <div style={{ ...S.dot, background: STATUS_DOT[isFull ? 'full' : status] || '#555' }} />
        </div>
      </div>

      {/* ROW 2 — Table name */}
      {!!tableName && <div style={S.tableName}>{tableName}</div>}

      {/* ROW 3 — Blinds (big) */}
      <div style={S.blindsBlock}>
        <span style={S.metaLabel}>Blinds</span>
        <span style={{ ...S.blindsVal, color: vc.color }}>{fmtBlind(sb)}/{fmtBlind(bb)}</span>
      </div>

      {/* ROW 4 — Buy-in range + Action time */}
      <div style={S.row}>
        {buyRange ? (
          <div>
            <span style={S.metaLabel}>Buy-in</span>
            <span style={S.buyRangeVal}>{buyRange}</span>
          </div>
        ) : <div />}
        <div style={{ textAlign: 'right' }}>
          <span style={S.metaLabel}>Action</span>
          <span style={S.dimText}>{actionSec}s</span>
        </div>
      </div>

      {/* ROW 5 — Mini seat map */}
      <MiniSeatMap current={cur} max={max} accentColor={vc.accent} />

      {/* ROW 6 — Sticker icons */}
      {stickers.length > 0 && (
        <div style={S.stickerRow}>
          {stickers.map(k => <StickerBadge key={k} stickerKey={k} assetMap={assetMap} />)}
        </div>
      )}

      {/* ROW 7 — Club | Created ago */}
      <div style={{ ...S.row, marginTop: 'auto', paddingTop: 3 }}>
        <span style={S.clubText}>{clubName.length > 13 ? clubName.slice(0, 13) + '…' : clubName}</span>
        <span style={S.dimText}>{ago}</span>
      </div>

      {/* LIVE pulse animation */}
      {isLive && <style>{`@keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TOURNAMENT / SNG / SPIN CARD
// ─────────────────────────────────────────────────────────────────────
function TournamentCard({ tournament: t, assetMap, onPress }) {
  const variant  = t.game_variant || t.variant || 'nlh';
  const isSpin   = t.type === 'spin' || variant === 'spin';
  const isMTT    = t.type === 'mtt';
  const vc       = isSpin ? VC.spin : (VC[variant] || DV);

  const stickers = getGameStickers(t);
  const buyIn    = t.buy_in ?? t.settings?.buy_in ?? 0;
  const reg      = t.registered_count ?? t.current_players ?? 0;
  const maxP     = t.max_players ?? t.settings?.max_players ?? 9;
  const isFull   = reg >= maxP;
  const status   = t.status || 'waiting';
  const isLive   = status === 'active' || status === 'running';

  const name     = t.name || '';
  const clubName = t.club_name || t.club?.name || '';
  const startDate = t.scheduled_start || t.settings?.start_time || t.start_time || null;

  const actionSec = t.settings?.action_time ?? 15;
  const actionDisplay = actionSec >= 60 ? Math.round(actionSec / 60) + 'min' : actionSec + 's';

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
    <button onClick={() => onPress?.(t)} style={{ ...S.card, background: vc.bg, borderColor: vc.accent + '44' }}>

      {/* ROW 1 — Type badge | Max seats */}
      <div style={S.row}>
        <span style={{ ...S.varBadge, color: vc.color, background: vc.accent + '20', borderColor: vc.accent + '55', fontSize: 9 }}>
          {typeLabel}
        </span>
        <span style={S.dimText}>{maxP} Max</span>
      </div>

      {/* ROW 2 — Buy-in | Action time */}
      <div style={S.row}>
        <div>
          <span style={S.metaLabel}>Buy-in</span>
          <span style={S.buyInVal}>{fmtChips(buyIn)}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={S.metaLabel}>Action</span>
          <span style={S.dimText}>{actionDisplay}</span>
        </div>
      </div>

      {/* ROW 3 — Trophy + Name + countdown */}
      <div style={S.trophyRow}>
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, filter: 'drop-shadow(0 0 5px ' + trophyGlow + '99)' }}>
          {isSpin ? '🎰' : isMTT ? '🏆' : '🥇'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {!!name && (
            <div style={S.tournName}>{name.length > 20 ? name.slice(0, 20) + '…' : name}</div>
          )}
          {isLive ? (
            <span style={{ ...S.cdBadge, color: '#00E676', background: '#00E67620', borderColor: '#00E67640' }}>
              🔴 LIVE
            </span>
          ) : countdown ? (
            <span style={{ ...S.cdBadge, color: countdown.color, background: countdown.color + '18', borderColor: countdown.color + '44' }}>
              ⏱ {countdown.label}
            </span>
          ) : startDate ? (
            <span style={S.startDate}>{fmtStartDate(startDate)}</span>
          ) : null}
        </div>
      </div>

      {/* ROW 4 — Sticker icons (GTD gets prize amount overlay) */}
      {stickers.length > 0 && (
        <div style={S.stickerRow}>
          {stickers.map(k => (
            <StickerBadge key={k} stickerKey={k} assetMap={assetMap} gtdAmount={k === 'gtd' ? gtdAmount : 0} />
          ))}
        </div>
      )}

      {/* ROW 5 — Club | Registered */}
      <div style={{ ...S.row, marginTop: 'auto', paddingTop: 3 }}>
        <span style={S.clubText}>{clubName.length > 13 ? clubName.slice(0, 13) + '…' : clubName}</span>
        <div style={S.seatsBox}>
          <span style={{ color: isFull ? '#EF5350' : '#00E676', fontWeight: 700, fontSize: 11 }}>{reg}</span>
          <span style={{ color: '#555', fontSize: 10 }}>/{maxP}</span>
          <div style={{ ...S.dot, background: STATUS_DOT[status] || '#555' }} />
        </div>
      </div>
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
    : <CashCard       table={game}      assetMap={assetMap} onPress={onPress} avgVpip={avgVpip} />;
}

// ─────────────────────────────────────────────────────────────────────
// STYLES  (175px wide × ~158px tall = 8 cards on 375px screen)
// ─────────────────────────────────────────────────────────────────────
const S = {
  card: {
    width: '100%',
    minHeight: 155,
    borderRadius: 10,
    padding: '7px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    cursor: 'pointer',
    border: '1px solid',
    textAlign: 'left',
    boxShadow: '0 3px 10px rgba(0,0,0,0.6)',
    WebkitTapHighlightColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.08s',
  },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  seatsBox: { display: 'flex', alignItems: 'center', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: '50%', marginLeft: 3, flexShrink: 0 },

  varBadge: {
    fontSize: 10, fontWeight: 800,
    fontFamily: '"Orbitron","Rajdhani",monospace',
    padding: '2px 5px', borderRadius: 4, border: '1px solid',
    letterSpacing: 0.4, textTransform: 'uppercase', lineHeight: 1.3, whiteSpace: 'nowrap',
  },

  tableName: {
    fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 1.2,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
  },

  blindsBlock: { display: 'flex', flexDirection: 'column', lineHeight: 1, marginTop: 1 },
  blindsVal: {
    fontSize: 18, fontWeight: 800, fontFamily: '"Orbitron",monospace',
    letterSpacing: -0.5, lineHeight: 1,
  },

  metaLabel: {
    fontSize: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
    letterSpacing: 0.5, display: 'block', marginBottom: 1,
  },
  buyRangeVal: { fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.65)' },
  buyInVal: {
    fontSize: 15, fontWeight: 800, fontFamily: '"Orbitron",monospace',
    color: '#fff', lineHeight: 1, display: 'block',
  },

  trophyRow: { display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 1 },
  tournName: {
    fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.25, marginBottom: 2,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
  },
  cdBadge: {
    display: 'inline-block', fontSize: 8, fontWeight: 700,
    padding: '1px 5px', borderRadius: 4, border: '1px solid',
    letterSpacing: 0.2, whiteSpace: 'nowrap', lineHeight: 1.5,
  },
  startDate: { fontSize: 8, color: 'rgba(255,255,255,0.35)', display: 'block' },

  stickerRow: {
    display: 'flex', alignItems: 'center', gap: 5,
    minHeight: 30, flexWrap: 'nowrap', overflow: 'hidden',
  },
  pill: {
    fontSize: 7, fontWeight: 700, color: '#fff',
    background: 'rgba(255,255,255,0.12)', borderRadius: 3,
    padding: '1px 4px', textTransform: 'uppercase', letterSpacing: 0.4,
    whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.12)',
  },

  clubText: {
    fontSize: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: 0.3,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '65%',
  },
  dimText: { fontSize: 9, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' },
};
