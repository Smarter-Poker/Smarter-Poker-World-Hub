/**
 * ActionButtons -- premium-style Fold / Check-Call / Raise-Bet button bar
 * Shown at the bottom of the screen when it is the hero's turn to act.
 */
import React from 'react';

function formatAmount(n) {
  if (!n || n <= 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function ActionButtons({
  amountToCall = 0,
  minBet = 0,
  canCheck = false,
  isRaise = false,
  onFold,
  onCheckCall,
  onOpenBetSlider,
  disabled = false,
}) {
  const checkCallLabel = canCheck || amountToCall <= 0
    ? 'CHECK'
    : `CALL ${formatAmount(amountToCall)}`;

  const raiseBetLabel = isRaise || amountToCall > 0
    ? `RAISE`
    : `BET`;

  return (
    <div className="flex gap-2 w-full px-3 py-2">
      {/* Fold */}
      <button
        onClick={onFold}
        disabled={disabled}
        className="flex-1 h-11 sm:h-12 rounded-lg font-bold text-white text-sm sm:text-base
          bg-gradient-to-b from-red-500 to-red-700
          active:from-red-700 active:to-red-800 active:scale-[0.97]
          disabled:opacity-40 disabled:pointer-events-none
          transition-all duration-100 shadow-md"
      >
        FOLD
      </button>

      {/* Check / Call */}
      <button
        onClick={onCheckCall}
        disabled={disabled}
        className="flex-1 h-11 sm:h-12 rounded-lg font-bold text-white text-sm sm:text-base
          bg-gradient-to-b from-green-500 to-green-700
          active:from-green-700 active:to-green-800 active:scale-[0.97]
          disabled:opacity-40 disabled:pointer-events-none
          transition-all duration-100 shadow-md"
      >
        {checkCallLabel}
      </button>

      {/* Raise / Bet */}
      <button
        onClick={onOpenBetSlider}
        disabled={disabled}
        className="flex-1 h-11 sm:h-12 rounded-lg font-bold text-white text-sm sm:text-base
          bg-gradient-to-b from-orange-500 to-orange-700
          active:from-orange-700 active:to-orange-800 active:scale-[0.97]
          disabled:opacity-40 disabled:pointer-events-none
          transition-all duration-100 shadow-md"
      >
        {raiseBetLabel}
      </button>
    </div>
  );
}
