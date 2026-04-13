/**
 * PotDisplay -- Pot amount, game type label, blinds info, net profit animation
 * Centered on the table below community cards
 */
import React, { useEffect, useState } from 'react';

function formatPot(n) {
  if (!n || n <= 0) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function PotDisplay({
  potAmount = 0,
  gameType = 'NLH',
  blinds = { small: 0, big: 0, ante: 0 },
  netProfit = null,
}) {
  const [showProfit, setShowProfit] = useState(false);
  const [scaled, setScaled] = useState(false);

  // Pot change scale animation
  useEffect(() => {
    if (potAmount > 0) {
      setScaled(true);
      const t = setTimeout(() => setScaled(false), 200);
      return () => clearTimeout(t);
    }
  }, [potAmount]);

  // Net profit float animation
  useEffect(() => {
    if (netProfit && netProfit > 0) {
      setShowProfit(true);
      const t = setTimeout(() => setShowProfit(false), 2000);
      return () => clearTimeout(t);
    } else {
      setShowProfit(false);
    }
  }, [netProfit]);

  const blindsText = blinds.ante
    ? `Blinds: ${formatPot(blinds.small)}/${formatPot(blinds.big)}/${formatPot(blinds.ante)}`
    : `Blinds: ${formatPot(blinds.small)}/${formatPot(blinds.big)}`;

  return (
    <div className="flex flex-col items-center gap-0.5 relative">
      {/* Game type */}
      <span className="text-amber-400 text-[10px] sm:text-[11px] font-semibold tracking-widest uppercase">
        {gameType}
      </span>

      {/* Pot amount */}
      <div
        className={`text-white text-base sm:text-lg font-bold transition-transform duration-200 ${
          scaled ? 'scale-110' : 'scale-100'
        }`}
      >
        POT {formatPot(potAmount)}
      </div>

      {/* Blinds */}
      <span className="text-gray-400 text-[9px] sm:text-[10px]">
        {blindsText}
      </span>

      {/* Net profit float */}
      {showProfit && netProfit > 0 && (
        <div
          className="absolute -top-6 left-1/2 -translate-x-1/2 text-yellow-300 text-lg font-bold pointer-events-none"
          style={{
            animation: 'float-up 1.5s ease-out forwards',
          }}
        >
          +{formatPot(netProfit)}
        </div>
      )}

      <style>{`
        @keyframes float-up {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          70% { opacity: 1; }
          100% { opacity: 0; transform: translateX(-50%) translateY(-40px); }
        }
      `}</style>
    </div>
  );
}
