/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DYNAMIC WALLET — Club Arena Real-Time Balance Display
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Overlays live balance data on the metallic wallet background image.
 * Two variants:
 *   'player' — Chip Wallet (personal chip_balance), hides Agent if non-agent
 *   'owner'  — Club Bank (club treasury/chip_treasury), always shows Agent
 *
 * Props:
 *   variant         — 'player' | 'owner' (auto-detected from role if omitted)
 *   role            — 'player' | 'agent' | 'admin' | 'owner' (for auto-detect)
 *   diamondBalance  — global diamond balance (from profiles table)
 *   bbjAmount       — club BBJ pool (from bbj_pools)
 *   chipBalance     — club_members.chip_balance (player view)
 *   clubBankBalance — clubs.chip_treasury (owner view — the club's main bank)
 *   agentBalance    — agents.business_balance (null hides the row)
 *   promoBalance    — club_members.promo_balance
 *   bbjAnimating    — triggers pulse animation on BBJ when new chips added
 *   compact         — smaller version for sidebars/modals (default false)
 *   onTapSlot       — callback(slotName) when user taps a wallet row
 */

import { useState, useEffect, useRef } from 'react';

// ─── Animated counter — smoothly increments to target value ────────────
function AnimatedCounter({ value, duration = 800, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(value);
  const animRef = useRef(null);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    prevRef.current = to;

    const start = performance.now();
    const step = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [value, duration]);

  return <>{prefix}{(display || 0).toLocaleString()}{suffix}</>;
}

// ─── Background image paths ────────────────────────────────────────────
const BG_IMAGES = {
  player: '/assets/club-arena/wallet_bg.png',
  owner:  '/assets/club-arena/wallet_owner_bg_web.png',
};

export default function DynamicWallet({
  variant,                    // 'player' | 'owner' — explicit override
  role = 'player',            // used for auto-detect when variant not set
  diamondBalance = 0,
  bbjAmount = 0,
  chipBalance = 0,            // player's personal chip balance
  clubBankBalance = null,     // club treasury (owner view) — null = use chipBalance
  agentBalance = null,        // null = hide agent row
  promoBalance = 0,
  bbjAnimating = false,
  compact = false,
  onTapSlot = null,
}) {
  // Auto-detect variant from role if not explicitly set
  const resolvedVariant = variant || (['owner', 'admin'].includes(role) ? 'owner' : 'player');
  const isOwner = resolvedVariant === 'owner';
  const showAgent = agentBalance !== null && agentBalance !== undefined;

  // Owner shows Club Bank (treasury); player shows Chip Wallet (personal balance)
  const topRowValue = isOwner && clubBankBalance !== null ? clubBankBalance : chipBalance;

  const scale = compact ? 0.7 : 1;
  const containerW = Math.round(286 * scale);
  const bgImage = BG_IMAGES[resolvedVariant] || BG_IMAGES.player;

  return (
    <div
      style={{
        position: 'relative',
        width: containerW,
        aspectRatio: '572 / 600',
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* ═══ DIAMOND WALLET BALANCE — top black slot ═══ */}
      <div
        onClick={() => onTapSlot?.('diamonds')}
        style={{
          position: 'absolute',
          top: '9.5%',
          left: '25%',
          width: '55%',
          height: '6%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: onTapSlot ? 'pointer' : 'default',
        }}
      >
        <span style={{
          color: '#E0F7FF',
          fontSize: `${Math.round(16 * scale)}px`,
          fontWeight: 800,
          fontFamily: "'Rajdhani', 'Orbitron', monospace",
          textShadow: '0 0 8px rgba(100,200,255,0.8), 0 0 20px rgba(100,200,255,0.3)',
          letterSpacing: 1,
        }}>
          <AnimatedCounter value={diamondBalance} prefix="💎 " />
        </span>
      </div>

      {/* ═══ BAD BEAT JACKPOT — middle riveted slot ═══ */}
      <div
        onClick={() => onTapSlot?.('bbj')}
        style={{
          position: 'absolute',
          top: '43.5%',
          left: '15%',
          width: '70%',
          height: '7%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: onTapSlot ? 'pointer' : 'default',
          animation: bbjAnimating ? 'walletBbjPulse 0.6s ease-out' : 'none',
        }}
      >
        <span style={{
          color: '#FFD700',
          fontSize: `${Math.round(18 * scale)}px`,
          fontWeight: 900,
          fontFamily: "'Rajdhani', 'Orbitron', monospace",
          textShadow: '0 0 10px rgba(255,215,0,0.9), 0 0 25px rgba(255,215,0,0.4)',
          letterSpacing: 2,
        }}>
          <AnimatedCounter value={bbjAmount} />
        </span>
      </div>

      {/* ═══ ROW 1: Club Bank (owner) / Chip Wallet (player) ═══ */}
      <div
        onClick={() => onTapSlot?.(isOwner ? 'clubBank' : 'chips')}
        style={{
          position: 'absolute',
          top: '59.5%',
          left: '35%',
          width: '55%',
          height: '7.5%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: '8%',
          cursor: onTapSlot ? 'pointer' : 'default',
          boxSizing: 'border-box',
        }}
      >
        <span style={{
          color: isOwner ? '#FFD700' : '#E4E6EB',
          fontSize: `${Math.round(14 * scale)}px`,
          fontWeight: 700,
          fontFamily: "'Rajdhani', monospace",
          textShadow: isOwner
            ? '0 0 6px rgba(255,215,0,0.4), 0 1px 3px rgba(0,0,0,0.8)'
            : '0 1px 3px rgba(0,0,0,0.8)',
        }}>
          <AnimatedCounter value={topRowValue} />
        </span>
      </div>

      {/* ═══ ROW 2: Agent Wallet ═══ */}
      {(showAgent || isOwner) && (
        <div
          onClick={() => onTapSlot?.('agent')}
          style={{
            position: 'absolute',
            top: '71%',
            left: '35%',
            width: '55%',
            height: '7.5%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '8%',
            cursor: onTapSlot ? 'pointer' : 'default',
            boxSizing: 'border-box',
          }}
        >
          <span style={{
            color: '#B0B3B8',
            fontSize: `${Math.round(14 * scale)}px`,
            fontWeight: 700,
            fontFamily: "'Rajdhani', monospace",
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}>
            <AnimatedCounter value={agentBalance || 0} />
          </span>
        </div>
      )}

      {/* ═══ ROW 3: Promo Wallet ═══ */}
      <div
        onClick={() => onTapSlot?.('promo')}
        style={{
          position: 'absolute',
          top: '82.5%',
          left: '35%',
          width: '55%',
          height: '7.5%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: '8%',
          cursor: onTapSlot ? 'pointer' : 'default',
          boxSizing: 'border-box',
        }}
      >
        <span style={{
          color: promoBalance > 0 ? '#4ECDC4' : '#65676B',
          fontSize: `${Math.round(14 * scale)}px`,
          fontWeight: 700,
          fontFamily: "'Rajdhani', monospace",
          textShadow: promoBalance > 0 ? '0 0 6px rgba(78,205,196,0.4)' : 'none',
        }}>
          <AnimatedCounter value={promoBalance} />
        </span>
      </div>

      {/* ═══ CSS Keyframes ═══ */}
      <style jsx>{`
        @keyframes walletBbjPulse {
          0% { transform: scale(1); filter: brightness(1); }
          30% { transform: scale(1.08); filter: brightness(1.4); }
          100% { transform: scale(1); filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}
