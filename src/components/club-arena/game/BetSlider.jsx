/**
 * BetSlider -- PokerBros-style bet sizing interface
 * Replaces action buttons when player taps Raise/Bet.
 * Presets change based on street: preflop (2X/3X/4X) vs post-flop (1/2/2/3/POT)
 */
import React, { useState, useCallback } from 'react';

function formatAmount(n) {
  if (!n || n <= 0) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function BetSlider({
  minBet = 0,
  maxBet = 0,
  potSize = 0,
  bigBlind = 0,
  isPreflop = false,
  onConfirm,
  onCancel,
}) {
  const [amount, setAmount] = useState(minBet);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const clamp = useCallback((v) => Math.max(minBet, Math.min(maxBet, Math.round(v))), [minBet, maxBet]);

  const presets = isPreflop
    ? [
        { label: '2X', value: clamp(bigBlind * 2) },
        { label: '3X', value: clamp(bigBlind * 3) },
        { label: '4X', value: clamp(bigBlind * 4) },
      ]
    : [
        { label: '1/2 POT', value: clamp(Math.floor(potSize * 0.5)) },
        { label: '2/3 POT', value: clamp(Math.floor(potSize * 0.667)) },
        { label: 'POT', value: clamp(potSize) },
      ];

  const handleSlider = (e) => setAmount(clamp(Number(e.target.value)));
  const handlePreset = (val) => setAmount(val);
  const handlePlus = () => setAmount((prev) => clamp(prev + bigBlind));
  const handleMinus = () => setAmount((prev) => clamp(prev - bigBlind));

  const handleAmountTap = () => {
    setEditText(String(amount));
    setEditing(true);
  };

  const handleEditConfirm = () => {
    const parsed = parseInt(editText, 10);
    if (!isNaN(parsed)) setAmount(clamp(parsed));
    setEditing(false);
  };

  const sliderPercent = maxBet > minBet ? ((amount - minBet) / (maxBet - minBet)) * 100 : 0;

  return (
    <div className="w-full px-3 py-2 bg-gray-900/95 backdrop-blur-sm rounded-t-xl border-t border-gray-700">
      {/* Amount display */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <button
          onClick={handleMinus}
          className="w-8 h-8 rounded-full bg-gray-700 text-white font-bold text-lg flex items-center justify-center active:bg-gray-600"
        >
          -
        </button>

        {editing ? (
          <input
            type="number"
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleEditConfirm}
            onKeyDown={(e) => e.key === 'Enter' && handleEditConfirm()}
            className="w-32 h-10 bg-gray-800 border border-amber-500 rounded-lg text-center text-white text-lg font-bold focus:outline-none"
          />
        ) : (
          <button
            onClick={handleAmountTap}
            className="h-10 px-6 bg-gray-800 border border-gray-600 rounded-lg text-amber-300 text-lg font-bold hover:border-amber-500 transition-colors"
          >
            {formatAmount(amount)}
          </button>
        )}

        <button
          onClick={handlePlus}
          className="w-8 h-8 rounded-full bg-gray-700 text-white font-bold text-lg flex items-center justify-center active:bg-gray-600"
        >
          +
        </button>
      </div>

      {/* Slider track */}
      <div className="relative mb-3 px-1">
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-75"
            style={{ width: `${sliderPercent}%` }}
          />
        </div>
        <input
          type="range"
          min={minBet}
          max={maxBet}
          step={bigBlind || 1}
          value={amount}
          onChange={handleSlider}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex justify-between text-[9px] text-gray-500 mt-0.5 px-0.5">
          <span>{formatAmount(minBet)}</span>
          <span>ALL IN</span>
        </div>
      </div>

      {/* Presets + Confirm */}
      <div className="flex gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => handlePreset(p.value)}
            className={`flex-1 h-10 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-100 ${
              amount === p.value
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}

        {/* All-In shortcut */}
        <button
          onClick={() => handlePreset(maxBet)}
          className={`flex-1 h-10 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-100 ${
            amount === maxBet
              ? 'bg-red-600 text-white shadow-md'
              : 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700'
          }`}
        >
          ALL IN
        </button>

        {/* Confirm */}
        <button
          onClick={() => onConfirm(amount)}
          className="flex-[1.3] h-10 rounded-lg font-bold text-white text-sm
            bg-gradient-to-b from-orange-500 to-orange-700
            active:from-orange-700 active:to-orange-800 active:scale-[0.97]
            shadow-md transition-all duration-100"
        >
          CONFIRM
        </button>
      </div>

      {/* Cancel hint */}
      <button
        onClick={onCancel}
        className="w-full mt-2 text-gray-500 text-[11px] text-center hover:text-gray-400"
      >
        Tap to cancel
      </button>
    </div>
  );
}
