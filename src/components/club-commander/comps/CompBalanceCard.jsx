/**
 * CompBalanceCard Component
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * Shows player's comp balance
 */
import React from 'react';
import { Wallet, TrendingUp, Gift, History, Lock } from 'lucide-react';

export default function CompBalanceCard({
  balance,
  venueName,
  onViewHistory,
  onRedeem,
  compact = false
}) {
  if (!balance) {
    return (
      <div
        className="p-4 rounded-xl border text-center"
        style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
      >
        <Wallet size={24} className="mx-auto text-gray-500 mb-2" />
        <p className="text-gray-400 text-sm">No comp balance</p>
      </div>
    );
  }

  const currentBalance = parseFloat(balance.current_balance) || 0;
  const lifetimeEarned = parseFloat(balance.lifetime_earned) || 0;
  const lifetimeRedeemed = parseFloat(balance.lifetime_redeemed) || 0;

  if (compact) {
    return (
      <div
        className="p-3 rounded-lg border flex items-center justify-between"
        style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#22C55E20' }}
          >
            <Wallet size={20} className="text-green-400" />
          </div>
          <div>
            <div className="text-xs text-gray-400">Comp Balance</div>
            <div className="text-lg font-bold text-white">
              ${currentBalance.toFixed(2)}
            </div>
          </div>
        </div>
        {onRedeem && currentBalance > 0 && (
          <button
            onClick={onRedeem}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: '#1877F2', color: '#FFFFFF' }}
          >
            Redeem
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
    >
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: '#374151' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#22C55E20' }}
            >
              <Wallet size={24} className="text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Comp Balance</h3>
              {venueName && (
                <p className="text-sm text-gray-400">{venueName}</p>
              )}
            </div>
          </div>
          {balance.is_frozen && (
            <div className="flex items-center gap-1 text-red-400 text-sm">
              <Lock size={14} />
              Frozen
            </div>
          )}
        </div>
      </div>

      {/* Balance */}
      <div className="p-6 text-center">
        <div className="text-4xl font-bold text-green-400">
          ${currentBalance.toFixed(2)}
        </div>
        <div className="text-sm text-gray-500 mt-1">Available Balance</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px bg-gray-700">
        <div className="p-4 text-center" style={{ backgroundColor: '#1F2937' }}>
          <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
            <TrendingUp size={14} />
            <span className="text-xs">Lifetime Earned</span>
          </div>
          <div className="text-lg font-semibold text-white">
            ${lifetimeEarned.toFixed(2)}
          </div>
        </div>
        <div className="p-4 text-center" style={{ backgroundColor: '#1F2937' }}>
          <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
            <Gift size={14} />
            <span className="text-xs">Total Redeemed</span>
          </div>
          <div className="text-lg font-semibold text-white">
            ${lifetimeRedeemed.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Last Activity */}
      {(balance.last_earned_at || balance.last_redeemed_at) && (
        <div className="px-4 py-3 border-t text-xs text-gray-500" style={{ borderColor: '#374151' }}>
          {balance.last_earned_at && (
            <div>Last earned: {new Date(balance.last_earned_at).toLocaleDateString()}</div>
          )}
        </div>
      )}

      {/* Actions */}
      {(onViewHistory || onRedeem) && (
        <div
          className="p-4 flex gap-2 border-t"
          style={{ borderColor: '#374151', backgroundColor: '#111827' }}
        >
          {onViewHistory && (
            <button
              onClick={onViewHistory}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: '#374151', color: '#E5E7EB' }}
            >
              <History size={16} />
              History
            </button>
          )}
          {onRedeem && (
            <button
              onClick={onRedeem}
              disabled={currentBalance <= 0 || balance.is_frozen}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#1877F2', color: '#FFFFFF' }}
            >
              <Gift size={16} />
              Redeem
            </button>
          )}
        </div>
      )}
    </div>
  );
}
