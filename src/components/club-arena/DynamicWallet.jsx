/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DYNAMIC WALLET — Club Arena Real-Time Balance Display
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three variants auto-detected from role:
 *   'player' — Chip Wallet, Agent Wallet (if agent), Promo Wallet
 *   'owner'  — Club Bank (treasury), Agent Wallet, Promo Wallet
 *   'union'  — Union Bank, Clubs Wallet, Promo Wallet, Backup BBJ
 *
 * All variants: Diamond Balance (+buy), BBJ main pool
 * Union adds: Union Bank (+mint), Clubs Wallet, Backup BBJ
 * Tapping BBJ / Backup BBJ opens BBJ info (onOpenBBJ callback)
 * + buttons: Buy Diamonds (all), Mint Chips (union)
 */

import { useState, useEffect, useRef } from 'react';

// ─── Animated counter ──────────────────────────────────────────────────
function AnimatedCounter({ value, duration = 800, prefix = '' }) {
  const [display, setDisplay] = useState(value);
  const animRef = useRef(null);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current; const to = value;
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
  return <>{prefix}{(display || 0).toLocaleString()}</>;
}

// ─── "+" overlay button ────────────────────────────────────────────────
function PlusBtn({ onClick, top, right, scale = 1 }) {
  const s = Math.round(22 * scale);
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick?.(); }} style={{
      position: 'absolute', top, right, width: s, height: s, borderRadius: '50%',
      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
      color: '#E0F7FF', fontSize: Math.round(14 * scale), fontWeight: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', lineHeight: 1, padding: 0, zIndex: 5,
      backdropFilter: 'blur(4px)',
    }} title="Add more">+</button>
  );
}

// ─── Slot value row ────────────────────────────────────────────────────
function Slot({ top, value, color = '#E4E6EB', glow, fontSize, onClick,
  left = '35%', width = '55%', height = '7.5%', pr = '8%' }) {
  return (
    <div onClick={onClick} style={{
      position: 'absolute', top, left, width, height,
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      paddingRight: pr, cursor: onClick ? 'pointer' : 'default', boxSizing: 'border-box',
    }}>
      <span style={{
        color, fontSize: `${fontSize}px`, fontWeight: 700, fontFamily: "'Rajdhani', monospace",
        textShadow: glow ? `0 0 6px ${color}66, 0 1px 3px rgba(0,0,0,0.8)` : '0 1px 3px rgba(0,0,0,0.8)',
      }}>
        <AnimatedCounter value={value} />
      </span>
    </div>
  );
}

// ─── BBJ Jackpot slot ──────────────────────────────────────────────────
function BBJSlot({ top, left, width, height, value, animating, fontSize, onClick }) {
  return (
    <div onClick={onClick} style={{
      position: 'absolute', top, left, width, height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', animation: animating ? 'walletBbjPulse 0.6s ease-out' : 'none',
    }}>
      <span style={{
        color: '#FFD700', fontSize: `${fontSize}px`, fontWeight: 900,
        fontFamily: "'Rajdhani', 'Orbitron', monospace",
        textShadow: '0 0 10px rgba(255,215,0,0.9), 0 0 25px rgba(255,215,0,0.4)',
        letterSpacing: 2,
      }}>
        <AnimatedCounter value={value} />
      </span>
    </div>
  );
}

const BG = {
  player: { img: '/assets/club-arena/wallet_bg.png', ar: '572 / 600' },
  owner:  { img: '/assets/club-arena/wallet_owner_bg_web.png', ar: '572 / 600' },
  union:  { img: '/assets/club-arena/wallet_union_bg.png', ar: '600 / 630' },
};

