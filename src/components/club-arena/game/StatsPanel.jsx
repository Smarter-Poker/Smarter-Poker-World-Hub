/**
 * StatsPanel -- "REAL TIME RESULT" slide-in panel (PokerBros-style)
 * Shows session duration, hands played, blinds, buy-in, winnings, VPIP
 */
import React from 'react';

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatAmount(n) {
  if (n == null) return '0';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const StatRow = ({ label, value, highlight }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-800">
    <span className="text-gray-400 text-sm">{label}</span>
    <span className={`text-sm font-semibold ${highlight ? 'text-green-400' : 'text-white'}`}>
      {value}
    </span>
  </div>
);

export default function StatsPanel({
  isOpen = false,
  onClose,
  sessionDuration = 0,
  handsPlayed = 0,
  blinds = { small: 0, big: 0 },
  ante = 0,
  buyIn = 0,
  winnings = 0,
  vpip = 0,
  observers = 0,
}) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[65%] max-w-[280px] bg-gray-900/95 backdrop-blur-sm border-r border-gray-700 shadow-2xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            {formatDuration(sessionDuration)}
          </div>
          <span className="text-white text-sm font-bold tracking-wide">REAL TIME RESULT</span>
        </div>

        {/* Stats */}
        <div className="px-4 py-2">
          <StatRow label="Tots" value={handsPlayed} />
          <StatRow label="Blinds" value={`${formatAmount(blinds.small)}/${formatAmount(blinds.big)}`} />
          {ante > 0 && <StatRow label="Ante" value={formatAmount(ante)} />}
          <StatRow label="Buy-In" value={formatAmount(buyIn)} />
          <StatRow label="Winnings" value={formatAmount(winnings)} highlight={winnings > 0} />
          <StatRow label="Current Table VPIP" value={`${vpip}%`} />
        </div>

        {/* Observers */}
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
            Observers ({observers})
          </div>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center text-xs"
        >
          X
        </button>
      </div>
    </>
  );
}
