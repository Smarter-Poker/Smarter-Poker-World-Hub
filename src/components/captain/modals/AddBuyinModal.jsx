/**
 * AddBuyinModal - Add additional buy-in to a seated player
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState } from 'react';
import { X, DollarSign, Loader2 } from 'lucide-react';

const COMMON_AMOUNTS = [100, 200, 300, 500, 1000];

export default function AddBuyinModal({
  isOpen,
  onClose,
  onSubmit,
  session,
  game
}) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const minBuyin = game?.min_buyin || 0;
  const maxBuyin = game?.max_buyin || 999999;

  async function handleSubmit() {
    const buyinAmount = parseInt(amount);
    if (!buyinAmount || buyinAmount <= 0) return;

    if (minBuyin > 0 && buyinAmount < minBuyin) {
      setError(`Minimum buy-in is $${minBuyin}`);
      return;
    }
    if (maxBuyin > 0 && buyinAmount > maxBuyin) {
      setError(`Maximum buy-in is $${maxBuyin}`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/captain/sessions/${session.id}/buyin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: buyinAmount
        })
      });

      const data = await res.json();

      if (data.success) {
        onSubmit?.({ session, amount: buyinAmount });
        resetAndClose();
      } else {
        setError(data.error?.message || 'Failed to add buy-in');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetAndClose() {
    setAmount('');
    setError(null);
    onClose();
  }

  if (!isOpen || !session) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#10B981] rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1F2937]">Add Buy-in</h2>
              <p className="text-sm text-[#6B7280]">
                {session.player_name || 'Player'} - Seat {session.seat_number}
              </p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-[#FEF2F2] rounded-lg">
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Current total */}
          <div className="p-3 bg-[#F3F4F6] rounded-lg">
            <p className="text-sm text-[#6B7280]">Current total buy-in</p>
            <p className="text-xl font-bold text-[#1F2937]">
              ${session.total_buyin || 0}
            </p>
          </div>

          {/* Quick amounts */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">
              Quick Select
            </label>
            <div className="grid grid-cols-5 gap-2">
              {COMMON_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmount(amt.toString())}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    amount === amt.toString()
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">
              Amount
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full h-12 pl-10 pr-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] text-lg"
                min={minBuyin || 0}
                max={maxBuyin || undefined}
              />
            </div>
            {(minBuyin > 0 || maxBuyin < 999999) && (
              <p className="text-xs text-[#6B7280] mt-1">
                Buy-in range: ${minBuyin} - ${maxBuyin}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5E7EB]">
          <button
            onClick={handleSubmit}
            disabled={!amount || parseInt(amount) <= 0 || submitting}
            className="w-full h-12 bg-[#10B981] text-white font-semibold rounded-lg hover:bg-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <DollarSign className="w-5 h-5" />
                Add ${amount || 0} Buy-in
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
