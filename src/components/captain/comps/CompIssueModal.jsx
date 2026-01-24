/**
 * CompIssueModal Component
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * Modal for staff to issue or adjust comps
 */
import React, { useState } from 'react';
import { X, DollarSign, Plus, Minus, User, AlertTriangle } from 'lucide-react';

export default function CompIssueModal({
  player,
  currentBalance = 0,
  onIssue,
  onClose,
  isLoading = false
}) {
  const [mode, setMode] = useState('add'); // 'add' or 'adjust'
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;

    const finalAmount = mode === 'adjust' ? -parseFloat(amount) : parseFloat(amount);
    onIssue({
      amount: finalAmount,
      description: description || (mode === 'add' ? 'Manual comp issued' : 'Manual adjustment')
    });
  };

  const inputStyle = {
    backgroundColor: '#111827',
    borderColor: '#374151',
    color: '#E5E7EB'
  };

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
          <h2 className="text-lg font-semibold text-white">
            {mode === 'add' ? 'Issue Comps' : 'Adjust Comps'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Player Info */}
          {player && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ backgroundColor: '#111827' }}
            >
              {player.avatar_url ? (
                <img
                  src={player.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#374151' }}
                >
                  <User size={20} className="text-gray-400" />
                </div>
              )}
              <div>
                <div className="font-medium text-white">
                  {player.display_name || player.email || 'Player'}
                </div>
                <div className="text-sm text-gray-400">
                  Current balance: ${currentBalance.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Mode Toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ backgroundColor: '#111827' }}>
            <button
              type="button"
              onClick={() => setMode('add')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                mode === 'add' ? 'text-white' : 'text-gray-400'
              }`}
              style={{ backgroundColor: mode === 'add' ? '#22C55E' : 'transparent' }}
            >
              <Plus size={16} />
              Issue Comps
            </button>
            <button
              type="button"
              onClick={() => setMode('adjust')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                mode === 'adjust' ? 'text-white' : 'text-gray-400'
              }`}
              style={{ backgroundColor: mode === 'adjust' ? '#EF4444' : 'transparent' }}
            >
              <Minus size={16} />
              Adjustment
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {mode === 'add' ? 'Amount to Issue' : 'Amount to Deduct'}
            </label>
            <div className="relative">
              <DollarSign
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border focus:outline-none focus:border-blue-500 text-lg"
                style={inputStyle}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Reason / Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
              style={inputStyle}
              rows={2}
              placeholder={mode === 'add' ? 'e.g., Birthday bonus, Service recovery' : 'e.g., Correction, Error fix'}
            />
          </div>

          {/* Warning for adjustments */}
          {mode === 'adjust' && parseFloat(amount) > currentBalance && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ backgroundColor: '#FEF3C720' }}
            >
              <AlertTriangle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              <span className="text-yellow-200">
                This will result in a negative balance of ${(currentBalance - parseFloat(amount || 0)).toFixed(2)}
              </span>
            </div>
          )}

          {/* Preview */}
          <div
            className="p-3 rounded-lg text-center"
            style={{ backgroundColor: '#111827' }}
          >
            <div className="text-sm text-gray-400 mb-1">New Balance</div>
            <div className={`text-2xl font-bold ${
              mode === 'adjust'
                ? 'text-red-400'
                : 'text-green-400'
            }`}>
              ${(currentBalance + (mode === 'add' ? parseFloat(amount || 0) : -parseFloat(amount || 0))).toFixed(2)}
            </div>
          </div>

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
              disabled={isLoading || !amount || parseFloat(amount) <= 0}
              className="flex-1 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: mode === 'add' ? '#22C55E' : '#EF4444',
                color: '#FFFFFF'
              }}
            >
              {isLoading ? 'Processing...' : mode === 'add' ? 'Issue Comps' : 'Apply Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
