/**
 * PayoutStructureEditor Component - Create/edit tournament payout structures
 * Reference: SCOPE_LOCK.md - Phase 3 Components
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { Plus, Trash2, DollarSign } from 'lucide-react';

// Common payout structures by entry count
const PAYOUT_PRESETS = {
  '10': [
    { position: 1, percentage: 50 },
    { position: 2, percentage: 30 },
    { position: 3, percentage: 20 }
  ],
  '20': [
    { position: 1, percentage: 40 },
    { position: 2, percentage: 25 },
    { position: 3, percentage: 18 },
    { position: 4, percentage: 10 },
    { position: 5, percentage: 7 }
  ],
  '30': [
    { position: 1, percentage: 35 },
    { position: 2, percentage: 22 },
    { position: 3, percentage: 15 },
    { position: 4, percentage: 10 },
    { position: 5, percentage: 8 },
    { position: 6, percentage: 6 },
    { position: 7, percentage: 4 }
  ],
  '50': [
    { position: 1, percentage: 30 },
    { position: 2, percentage: 18 },
    { position: 3, percentage: 13 },
    { position: 4, percentage: 10 },
    { position: 5, percentage: 8 },
    { position: 6, percentage: 6 },
    { position: 7, percentage: 5 },
    { position: 8, percentage: 4 },
    { position: 9, percentage: 3 },
    { position: 10, percentage: 3 }
  ],
  '100': [
    { position: 1, percentage: 25 },
    { position: 2, percentage: 15 },
    { position: 3, percentage: 10 },
    { position: 4, percentage: 8 },
    { position: 5, percentage: 6 },
    { position: 6, percentage: 5 },
    { position: 7, percentage: 4 },
    { position: 8, percentage: 3.5 },
    { position: 9, percentage: 3 },
    { position: 10, percentage: 2.5 },
    { position: 11, percentage: 2 },
    { position: 12, percentage: 2 },
    { position: 13, percentage: 2 },
    { position: 14, percentage: 2 },
    { position: 15, percentage: 2 }
  ]
};

export default function PayoutStructureEditor({
  value = [],
  onChange,
  buyIn = 100,
  estimatedEntries = 20,
  guaranteedPool = 0,
  disabled = false
}) {
  const [payouts, setPayouts] = useState(value.length > 0 ? value : []);

  const updatePayouts = (newPayouts) => {
    setPayouts(newPayouts);
    onChange?.(newPayouts);
  };

  // Calculate prize pool
  const prizePool = Math.max(buyIn * estimatedEntries, guaranteedPool);

  // Calculate total percentage
  const totalPercentage = payouts.reduce((sum, p) => sum + (p.percentage || 0), 0);

  const addPayout = () => {
    const nextPosition = payouts.length > 0
      ? Math.max(...payouts.map(p => p.position)) + 1
      : 1;
    updatePayouts([...payouts, { position: nextPosition, percentage: 0 }]);
  };

  const updatePayout = (index, field, value) => {
    const newPayouts = [...payouts];
    newPayouts[index] = { ...newPayouts[index], [field]: value };
    updatePayouts(newPayouts);
  };

  const removePayout = (index) => {
    updatePayouts(payouts.filter((_, i) => i !== index));
  };

  const loadPreset = (entryCount) => {
    const preset = PAYOUT_PRESETS[entryCount];
    if (preset) {
      updatePayouts([...preset]);
    }
  };

  const autoBalance = () => {
    if (payouts.length === 0) return;

    // Distribute remaining percentage evenly
    const remaining = 100 - totalPercentage;
    if (remaining <= 0) return;

    const perPosition = remaining / payouts.length;
    const newPayouts = payouts.map(p => ({
      ...p,
      percentage: Math.round((p.percentage + perPosition) * 10) / 10
    }));
    updatePayouts(newPayouts);
  };

  const getPositionSuffix = (pos) => {
    if (pos === 1) return 'st';
    if (pos === 2) return 'nd';
    if (pos === 3) return 'rd';
    return 'th';
  };

  return (
    <div className="space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-[#64748B]">Load for entries:</span>
        {Object.keys(PAYOUT_PRESETS).map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => loadPreset(count)}
            disabled={disabled}
            className="px-3 py-1 text-sm rounded-lg border border-[#4A5E78] text-white hover:border-[#22D3EE] hover:text-[#22D3EE] transition-colors disabled:opacity-50"
          >
            {count}+
          </button>
        ))}
      </div>

      {/* Prize pool estimate */}
      <div className="bg-[#22D3EE]/5 border border-[#22D3EE]/20 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-5 h-5 text-[#22D3EE]" />
          <span className="font-medium text-white">Estimated Prize Pool</span>
        </div>
        <p className="text-2xl font-bold text-[#22D3EE]">
          ${prizePool.toLocaleString()}
        </p>
        <p className="text-sm text-[#64748B] mt-1">
          Based on ${buyIn} buy-in x {estimatedEntries} entries
          {guaranteedPool > 0 && ` (${guaranteedPool > buyIn * estimatedEntries ? 'overlay' : 'no overlay'})`}
        </p>
      </div>

      {/* Payout list */}
      <div className="cmd-panel overflow-hidden">
        <div className="bg-[#0D192E] px-4 py-2 grid grid-cols-12 gap-2 text-sm font-medium text-[#64748B]">
          <div className="col-span-3">Position</div>
          <div className="col-span-3">Percentage</div>
          <div className="col-span-4">Estimated Payout</div>
          <div className="col-span-2">Actions</div>
        </div>

        <div className="divide-y divide-[#4A5E78] max-h-[300px] overflow-y-auto">
          {payouts
            .sort((a, b) => a.position - b.position)
            .map((payout, index) => (
              <div
                key={index}
                className="px-4 py-3 grid grid-cols-12 gap-2 items-center"
              >
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      payout.position === 1 ? 'bg-[#F59E0B] text-white' :
                      payout.position === 2 ? 'bg-[#9CA3AF] text-white' :
                      payout.position === 3 ? 'bg-[#CD7F32] text-white' :
                      'bg-[#1E293B] text-white'
                    }`}>
                      {payout.position}
                    </span>
                    <span className="text-[#64748B] text-sm">
                      {payout.position}{getPositionSuffix(payout.position)}
                    </span>
                  </div>
                </div>

                <div className="col-span-3">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={payout.percentage || ''}
                      onChange={(e) => updatePayout(index, 'percentage', parseFloat(e.target.value) || 0)}
                      disabled={disabled}
                      className="w-20 cmd-input text-sm"
                      min="0"
                      max="100"
                      step="0.5"
                    />
                    <span className="text-[#64748B]">%</span>
                  </div>
                </div>

                <div className="col-span-4">
                  <span className="font-medium text-[#10B981]">
                    ${Math.floor(prizePool * (payout.percentage || 0) / 100).toLocaleString()}
                  </span>
                </div>

                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => removePayout(index)}
                    disabled={disabled}
                    className="p-2 text-[#64748B] hover:text-[#EF4444] disabled:opacity-30"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

          {payouts.length === 0 && (
            <div className="px-4 py-8 text-center text-[#64748B]">
              No payouts defined. Add positions or load a preset.
            </div>
          )}
        </div>
      </div>

      {/* Add and balance buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addPayout}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#22D3EE] text-[#22D3EE] hover:bg-[#22D3EE] hover:text-white transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add Position
        </button>
        {payouts.length > 0 && totalPercentage < 100 && (
          <button
            type="button"
            onClick={autoBalance}
            disabled={disabled}
            className="px-4 py-2 rounded-lg border border-[#10B981] text-[#10B981] hover:bg-[#10B981] hover:text-white transition-colors disabled:opacity-50"
          >
            Auto-Balance to 100%
          </button>
        )}
      </div>

      {/* Summary */}
      {payouts.length > 0 && (
        <div className={`rounded-lg p-4 ${
          totalPercentage === 100 ? 'bg-[#10B981]/10' :
          totalPercentage > 100 ? 'bg-[#EF4444]/10' :
          'bg-[#F59E0B]/10'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-[#64748B]">Total Allocation:</span>
              <span className={`ml-2 font-bold ${
                totalPercentage === 100 ? 'text-[#10B981]' :
                totalPercentage > 100 ? 'text-[#EF4444]' :
                'text-[#F59E0B]'
              }`}>
                {totalPercentage.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-sm text-[#64748B]">Paid Positions:</span>
              <span className="ml-2 font-bold text-white">{payouts.length}</span>
            </div>
            <div>
              <span className="text-sm text-[#64748B]">ITM %:</span>
              <span className="ml-2 font-bold text-white">
                {estimatedEntries > 0 ? ((payouts.length / estimatedEntries) * 100).toFixed(1) : 0}%
              </span>
            </div>
          </div>
          {totalPercentage !== 100 && (
            <p className="text-sm mt-2 text-[#64748B]">
              {totalPercentage > 100
                ? `Warning: Payouts exceed 100% by ${(totalPercentage - 100).toFixed(1)}%`
                : `Remaining: ${(100 - totalPercentage).toFixed(1)}% unallocated`
              }
            </p>
          )}
        </div>
      )}
    </div>
  );
}
