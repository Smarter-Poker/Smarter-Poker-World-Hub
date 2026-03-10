/**
 * TableMiniView — Live game thumbnail for Club Arena lobby cards (v2)
 *
 * Renders a tiny oval felt table with:
 *   • Seat dots around the perimeter (empty/occupied/actor/folded/dealer/all-in)
 *   • Community card pips (14×20px, colored suits)
 *   • Pot total centered below cards
 *   • Phase label (PREFLOP/FLOP/TURN/RIVER/SHOWDOWN/DEALING)
 *   • Gold-pulse animation on the current actor
 *   • Preflop display (pot + seats, no cards)
 *   • Loading skeleton before first data arrives
 *   • 2-10 seat support with dynamic position layouts
 *
 * Width: 100% of parent. Height: ~100px.
 * Pure visual — no hooks, no side effects.
 */

import React from 'react';

// ── Card conversion helpers ──
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUIT_CHARS = ['♣','♦','♥','♠'];
const SUIT_COLORS = ['#B0B3B8','#E74C3C','#E74C3C','#B0B3B8']; // clubs=gray, diamonds=red, hearts=red, spades=gray

function cardRank(c) { return RANKS[Math.floor(c / 4)] || '?'; }
function cardSuitIdx(c) { return c % 4; }
function cardSuitChar(c) { return SUIT_CHARS[cardSuitIdx(c)]; }
function cardColor(c) { return SUIT_COLORS[cardSuitIdx(c)]; }

// ── Phase display labels ──
const PHASE_LABELS = {
  dealing: 'DEALING',
  preflop: 'PRE-FLOP',
  flop: 'FLOP',
  turn: 'TURN',
  river: 'RIVER',
  showdown: 'SHOWDOWN',
};

// ── Seat positions around an ellipse — [x%, y%] ──
// Full 10-seat layout (clockwise from bottom-center)
const SEAT_POSITIONS = {
  10: [
    [50, 95],  // 0: bottom center
    [18, 85],  // 1: bottom-left
    [5,  60],  // 2: left
    [8,  30],  // 3: upper-left
    [28, 8],   // 4: top-left
    [50, 2],   // 5: top center
    [72, 8],   // 6: top-right
    [92, 30],  // 7: upper-right
    [95, 60],  // 8: right
    [82, 85],  // 9: bottom-right
  ],
  9: [
    [50, 95], [15, 82], [5, 55], [10, 25], [30, 8],
    [50, 2], [70, 8], [90, 25], [95, 55],
  ],
  8: [
    [50, 95], [15, 78], [5, 48], [15, 15], [38, 2],
    [62, 2], [85, 15], [95, 48],
  ],
  7: [
    [50, 95], [12, 72], [5, 35], [22, 5], [50, 2],
    [78, 5], [95, 35],
  ],
  6: [
    [50, 95], [10, 70], [10, 25], [50, 2], [90, 25], [90, 70],
  ],
  5: [
    [50, 95], [8, 55], [25, 5], [75, 5], [92, 55],
  ],
  4: [
    [50, 95], [5, 50], [50, 2], [95, 50],
  ],
  3: [
    [50, 95], [10, 25], [90, 25],
  ],
  2: [
    [50, 95], [50, 2],
  ],
};

function getSeatPositions(maxSeats) {
  const clamped = Math.max(2, Math.min(10, maxSeats));
  return SEAT_POSITIONS[clamped] || SEAT_POSITIONS[9];
}

