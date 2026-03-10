/**
 * TableMiniView — Live game thumbnail for Club Arena lobby cards (v4)
 *
 * v4 Elite Polish additions:
 *   • Mini-View Player Name & Stack Boxes under seat dots
 *   • Neon Live Action Timer Rings around the active player's name box (SVG requestAnimationFrame)
 *   • Last Action Micro-Labels (CHECK, CALL, FOLD, etc) floating adjacent to the box
 *   • Showdown Hole Card Flash displaying winner's cards (if shownCards is present)
 *   • Dual-Board "Run It Twice" Support (stacks rows of community boards)
 */

import React from 'react';

// ── Card conversion helpers ──
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUIT_CHARS = ['♣','♦','♥','♠'];
const SUIT_COLORS = ['#B0B3B8','#E74C3C','#E74C3C','#B0B3B8'];

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
const SEAT_POSITIONS = {
  10: [
    [50, 95], [18, 85], [5, 60], [8, 30], [28, 8],
    [50, 2], [72, 8], [92, 30], [95, 60], [82, 85],
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

function fmtPot(n) {
  if (!n || n <= 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('mini-view-keyframes')) {
    const s = document.createElement('style');
    s.id = 'mini-view-keyframes';
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
        from { opacity: 0; transform: scale(0.5) translateY(-5px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes miniDealingPulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
      @keyframes miniStickerFloat {
        0% { transform: translateY(0); opacity: 0; }
        20% { opacity: 1; }
        80% { opacity: 1; transform: translateY(-8px); }
        100% { opacity: 0; transform: translateY(-10px); }
      }
      @keyframes miniSeatPop {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        60% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
      @keyframes miniSeatFade {
        0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
      }
      @keyframes miniCardFlip {
        0% { transform: rotateY(180deg) scale(0.6); opacity: 0; }
        50% { transform: rotateY(90deg) scale(0.9); opacity: 0.7; }
        100% { transform: rotateY(0deg) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(s);
  }
}

// ── Timer Box Wrapper with Sound ──
function TimerRingBox({ endTime, totalTime, children }) {
  const [timeLeft, setTimeLeft] = React.useState(
    endTime ? Math.max(0, endTime - Date.now()) / 1000 : 0
  );
  const soundPlayed = React.useRef(false);
  const audioRef = React.useRef(null);

  // Reset sound flag when endTime changes (new turn)
  React.useEffect(() => { soundPlayed.current = false; }, [endTime]);

  React.useEffect(() => {
    if (!endTime) return;
    let raf;
    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now()) / 1000;
      setTimeLeft(remaining);

      // Play tick sound when under 25%
      if (totalTime > 0 && remaining > 0 && remaining / totalTime < 0.25 && !soundPlayed.current) {
        soundPlayed.current = true;
        try {
          if (!audioRef.current && typeof Audio !== 'undefined') {
            // Short beep synthesized via Web Audio (no external file needed)
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.value = 0.08;
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
          }
        } catch { /* Audio not available */ }
      }

      if (remaining > 0) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endTime, totalTime]);

  const p = totalTime > 0 ? Math.max(0, Math.min(1, Math.max(0, timeLeft) / totalTime)) : 0;
  
  const width = 42;
  const height = 22;
  const rx = 4;
  const perimeter = 2 * (width + height) - 8 * rx + 2 * Math.PI * rx;
  const offset = perimeter * (1 - p);
  
  const color = p > 0.4 ? '#39FF14' : (p > 0.15 ? '#FFBF00' : '#FF003F');
  const glow = p > 0.15 ? color : '#FF003F';

  return (
    <div style={{ position: 'relative', width, height, marginTop: 4 }}>
      {endTime && timeLeft > 0 && (
        <svg 
          width={width + 4} 
          height={height + 4} 
          style={{ position: 'absolute', top: -2, left: -2, pointerEvents: 'none', zIndex: 0 }}
        >
          <rect 
            x="2" y="2" width={width} height={height} rx={rx} ry={rx}
            fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"
          />
          <rect 
            x="2" y="2" width={width} height={height} rx={rx} ry={rx}
            fill="none" stroke={color} strokeWidth="2.5"
            strokeDasharray={perimeter} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ 
              transition: 'stroke 0.3s ease',
              filter: `drop-shadow(0 0 2px ${glow})`,
            }}
          />
        </svg>
      )}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {children}
      </div>
    </div>
  );
}


// ── Main UI Component ──
const STALE_THRESHOLD = 15000;

export default function TableMiniView({
  miniState,
  maxSeats = 9,
  blinds,
  variant,
  accentColor,
}) {
  ensureKeyframes();

  // Track previous seat occupancy for pop/fade animations
  const prevSeatsRef = React.useRef(null);
  const seatAnimations = React.useRef(new Map());
  const currentSeats = miniState?.seats || [];
  
  React.useEffect(() => {
    if (!miniState) return;
    if (prevSeatsRef.current) {
      const prev = prevSeatsRef.current;
      currentSeats.forEach((s, idx) => {
        const wasFilled = prev[idx]?.occupied;
        const isFilled = s?.occupied;
        if (!wasFilled && isFilled) seatAnimations.current.set(idx, 'pop');
        if (wasFilled && !isFilled) seatAnimations.current.set(idx, 'fade');
      });
      // Clear animations after 500ms
      setTimeout(() => seatAnimations.current.clear(), 500);
    }
    prevSeatsRef.current = [...currentSeats];
  }, [miniState, currentSeats]);

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
  const isShowdown = phase === 'showdown';
  
  // Dual-board support
  let boards = [];
  if (miniState.boards && miniState.boards.length > 0) {
    boards = miniState.boards;
  } else if (miniState.communityCards && miniState.communityCards.length > 0) {
    boards = [miniState.communityCards];
  }

  const potTotal = miniState.potTotal || 0;
  const handNumber = miniState.handNumber || 0;
  const seats = miniState.seats || [];
  const turnEndTime = miniState.turnEndTime;
  const turnTotalTime = miniState.turnTotalTime || 15;
  const shownCards = miniState.shownCards || [];

  const phaseLabel = PHASE_LABELS[phase] || null;
  const positions = getSeatPositions(maxSeats);

  const isStale = miniState._fetchedAt && (Date.now() - miniState._fetchedAt > STALE_THRESHOLD);
  const feltBorder = accentColor
    ? `2px solid ${accentColor}66`
    : '2px solid rgba(180, 150, 60, 0.5)';

  return (
    <div style={{ ...S.container, ...(isStale ? { opacity: 0.55 } : {}) }}>
      {/* Oval felt table */}
      <div style={{ ...S.feltOval, border: feltBorder }}>

        {blinds && (
          <div style={S.blindsBanner}>
            {variant && <span style={S.blindsVariant}>{variant}</span>}
            <span style={S.blindsText}>{blinds}</span>
          </div>
        )}

        {/* Seats */}
        {positions.map((pos, idx) => {
          const seatData = seats[idx];
          if (!seatData) return null;

          const occupied = seatData.occupied;
          const isActor = seatData.isActor;
          const isFolded = seatData.isFolded;
          const isDealer = seatData.isDealer;
          const isAllIn = seatData.isAllIn;
          const displayName = seatData.displayName;
          const stack = seatData.stack;
          const lastAction = seatData.lastAction;

          // Hole cards shown at showdown
          const playerShownCards = shownCards.filter(c => c.seatIndex === seatData.seatIndex);

          let dotStyle = S.seatEmpty;
          if (isActor) dotStyle = S.seatActor;
          else if (isAllIn) dotStyle = S.seatAllIn;
          else if (isFolded) dotStyle = S.seatFolded;
          else if (occupied) dotStyle = S.seatOccupied;

          return (
            <div
              key={idx}
              style={{
                ...S.seatWrapper,
                left: `${pos[0]}%`,
                top: `${pos[1]}%`,
                zIndex: isActor ? 10 : 2, // pop actor to top
              }}
            >
              {/* Showdown Hole Cards */}
              {phase === 'showdown' && playerShownCards.length > 0 && (
                <div style={S.showdownRow}>
                  {playerShownCards[0].cards.map((c, i) => (
                    <div key={i} style={{ ...S.microCard, animationDelay: `${i * 0.1}s` }}>
                      <span style={{ ...S.microRank, color: cardColor(c) }}>{cardRank(c)}</span>
                      <span style={{ ...S.microSuit, color: cardColor(c) }}>{cardSuitChar(c)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* The physical dot */}
              <div style={dotStyle}>
                {isDealer && occupied && <span style={S.dealerBadge}>D</span>}
              </div>

              {/* Name & Stack Element + Timer Ring container */}
              {occupied && (
                <div style={{ position: 'relative' }}>
                  {isActor && turnEndTime ? (
                    <TimerRingBox endTime={turnEndTime} totalTime={turnTotalTime}>
                      <div style={S.nameBoxInner}>
                        <span style={S.nameText}>{displayName}</span>
                        <span style={S.stackText}>{fmtPot(stack)}</span>
                      </div>
                    </TimerRingBox>
                  ) : (
                    <div style={S.nameBox}>
                      <span style={S.nameText}>{displayName}</span>
                      <span style={S.stackText}>{isAllIn ? 'All-In' : fmtPot(stack)}</span>
                    </div>
                  )}

                  {/* Last Action Label (e.g., CHECK, CALL) */}
                  {lastAction && (
                    <div key={lastAction + Date.now() /* force re-anim */} style={S.actionBadge}>
                      {lastAction}
                    </div>
                  )}
                </div>
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
              {/* Card Back Animation — face-down dealing sprites */}
              <div style={S.cardRow}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{
                    ...S.cardBack,
                    animationDelay: `${i * 0.08}s`,
                  }} />
                ))}
              </div>
            </>
          ) : (
            <>
              {phaseLabel && <span style={S.phaseLabel}>{phaseLabel}</span>}

              {/* RIT or Standard Boards */}
              <div style={S.boardsContainer}>
                {boards.map((board, bIdx) => (
                  <div key={bIdx} style={S.cardRow}>
                    {board.map((card, i) => (
                      <div key={i} style={{
                        ...S.cardPip,
                        animationDelay: `${i * 0.05}s`,
                      }}>
                        <span style={{ ...S.cardRank, color: cardColor(card) }}>{cardRank(card)}</span>
                        <span style={{ ...S.cardSuit, color: cardColor(card) }}>{cardSuitChar(card)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {potTotal > 0 && (
                <div style={S.potRow}>
                  {/* Chip Stack SVG Icon */}
                  <svg width="10" height="10" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
                    <ellipse cx="10" cy="16" rx="8" ry="3" fill="#C0392B" stroke="#E74C3C" strokeWidth="0.5" />
                    <ellipse cx="10" cy="13" rx="8" ry="3" fill="#27AE60" stroke="#2ECC71" strokeWidth="0.5" />
                    <ellipse cx="10" cy="10" rx="8" ry="3" fill="#2980B9" stroke="#3498DB" strokeWidth="0.5" />
                    <ellipse cx="10" cy="7" rx="8" ry="3" fill="#F39C12" stroke="#F1C40F" strokeWidth="0.5" />
                  </svg>
                  <span style={S.potText}>{fmtPot(potTotal)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {handNumber > 0 && !isIdle && (
          <div style={S.handBadge}>#{handNumber}</div>
        )}
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
    height: 105,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
    transition: 'opacity 0.5s ease',
  },
  feltOval: {
    position: 'absolute',
    top: 6,
    left: '10%',
    width: '80%',
    height: 84,
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, #1a3a1a 30%, #0d1f0d 100%)',
    boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4), 0 0 8px rgba(180, 150, 60, 0.1)',
  },
  skeleton: {
    background: 'linear-gradient(90deg, #0d1f0d 25%, #1a3a1a 50%, #0d1f0d 75%)',
    backgroundSize: '200% 100%',
    animation: 'miniShimmer 1.5s ease-in-out infinite',
  },
  blindsBanner: {
    position: 'absolute',
    top: 2,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 3,
    alignItems: 'center',
    zIndex: 3,
    background: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    padding: '1px 5px',
    backdropFilter: 'blur(2px)',
  },
  blindsVariant: {
    fontSize: 5,
    fontWeight: 800,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  blindsText: {
    fontSize: 7,
    fontWeight: 800,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: '"Orbitron",monospace',
    letterSpacing: 0.3,
  },
  handBadge: {
    position: 'absolute',
    bottom: 2,
    right: 8,
    fontSize: 5,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.25)',
    fontFamily: 'monospace',
    zIndex: 3,
  },

  // ── Seat Layout ──
  seatWrapper: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  seatEmpty: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  seatOccupied: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#2ECC71',
    border: '1px solid rgba(46,204,113,0.6)',
    boxShadow: '0 0 3px rgba(46,204,113,0.4)',
    position: 'relative',
  },
  seatActor: {
    width: 10, height: 10, borderRadius: '50%',
    background: '#FFD700',
    border: '1.5px solid rgba(255,215,0,0.8)',
    animation: 'miniActorPulse 1.5s ease-in-out infinite',
    position: 'relative',
  },
  seatAllIn: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#E74C3C',
    border: '1px solid rgba(231,76,60,0.6)',
    boxShadow: '0 0 4px rgba(231,76,60,0.5)',
    position: 'relative',
  },
  seatFolded: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.06)',
    position: 'relative',
  },

  dealerBadge: {
    position: 'absolute',
    top: -8, left: '50%', transform: 'translateX(-50%)',
    fontSize: 5, fontWeight: 900, color: '#000',
    background: '#FFD700', borderRadius: 3, padding: '0 2px',
    lineHeight: '8px', letterSpacing: 0.3,
  },

  // ── Name Tag & Badges ──
  nameBox: {
    width: 42,
    height: 22,
    marginTop: 4,
    background: 'rgba(0,0,0,0.7)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(2px)',
    overflow: 'hidden',
  },
  nameBoxInner: {
    width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.85)',
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 6, fontWeight: 700, color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase', letterSpacing: 0.2, whiteSpace: 'nowrap',
    textOverflow: 'clip', overflow: 'hidden', maxWidth: '90%',
  },
  stackText: {
    fontSize: 8, fontWeight: 800, color: '#FFD700',
    fontFamily: '"Orbitron",monospace', letterSpacing: 0.2,
    marginTop: -1,
  },
  actionBadge: {
    position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
    background: '#0ea5e9', color: '#fff', fontSize: 6, fontWeight: 800,
    padding: '1px 3px', borderRadius: 3, textTransform: 'uppercase',
    boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
    animation: 'miniStickerFloat 2s ease-out forwards',
    pointerEvents: 'none',
  },

  // ── Showdown Hole Cards ──
  showdownRow: {
    display: 'flex', gap: 1, position: 'absolute', top: -16, zIndex: 11,
  },
  microCard: {
    width: 10, height: 14, borderRadius: 2, background: 'rgba(255,255,255,0.95)',
    border: '0.5px solid rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
    animation: 'miniCardDeal 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
  },
  microRank: { fontSize: 6, fontWeight: 800, lineHeight: 1, fontFamily: '"Orbitron",monospace' },
  microSuit: { fontSize: 5, lineHeight: 1, marginTop: -1 },

  // ── Center content ──
  centerContent: {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    zIndex: 1, pointerEvents: 'none', width: '70%',
  },
  waitingText: { fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3, fontStyle: 'italic' },
  dealingDots: { fontSize: 8, color: 'rgba(255,215,0,0.4)', letterSpacing: 2, animation: 'miniDealingPulse 1.5s ease-in-out infinite' },
  phaseLabel: { fontSize: 6, fontWeight: 800, color: 'rgba(255,215,0,0.7)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: '"Orbitron",monospace' },
  
  boardsContainer: {
    display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center',
  },
  cardRow: { display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' },
  cardPip: {
    width: 14, height: 20, borderRadius: 2, background: 'rgba(255,255,255,0.92)',
    border: '0.5px solid rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
    animation: 'miniCardDeal 0.3s ease-out both',
  },
  cardRank: { fontSize: 8, fontWeight: 800, lineHeight: 1, fontFamily: '"Orbitron",monospace' },
  cardSuit: { fontSize: 6, lineHeight: 1, marginTop: -1 },

  // ── Card Backs (Dealing Phase) ──
  cardBack: {
    width: 12, height: 18, borderRadius: 2,
    background: 'linear-gradient(135deg, #8B0000 0%, #B22222 40%, #DC143C 60%, #8B0000 100%)',
    border: '0.5px solid rgba(139,0,0,0.6)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.5), inset 0 0 4px rgba(255,255,255,0.1)',
    animation: 'miniCardFlip 0.4s ease-out both',
  },

  // ── Pot Row (Chip Icon + Text) ──
  potRow: {
    display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center',
  },
  potText: {
    fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.2,
    fontFamily: '"Orbitron",monospace', textShadow: '0 1px 3px rgba(0,0,0,0.7)',
  },
};
