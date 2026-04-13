/**
 * HeroSection -- Hero's hole cards, hand strength label, name and stack
 * Positioned at the bottom of the game table, emphasized styling
 */
import React from 'react';
import { getCardImagePath } from '../../../lib/CardAssets';

const HAND_STRENGTH_COLORS = {
  'Royal Flush': '#f59e0b',
  'Straight Flush': '#f59e0b',
  'Four of a Kind': '#f59e0b',
  'Full House': '#22c55e',
  'Flush': '#22c55e',
  'Straight': '#22c55e',
  'Three of a Kind': '#22c55e',
  'Two Pair': '#22c55e',
  'One Pair': '#a3a3a3',
  'High Card': '#6b7280',
};

function formatStack(n) {
  if (n == null || n <= 0) return '0.00';
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HeroSection({
  name = 'Hero',
  stack = 0,
  avatarUrl,
  holeCards = [],
  handStrength = '',
  isMyTurn = false,
  isFolded = false,
}) {
  const card1 = holeCards[0] != null ? holeCards[0] : null;
  const card2 = holeCards[1] != null ? holeCards[1] : null;
  const strengthColor = HAND_STRENGTH_COLORS[handStrength] || '#6b7280';

  return (
    <div className={`flex items-center gap-3 px-4 py-2 ${isFolded ? 'opacity-40' : ''}`}>
      {/* Hero avatar */}
      <div
        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-[3px] flex-shrink-0 transition-all duration-300 ${
          isMyTurn
            ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]'
            : 'border-gray-500'
        }`}
        style={isMyTurn ? { animation: 'hero-pulse 2s ease-in-out infinite' } : {}}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-purple-800 flex items-center justify-center text-white font-bold text-xl">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Hole cards */}
      <div className="flex gap-1">
        {[card1, card2].map((cardIdx, i) => (
          <div
            key={i}
            className="relative"
            style={{ perspective: '800px', width: '52px', height: '73px' }}
          >
            {cardIdx != null ? (
              <div
                className={`w-full h-full rounded-md overflow-hidden shadow-lg ${
                  isMyTurn ? 'ring-1 ring-yellow-400/40' : ''
                }`}
                style={{
                  animation: 'card-deal 0.4s ease-out',
                  animationDelay: `${i * 100}ms`,
                  animationFillMode: 'both',
                }}
              >
                <img
                  src={getCardImagePath(cardIdx)}
                  alt={`Hole card ${i + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="w-full h-full rounded-md bg-gradient-to-br from-blue-900 to-blue-700 border border-blue-600 shadow-md" />
            )}
          </div>
        ))}
      </div>

      {/* Name, stack, hand strength */}
      <div className="flex flex-col min-w-0">
        <span className="text-white text-xs sm:text-sm font-semibold truncate">{name}</span>
        <span className="text-amber-300 text-[11px] sm:text-xs font-bold">{formatStack(stack)}</span>
        {handStrength && !isFolded && (
          <span
            className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide mt-0.5"
            style={{ color: strengthColor }}
          >
            {handStrength}
          </span>
        )}
      </div>

      <style>{`
        @keyframes hero-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(250,204,21,0.4); }
          50% { box-shadow: 0 0 24px rgba(250,204,21,0.7); }
        }
        @keyframes card-deal {
          0% { opacity: 0; transform: rotateY(90deg) scale(0.7); }
          100% { opacity: 1; transform: rotateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