// ── Format pot number with commas ──
function fmtPot(n) {
  if (!n || n <= 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

// ── Keyframe injection (once globally) ──
let _injected = false;
function ensureKeyframes() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes miniActorPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,215,0,0.6); }
      50% { box-shadow: 0 0 0 4px rgba(255,215,0,0.15); }
    }
    @keyframes miniShimmer {
      0% { background-position: -100% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes miniCardDeal {
      from { opacity: 0; transform: scale(0.5); }
      to { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(s);
}

export default function TableMiniView({ miniState, maxSeats = 9 }) {
  ensureKeyframes();

  // No data yet → shimmer skeleton
  if (!miniState) {
    return (
      <div style={S.container}>
        <div style={{ ...S.feltOval, ...S.skeleton }} />
      </div>
    );
  }

  const phase = miniState.phase || 'idle';
  const isIdle = phase === 'idle';
  const isDealing = phase === 'dealing';
  const communityCards = miniState.communityCards || [];
  const potTotal = miniState.potTotal || 0;
  const seats = miniState.seats || [];
  const phaseLabel = PHASE_LABELS[phase] || null;
  const positions = getSeatPositions(maxSeats);

  return (
    <div style={S.container}>
      {/* Oval felt table */}
      <div style={S.feltOval}>
        {/* Seat dots */}
        {positions.map((pos, idx) => {
          const seatData = seats[idx];
          const occupied = seatData?.occupied;
          const isActor = seatData?.isActor;
          const isFolded = seatData?.isFolded;
          const isDealer = seatData?.isDealer;
          const isAllIn = seatData?.isAllIn;

          let dotStyle;
          if (isActor) {
            dotStyle = S.seatActor;
          } else if (isAllIn) {
            dotStyle = S.seatAllIn;
          } else if (isFolded) {
            dotStyle = S.seatFolded;
          } else if (occupied) {
            dotStyle = S.seatOccupied;
          } else {
            dotStyle = S.seatEmpty;
          }

          return (
            <div
              key={idx}
              style={{
                ...S.seatDot,
                ...dotStyle,
                left: `${pos[0]}%`,
                top: `${pos[1]}%`,
              }}
            >
              {isDealer && occupied && (
                <span style={S.dealerBadge}>D</span>
              )}
            </div>
          );
        })}

        {/* Center content */}
        <div style={S.centerContent}>
          {isIdle ? (
            <span style={S.waitingText}>Waiting…</span>
          ) : isDealing ? (
            <>
              <span style={S.phaseLabel}>DEALING</span>
              <span style={S.dealingDots}>• • •</span>
            </>
          ) : (
            <>
              {/* Phase label */}
              {phaseLabel && (
                <span style={S.phaseLabel}>{phaseLabel}</span>
              )}

              {/* Community cards (card pips) */}
              {communityCards.length > 0 && (
                <div style={S.cardRow}>
                  {communityCards.map((card, i) => (
                    <div key={i} style={{
                      ...S.cardPip,
                      animation: 'miniCardDeal 0.3s ease-out',
                    }}>
                      <span style={{ ...S.cardRank, color: cardColor(card) }}>
                        {cardRank(card)}
                      </span>
                      <span style={{ ...S.cardSuit, color: cardColor(card) }}>
                        {cardSuitChar(card)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pot display */}
              {potTotal > 0 && (
                <span style={S.potText}>
                  Pot: {fmtPot(potTotal)}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const S = {
  container: {
    width: '100%',
    height: 100,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
  },

  feltOval: {
    position: 'absolute',
    top: 6,
    left: '10%',
    width: '80%',
    height: 84,
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, #1a3a1a 30%, #0d1f0d 100%)',
    border: '2px solid rgba(180, 150, 60, 0.5)',
    boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4), 0 0 8px rgba(180, 150, 60, 0.1)',
  },

  // Shimmer skeleton before data arrives
  skeleton: {
    background: 'linear-gradient(90deg, #0d1f0d 25%, #1a3a1a 50%, #0d1f0d 75%)',
    backgroundSize: '200% 100%',
    animation: 'miniShimmer 1.5s ease-in-out infinite',
  },

  // ── Seat dots ──
  seatDot: {
    position: 'absolute',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 2,
    transition: 'all 0.3s ease',
  },
  seatEmpty: {
    width: 6,
    height: 6,
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  seatOccupied: {
    width: 8,
    height: 8,
    background: '#2ECC71',
    border: '1px solid rgba(46,204,113,0.6)',
    boxShadow: '0 0 3px rgba(46,204,113,0.4)',
  },
  seatActor: {
    width: 10,
    height: 10,
    background: '#FFD700',
    border: '1.5px solid rgba(255,215,0,0.8)',
    animation: 'miniActorPulse 1.5s ease-in-out infinite',
  },
  seatAllIn: {
    width: 8,
    height: 8,
    background: '#E74C3C',
    border: '1px solid rgba(231,76,60,0.6)',
    boxShadow: '0 0 4px rgba(231,76,60,0.5)',
  },
  seatFolded: {
    width: 6,
    height: 6,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.06)',
  },

  dealerBadge: {
    position: 'absolute',
    top: -8,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 5,
    fontWeight: 900,
    color: '#000',
    background: '#FFD700',
    borderRadius: 3,
    padding: '0 2px',
    lineHeight: '8px',
    letterSpacing: 0.3,
  },

  // ── Center content (cards, pot, phase) ──
  centerContent: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    zIndex: 1,
    pointerEvents: 'none',
  },

  waitingText: {
    fontSize: 9,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.3,
    fontStyle: 'italic',
  },

  dealingDots: {
    fontSize: 8,
    color: 'rgba(255,215,0,0.4)',
    letterSpacing: 2,
    animation: 'livePulse 1.5s ease-in-out infinite',
  },

  phaseLabel: {
    fontSize: 6,
    fontWeight: 800,
    color: 'rgba(255,215,0,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: '"Orbitron","Rajdhani",monospace',
  },

  // ── Card pips ──
  cardRow: {
    display: 'flex',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPip: {
    width: 14,
    height: 20,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.92)',
    border: '0.5px solid rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  cardRank: {
    fontSize: 8,
    fontWeight: 800,
    lineHeight: 1,
    fontFamily: '"Orbitron",monospace',
  },
  cardSuit: {
    fontSize: 6,
    lineHeight: 1,
    marginTop: -1,
  },

  potText: {
    fontSize: 7,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.2,
    fontFamily: '"Orbitron",monospace',
    textShadow: '0 1px 3px rgba(0,0,0,0.7)',
  },
};
