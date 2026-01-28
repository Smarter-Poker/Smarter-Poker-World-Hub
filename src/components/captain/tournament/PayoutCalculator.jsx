/**
 * PayoutCalculator Component - Calculate tournament payouts
 * Reference: SCOPE_LOCK.md - Phase 3 Components
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useMemo } from 'react';
import { Calculator, Users, DollarSign, Trophy, Percent, Settings } from 'lucide-react';

// Standard payout structures by places paid percentage
const PAYOUT_TEMPLATES = {
  top10: {
    name: 'Top 10%',
    description: 'Conservative - pays top 10% of field',
    getPlacesPaid: (entries) => Math.max(1, Math.ceil(entries * 0.10))
  },
  top15: {
    name: 'Top 15%',
    description: 'Standard - pays top 15% of field',
    getPlacesPaid: (entries) => Math.max(1, Math.ceil(entries * 0.15))
  },
  top20: {
    name: 'Top 20%',
    description: 'Liberal - pays top 20% of field',
    getPlacesPaid: (entries) => Math.max(1, Math.ceil(entries * 0.20))
  }
};

// Standard percentage distributions by places paid
const PAYOUT_STRUCTURES = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [45, 25, 18, 12],
  5: [40, 24, 16, 12, 8],
  6: [38, 23, 15, 11, 8, 5],
  7: [35, 22, 14, 11, 8, 6, 4],
  8: [32, 20, 13, 10, 8, 7, 6, 4],
  9: [30, 19, 13, 10, 8, 7, 5, 4, 4],
  10: [28, 18, 12, 9, 8, 7, 6, 5, 4, 3],
  15: [24, 16, 11, 8.5, 7, 6, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.75, 1.25],
  20: [22, 14, 10, 7.5, 6, 5, 4.5, 4, 3.5, 3, 2.75, 2.5, 2.25, 2, 1.75, 1.5, 1.25, 1.25, 1, 1]
};

// Get the closest standard structure
function getPayoutPercentages(placesPaid) {
  const keys = Object.keys(PAYOUT_STRUCTURES).map(Number).sort((a, b) => a - b);

  // Find exact match or interpolate
  if (PAYOUT_STRUCTURES[placesPaid]) {
    return PAYOUT_STRUCTURES[placesPaid];
  }

  // Find closest structure and scale
  let lower = 1, upper = 20;
  for (const key of keys) {
    if (key <= placesPaid) lower = key;
    if (key >= placesPaid) {
      upper = key;
      break;
    }
  }

  // Use the lower structure and distribute remaining places
  const baseStructure = PAYOUT_STRUCTURES[lower];
  if (placesPaid <= lower) return baseStructure;

  // Distribute remaining percentage across new places
  const extraPlaces = placesPaid - lower;
  const minPayout = 1.5; // Minimum percentage for added places
  const totalExtra = extraPlaces * minPayout;

  // Scale down existing payouts
  const scaleFactor = (100 - totalExtra) / 100;
  const scaled = baseStructure.map(p => p * scaleFactor);

  // Add min payouts for extra places
  for (let i = 0; i < extraPlaces; i++) {
    scaled.push(minPayout);
  }

  return scaled;
}

export default function PayoutCalculator({
  totalEntries = 0,
  buyIn = 0,
  rebuys = 0,
  addons = 0,
  rebuyAmount = 0,
  addonAmount = 0,
  houseRake = 0,
  onPayoutChange,
  initialPayouts = null,
  readOnly = false
}) {
  const [template, setTemplate] = useState('top15');
  const [customPlacesPaid, setCustomPlacesPaid] = useState(null);
  const [customPercentages, setCustomPercentages] = useState(null);
  const [showCustomize, setShowCustomize] = useState(false);

  // Calculate total prize pool
  const prizePool = useMemo(() => {
    const entryTotal = totalEntries * buyIn;
    const rebuyTotal = rebuys * rebuyAmount;
    const addonTotal = addons * addonAmount;
    const gross = entryTotal + rebuyTotal + addonTotal;
    const rake = gross * (houseRake / 100);
    return Math.floor(gross - rake);
  }, [totalEntries, buyIn, rebuys, rebuyAmount, addons, addonAmount, houseRake]);

  // Calculate places paid
  const placesPaid = useMemo(() => {
    if (customPlacesPaid !== null) return customPlacesPaid;
    return PAYOUT_TEMPLATES[template].getPlacesPaid(totalEntries);
  }, [template, totalEntries, customPlacesPaid]);

  // Calculate payouts
  const payouts = useMemo(() => {
    const percentages = customPercentages || getPayoutPercentages(placesPaid);
    return percentages.map((pct, idx) => ({
      place: idx + 1,
      percentage: pct,
      amount: Math.floor(prizePool * (pct / 100))
    }));
  }, [placesPaid, prizePool, customPercentages]);

  // Notify parent of changes
  useEffect(() => {
    if (onPayoutChange) {
      onPayoutChange({
        prizePool,
        placesPaid,
        payouts
      });
    }
  }, [payouts, prizePool, placesPaid, onPayoutChange]);

  // Handle percentage change
  const handlePercentageChange = (index, value) => {
    if (readOnly) return;

    const newPercentages = customPercentages
      ? [...customPercentages]
      : getPayoutPercentages(placesPaid);
    newPercentages[index] = parseFloat(value) || 0;
    setCustomPercentages(newPercentages);
  };

  // Add/remove places
  const handleAddPlace = () => {
    if (readOnly) return;
    const newPlaces = (customPlacesPaid || placesPaid) + 1;
    setCustomPlacesPaid(newPlaces);

    const newPercentages = customPercentages
      ? [...customPercentages, 1]
      : [...getPayoutPercentages(placesPaid), 1];
    setCustomPercentages(newPercentages);
  };

  const handleRemovePlace = () => {
    if (readOnly || placesPaid <= 1) return;
    const newPlaces = (customPlacesPaid || placesPaid) - 1;
    setCustomPlacesPaid(newPlaces);

    if (customPercentages) {
      setCustomPercentages(customPercentages.slice(0, -1));
    }
  };

  // Reset to template
  const handleReset = () => {
    setCustomPlacesPaid(null);
    setCustomPercentages(null);
  };

  // Calculate total percentage (should be ~100%)
  const totalPercentage = payouts.reduce((sum, p) => sum + p.percentage, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#1877F2]" />
            <h3 className="font-semibold text-gray-900">Payout Calculator</h3>
          </div>
          {!readOnly && (
            <button
              onClick={() => setShowCustomize(!showCustomize)}
              className="text-sm text-[#1877F2] hover:underline flex items-center gap-1"
            >
              <Settings className="h-4 w-4" />
              {showCustomize ? 'Hide Options' : 'Customize'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="p-4 grid grid-cols-3 gap-4 border-b border-gray-100">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-sm">
            <Users className="h-4 w-4" />
            Entries
          </div>
          <div className="text-xl font-bold text-gray-900">{totalEntries}</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-sm">
            <DollarSign className="h-4 w-4" />
            Prize Pool
          </div>
          <div className="text-xl font-bold text-green-600">${prizePool.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-sm">
            <Trophy className="h-4 w-4" />
            Places Paid
          </div>
          <div className="text-xl font-bold text-gray-900">{placesPaid}</div>
        </div>
      </div>

      {/* Customization Options */}
      {showCustomize && !readOnly && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Template Selection */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payout Template
              </label>
              <select
                value={customPlacesPaid ? 'custom' : template}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setTemplate(e.target.value);
                    setCustomPlacesPaid(null);
                    setCustomPercentages(null);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1877F2] focus:border-[#1877F2]"
              >
                {Object.entries(PAYOUT_TEMPLATES).map(([key, t]) => (
                  <option key={key} value={key}>{t.name} - {t.description}</option>
                ))}
                {customPlacesPaid && <option value="custom">Custom</option>}
              </select>
            </div>

            {/* Places Paid Override */}
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Places Paid
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRemovePlace}
                  className="px-3 py-2 border border-gray-300 rounded-l-lg hover:bg-gray-100"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max={totalEntries || 1}
                  value={customPlacesPaid || placesPaid}
                  onChange={(e) => setCustomPlacesPaid(parseInt(e.target.value) || 1)}
                  className="w-14 text-center py-2 border-t border-b border-gray-300 focus:outline-none"
                />
                <button
                  onClick={handleAddPlace}
                  className="px-3 py-2 border border-gray-300 rounded-r-lg hover:bg-gray-100"
                >
                  +
                </button>
              </div>
            </div>

            {/* Reset Button */}
            {(customPlacesPaid || customPercentages) && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Reset to Default
              </button>
            )}
          </div>
        </div>
      )}

      {/* Payout Table */}
      <div className="p-4">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-500 border-b border-gray-100">
              <th className="pb-2 font-medium">Place</th>
              <th className="pb-2 font-medium text-center">
                <div className="flex items-center justify-center gap-1">
                  <Percent className="h-4 w-4" />
                  Percentage
                </div>
              </th>
              <th className="pb-2 font-medium text-right">
                <div className="flex items-center justify-end gap-1">
                  <DollarSign className="h-4 w-4" />
                  Payout
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {payouts.slice(0, showCustomize || readOnly ? payouts.length : 10).map((payout, idx) => (
              <tr key={idx} className="border-b border-gray-50 last:border-0">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    {idx === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
                    {idx === 1 && <Trophy className="h-4 w-4 text-gray-400" />}
                    {idx === 2 && <Trophy className="h-4 w-4 text-amber-600" />}
                    <span className={idx < 3 ? 'font-semibold' : ''}>
                      {payout.place}{payout.place === 1 ? 'st' : payout.place === 2 ? 'nd' : payout.place === 3 ? 'rd' : 'th'}
                    </span>
                  </div>
                </td>
                <td className="py-2 text-center">
                  {readOnly || !showCustomize ? (
                    <span className="text-gray-600">{payout.percentage.toFixed(2)}%</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={payout.percentage}
                      onChange={(e) => handlePercentageChange(idx, e.target.value)}
                      className="w-20 text-center px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-[#1877F2]"
                    />
                  )}
                </td>
                <td className="py-2 text-right">
                  <span className={`font-medium ${idx < 3 ? 'text-green-600' : 'text-gray-900'}`}>
                    ${payout.amount.toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Show more toggle */}
        {!showCustomize && !readOnly && payouts.length > 10 && (
          <button
            onClick={() => setShowCustomize(true)}
            className="w-full mt-2 py-2 text-sm text-[#1877F2] hover:underline"
          >
            Show all {payouts.length} places
          </button>
        )}

        {/* Total Validation */}
        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
          <span className="text-sm text-gray-500">Total Percentage:</span>
          <span className={`font-medium ${Math.abs(totalPercentage - 100) < 0.1 ? 'text-green-600' : 'text-red-600'}`}>
            {totalPercentage.toFixed(2)}%
            {Math.abs(totalPercentage - 100) >= 0.1 && (
              <span className="text-xs ml-2">(should be 100%)</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
