/**
 * PlayerSeat -- premium-style player seat on the game table
 * Renders avatar, name, stack, position badges, action tags, timer ring, bet display
 */
import React, { useEffect, useState } from 'react';
import SPImage from '../../common/SPImage';

const ACTION_COLORS = {
  fold: 'bg-gray-500',
  check: 'bg-green-500',
  bet: 'bg-orange-500',
  raise: 'bg-orange-500',
  call: 'bg-green-500',
  allin: 'bg-red-500',
};

const ACTION_LABELS = {
  fold: 'FOLD',
  check: 'CHECK',
  bet: 'BET',
  raise: 'RAISE',
  call: 'CALL',
  allin: 'ALL IN',
};

function formatStack(n) {
  if (n == null || n <= 0) return '0.00';
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBet(n) {
  if (!n || n <= 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function PlayerSeat({
  player,
  isActive = false,
  isDealer = false,
  isSB = false,
  isBB = false,
  actionTag = null,
  currentBet = 0,
  timerProgress = 1,
  timerUrgent = false,
  isEmpty = false,
  onJoinSeat,
  style = {},
}) {
  const [tagVisible, setTagVisible] = useState(false);

  useEffect(() => {
    if (actionTag) {
      setTagVisible(false);
      requestAnimationFrame(() => setTagVisible(true));
    } else {
      setTagVisible(false);
    }
  }, [actionTag]);

  // Empty seat
  if (isEmpty || !player) {
    return (
      <div className="absolute flex flex-col items-center" style={style}>
        <button
          onClick={onJoinSeat}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-800/60 border-2 border-dashed border-gray-600 flex flex-col items-center justify-center hover:border-gray-400 hover:bg-gray-700/60 transition-all"
        >
          <span className="text-gray-400 text-2xl font-light">+</span>
          <span className="text-gray-500 text-[10px] mt-0.5">Join</span>
        </button>
      </div>
    );
  }

  const { name = 'Player', stack = 0, avatarUrl, isFolded, isAllIn, isSittingOut } = player;
  const dimmed = isFolded || isSittingOut;

  // Timer ring SVG
  const ringRadius = 34;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - timerProgress);

  return (
    <div className="absolute flex flex-col items-center" style={style}>
      {/* Action Tag */}
      {actionTag && (
        <div
          className={`mb-1 px-2.5 py-0.5 rounded-full text-white text-[11px] font-semibold tracking-wide ${ACTION_COLORS[actionTag.type] || 'bg-gray-500'} transition-all duration-200 ${tagVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          {ACTION_LABELS[actionTag.type] || actionTag.type?.toUpperCase()}
          {actionTag.amount ? ` ${formatBet(actionTag.amount)}` : ''}
        </div>
      )}

      {/* Avatar container with timer ring */}
      <div className="relative">
        {/* Timer ring (only when active) */}
        {isActive && (
          <svg
            className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)]"
            viewBox="0 0 76 76"
          >
            {/* Track */}
            <circle cx="38" cy="38" r={ringRadius} fill="none" stroke="#1f2937" strokeWidth="3" />
            {/* Progress */}
            <circle
              cx="38" cy="38" r={ringRadius}
              fill="none"
              stroke={timerUrgent ? '#ef4444' : '#f59e0b'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              style={{
                transform: 'rotate(-90deg)',
                transformOrigin: '38px 38px',
                transition: 'stroke-dashoffset 0.3s linear',
                filter: timerUrgent
                  ? 'drop-shadow(0 0 6px rgba(239,68,68,0.8))'
                  : 'drop-shadow(0 0 4px rgba(245,158,11,0.6))',
              }}
            />
          </svg>
        )}

        {/* Avatar circle */}
        <div
          className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-[3px] transition-all duration-300 ${
            isActive
              ? 'border-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.5)]'
              : isAllIn
                ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                : 'border-gray-600'
          } ${dimmed ? 'opacity-40 grayscale' : ''}`}
        >
          {avatarUrl ? (
            <SPImage src={avatarUrl} alt={name} fill style={{ objectFit: 'cover' }} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white font-bold text-lg sm:text-xl">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Position badges */}
        {isDealer && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-400 text-black text-[10px] sm:text-xs font-bold flex items-center justify-center shadow-md">
            D
          </span>
        )}
        {isSB && !isDealer && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-500 text-white text-[10px] sm:text-xs font-bold flex items-center justify-center shadow-md">
            SB
          </span>
        )}
        {isBB && (
          <span className="absolute -top-0.5 -left-0.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-500 text-white text-[10px] sm:text-xs font-bold flex items-center justify-center shadow-md">
            BB
          </span>
        )}

        {/* Sitting out overlay */}
        {isSittingOut && (
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
            <span className="text-gray-300 text-[9px] font-semibold">SITTING OUT</span>
          </div>
        )}
      </div>

      {/* Name + Stack */}
      <div className={`mt-1 text-center min-w-[70px] max-w-[90px] ${dimmed ? 'opacity-50' : ''}`}>
        <p className="text-white text-[11px] sm:text-xs font-semibold truncate">{name}</p>
        <p className="text-amber-300 text-[10px] sm:text-[11px] font-bold">{formatStack(stack)}</p>
      </div>

      {/* Current bet display */}
      {currentBet > 0 && !isFolded && (
        <div className="mt-0.5 text-amber-400 text-[10px] sm:text-[11px] font-bold">
          {formatBet(currentBet)}
        </div>
      )}
    </div>
  );
}