export default function DynamicWallet({
  variant, role = 'player',
  diamondBalance = 0, bbjAmount = 0, chipBalance = 0,
  clubBankBalance = null, agentBalance = null, promoBalance = 0,
  unionBankBalance = null, clubsWalletBalance = null, backupBbjBalance = null,
  bbjAnimating = false, compact = false,
  onTapSlot = null, onOpenBBJ = null, onBuyDiamonds = null, onMintChips = null,
}) {
  const v = variant || (unionBankBalance !== null ? 'union' : ['owner', 'admin'].includes(role) ? 'owner' : 'player');
  const bg = BG[v] || BG.player;
  const isOwner = v === 'owner';
  const isUnion = v === 'union';
  const showAgent = agentBalance !== null && agentBalance !== undefined;
  const scale = compact ? 0.7 : 1;
  const containerW = Math.round(286 * scale);
  const fs = (b) => Math.round(b * scale);

  // ═══ UNION LAYOUT (6 slots) ═════════════════════════════════════════
  if (isUnion) return (
    <div style={{ position: 'relative', width: containerW, aspectRatio: bg.ar,
      backgroundImage: `url(${bg.img})`, backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
      userSelect: 'none', flexShrink: 0,
    }}>
      {/* Diamond Balance */}
      <div onClick={() => onTapSlot?.('diamonds')} style={{
        position: 'absolute', top: '8%', left: '18%', width: '50%', height: '5.5%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#E0F7FF', fontSize: `${fs(15)}px`, fontWeight: 800,
          fontFamily: "'Rajdhani', 'Orbitron', monospace",
          textShadow: '0 0 8px rgba(100,200,255,0.8)', letterSpacing: 1,
        }}><AnimatedCounter value={diamondBalance} prefix="💎 " /></span>
      </div>
      <PlusBtn onClick={onBuyDiamonds} top="7.5%" right="10%" scale={scale} />

      {/* BBJ Main */}
      <BBJSlot top="28%" left="12%" width="76%" height="7%" value={bbjAmount}
        animating={bbjAnimating} fontSize={fs(17)} onClick={onOpenBBJ} />

      {/* Union Bank + mint */}
      <Slot top="42%" value={unionBankBalance || 0} color="#FFD700" glow fontSize={fs(14)} onClick={() => onTapSlot?.('unionBank')} />
      <PlusBtn onClick={onMintChips} top="42%" right="6%" scale={scale} />

      {/* Clubs Wallet */}
      <Slot top="52%" value={clubsWalletBalance || 0} color="#B0B3B8" fontSize={fs(14)} onClick={() => onTapSlot?.('clubsWallet')} />

      {/* Promo */}
      <Slot top="62%" value={promoBalance} color={promoBalance > 0 ? '#4ECDC4' : '#65676B'}
        glow={promoBalance > 0} fontSize={fs(14)} onClick={() => onTapSlot?.('promo')} />

      {/* Backup BBJ */}
      <BBJSlot top="80%" left="12%" width="76%" height="7%" value={backupBbjBalance || 0}
        animating={false} fontSize={fs(15)} onClick={onOpenBBJ} />

      <style jsx>{`@keyframes walletBbjPulse {
        0% { transform: scale(1); filter: brightness(1); }
        30% { transform: scale(1.08); filter: brightness(1.4); }
        100% { transform: scale(1); filter: brightness(1); }
      }`}</style>
    </div>
  );

  // ═══ PLAYER / OWNER LAYOUT (5 slots) ════════════════════════════════
  const topRowVal = isOwner && clubBankBalance !== null ? clubBankBalance : chipBalance;
  return (
    <div style={{ position: 'relative', width: containerW, aspectRatio: bg.ar,
      backgroundImage: `url(${bg.img})`, backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
      userSelect: 'none', flexShrink: 0,
    }}>
      {/* Diamond Balance */}
      <div onClick={() => onTapSlot?.('diamonds')} style={{
        position: 'absolute', top: '9.5%', left: '25%', width: '48%', height: '6%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#E0F7FF', fontSize: `${fs(16)}px`, fontWeight: 800,
          fontFamily: "'Rajdhani', 'Orbitron', monospace",
          textShadow: '0 0 8px rgba(100,200,255,0.8), 0 0 20px rgba(100,200,255,0.3)',
          letterSpacing: 1,
        }}><AnimatedCounter value={diamondBalance} prefix="💎 " /></span>
      </div>
      <PlusBtn onClick={onBuyDiamonds} top="9%" right="12%" scale={scale} />

      {/* BBJ */}
      <BBJSlot top="43.5%" left="15%" width="70%" height="7%" value={bbjAmount}
        animating={bbjAnimating} fontSize={fs(18)} onClick={onOpenBBJ} />

      {/* Row 1 */}
      <Slot top="59.5%" value={topRowVal} color={isOwner ? '#FFD700' : '#E4E6EB'}
        glow={isOwner} fontSize={fs(14)} onClick={() => onTapSlot?.(isOwner ? 'clubBank' : 'chips')} />

      {/* Row 2: Agent */}
      {(showAgent || isOwner) && (
        <Slot top="71%" value={agentBalance || 0} color="#B0B3B8" fontSize={fs(14)}
          onClick={() => onTapSlot?.('agent')} />
      )}

      {/* Row 3: Promo */}
      <Slot top="82.5%" value={promoBalance} color={promoBalance > 0 ? '#4ECDC4' : '#65676B'}
        glow={promoBalance > 0} fontSize={fs(14)} onClick={() => onTapSlot?.('promo')} />

      <style jsx>{`@keyframes walletBbjPulse {
        0% { transform: scale(1); filter: brightness(1); }
        30% { transform: scale(1.08); filter: brightness(1.4); }
        100% { transform: scale(1); filter: brightness(1); }
      }`}</style>
    </div>
  );
}
