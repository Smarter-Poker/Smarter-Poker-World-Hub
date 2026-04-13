/**
 * AdvanceToggles -- Pre-action toggle buttons shown when it is NOT hero's turn
 * Labels change dynamically based on whether a bet is pending.
 * Includes shortcut icons for hand history (left) and chat (right).
 */
import React, { useState } from 'react';

export default function AdvanceToggles({
  hasPendingBet = false,
  pendingBetAmount = 0,
  onToggle,
  onOpenHandHistory,
  onOpenChat,
}) {
  const [selected, setSelected] = useState(null);

  const toggles = hasPendingBet
    ? [
        { key: 'fold', label: 'Fold' },
        { key: 'call', label: `Call ${pendingBetAmount > 0 ? (pendingBetAmount >= 1000 ? (pendingBetAmount / 1000).toFixed(1) + 'K' : pendingBetAmount.toLocaleString()) : ''}` },
        { key: 'callany', label: 'Call Any' },
      ]
    : [
        { key: 'checkfold', label: 'Check / Fold' },
        { key: 'check', label: 'Check' },
        { key: 'callany', label: 'Call Any' },
      ];

  const handleToggle = (key) => {
    const next = selected === key ? null : key;
    setSelected(next);
    if (onToggle) onToggle(next);
  };

  return (
    <div className="flex items-center gap-1.5 w-full px-3 py-2">
      {/* Hand history shortcut */}
      <button
        onClick={onOpenHandHistory}
        className="w-9 h-9 rounded-full bg-gray-800/60 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700/60 transition-colors flex-shrink-0"
        title="Previous Hand"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M7 8h10M7 12h6" />
        </svg>
      </button>

      {/* Toggle buttons */}
      {toggles.map((t) => (
        <button
          key={t.key}
          onClick={() => handleToggle(t.key)}
          className={`flex-1 h-10 rounded-lg text-[11px] sm:text-xs font-semibold transition-all duration-150 flex flex-col items-center justify-center gap-0.5 ${
            selected === t.key
              ? 'bg-gray-600 text-white border border-gray-400'
              : 'bg-gray-800/70 text-gray-400 border border-gray-700 hover:bg-gray-700/70'
          }`}
        >
          {/* Toggle dot */}
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              selected === t.key ? 'bg-amber-400' : 'bg-gray-600'
            }`}
          />
          {t.label}
        </button>
      ))}

      {/* Chat shortcut */}
      <button
        onClick={onOpenChat}
        className="w-9 h-9 rounded-full bg-gray-800/60 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700/60 transition-colors flex-shrink-0"
        title="Chat"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
}
