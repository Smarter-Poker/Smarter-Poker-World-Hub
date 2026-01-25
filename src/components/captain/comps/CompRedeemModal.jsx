/**
 * CompRedeemModal Component
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * Modal for redeeming player comps
 */
import React, { useState } from 'react';
import { X, DollarSign, UtensilsCrossed, ShoppingBag, Trophy, Banknote, Hotel, Gift } from 'lucide-react';

const REDEMPTION_TYPES = [
  { value: 'food', label: 'Food & Beverage', icon: UtensilsCrossed, color: '#F59E0B' },
  { value: 'merchandise', label: 'Merchandise', icon: ShoppingBag, color: '#8B5CF6' },
  { value: 'tournament', label: 'Tournament Entry', icon: Trophy, color: '#3B82F6' },
  { value: 'cash', label: 'Cash Out', icon: Banknote, color: '#22C55E' },
  { value: 'hotel', label: 'Hotel', icon: Hotel, color: '#EC4899' },
  { value: 'other', label: 'Other', icon: Gift, color: '#6B7280' }
];

export default function CompRedeemModal({
  player,
  currentBalance = 0,
  onRedeem,
  onClose,
  isLoading = false
}) {
  const [amount, setAmount] = useState('');
  const [redemptionType, setRedemptionType] = useState('food');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    if (parseFloat(amount) > currentBalance) return;

    onRedeem({
      amount: parseFloat(amount),
      redemption_type: redemptionType,
      description
    });
  };

  const inputStyle = {
    backgroundColor: '#111827',
    borderColor: '#374151',
    color: '#E5E7EB'
  };

  const selectedType = REDEMPTION_TYPES.find(t => t.value === redemptionType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div
        className="w-full max-w-md rounded-xl"
        style={{ backgroundColor: '#1F2937' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: '#374151' }}
        >
          <h2 className="text-lg font-semibold text-white">Redeem Comps</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Balance Display */}
          <div
            className="p-4 rounded-lg text-center"
            style={{ backgroundColor: '#111827' }}
          >
            <div className="text-sm text-gray-400 mb-1">Available Balance</div>
            <div className="text-3xl font-bold text-green-400">
              ${currentBalance.toFixed(2)}
            </div>
            {player?.display_name && (
              <div className="text-sm text-gray-500 mt-1">{player.display_name}</div>
            )}
          </div>

          {/* Redemption Type */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Redemption Type</label>
            <div className="grid grid-cols-3 gap-2">
              {REDEMPTION_TYPES.map(type => {
                const Icon = type.icon;
                const isSelected = redemptionType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setRedemptionType(type.value)}
                    className={`p-3 rounded-lg flex flex-col items-center gap-1 transition-colors ${
                      isSelected ? 'ring-2' : ''
                    }`}
                    style={{
                      backgroundColor: isSelected ? `${type.color}20` : '#111827',
                      ringColor: type.color
                    }}
                  >
                    <Icon size={20} style={{ color: isSelected ? type.color : '#6B7280' }} />
                    <span className={`text-xs ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                      {type.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Amount to Redeem</label>
            <div className="relative">
              <DollarSign
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={currentBalance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border focus:outline-none focus:border-blue-500 text-lg"
                style={inputStyle}
                placeholder="0.00"
                required
              />
            </div>
            {/* Quick Amount Buttons */}
            <div className="flex gap-2 mt-2">
              {[5, 10, 25, currentBalance].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAmount(preset.toString())}
                  className="flex-1 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-white transition-colors"
                  style={{ backgroundColor: '#374151' }}
                >
                  {idx === 3 ? 'All' : `$${preset}`}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
              style={inputStyle}
              placeholder={`e.g., ${selectedType?.label || 'Redemption'} details`}
            />
          </div>

          {/* Error for insufficient balance */}
          {parseFloat(amount) > currentBalance && (
            <div className="text-red-400 text-sm text-center">
              Insufficient balance. Maximum: ${currentBalance.toFixed(2)}
            </div>
          )}

          {/* Summary */}
          {amount && parseFloat(amount) > 0 && parseFloat(amount) <= currentBalance && (
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: '#111827' }}
            >
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Redeeming</span>
                <span className="text-white font-medium">${parseFloat(amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Remaining Balance</span>
                <span className="text-green-400 font-medium">
                  ${(currentBalance - parseFloat(amount)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-gray-400 hover:bg-gray-700 transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > currentBalance}
              className="flex-1 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#1877F2', color: '#FFFFFF' }}
            >
              {isLoading ? 'Processing...' : 'Redeem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
