/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DYNAMIC WALLET — Club Arena Real-Time Balance Display
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Overlays live balance data on the metallic wallet background image.
 * Role-aware: hides Agent Wallet row for non-agent players.
 *
 * Props:
 *   diamondBalance  — global diamond balance (from profiles table)
 *   bbjAmount       — club BBJ pool (from bbj_pools or club settings)
 *   chipBalance     — club_members.chip_balance
 *   agentBalance    — agents.business_balance (null hides the row)
 *   promoBalance    — club_members.promo_balance (0 if none)
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
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [value, duration]);

  return <>{prefix}{(display || 0).toLocaleString()}{suffix}</>;
}

export default function DynamicWallet({
  diamondBalance = 0,
  bbjAmount = 0,
  chipBalance = 0,
  agentBalance = null,    // null = hide agent row (player view)
  promoBalance = 0,
  bbjAnimating = false,
  compact = false,
  onTapSlot = null,
}) {
  const showAgent = agentBalance !== null && agentBalance !== undefined;
  const scale = compact ? 0.7 : 1;
  const containerW = Math.round(286 * scale);

  return (
    <div
      style={{
        position: 'relative',
        width: containerW,
        aspectRatio: '572 / 600',
        backgroundImage: 'url(/assets/club-arena/wallet_bg.png)',
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

      {/* ═══ CHIP WALLET — first row ═══ */}
      <div
        onClick={() => onTapSlot?.('chips')}
        style={{
          position: 'absolute',
          top: showAgent ? '59.5%' : '60%',
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
          color: '#E4E6EB',
          fontSize: `${Math.round(14 * scale)}px`,
          fontWeight: 700,
          fontFamily: "'Rajdhani', monospace",
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        }}>
          <AnimatedCounter value={chipBalance} />
        </span>
      </div>

      {/* ═══ AGENT WALLET — second row (hidden for players) ═══ */}
      {showAgent && (
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
            <AnimatedCounter value={agentBalance} />
          </span>
        </div>
      )}

      {/* ═══ PROMO WALLET — third row ═══ */}
      <div
        onClick={() => onTapSlot?.('promo')}
        style={{
          position: 'absolute',
          top: showAgent ? '82.5%' : '82.5%',
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
