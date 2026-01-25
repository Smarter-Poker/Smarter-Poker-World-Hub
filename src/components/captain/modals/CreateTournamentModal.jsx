/**
 * CreateTournamentModal - Create new tournament
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState } from 'react';
import { X, Trophy, Calendar, DollarSign, Users, Clock, Loader2 } from 'lucide-react';

const TOURNAMENT_TYPES = [
  { value: 'freezeout', label: 'Freezeout' },
  { value: 'rebuy', label: 'Rebuy' },
  { value: 'bounty', label: 'Bounty' },
  { value: 'satellite', label: 'Satellite' }
];

const COMMON_BUYINS = [50, 100, 150, 200, 300, 500];

const DEFAULT_BLIND_STRUCTURE = [
  { level: 1, small_blind: 25, big_blind: 50, ante: 0, duration: 20 },
  { level: 2, small_blind: 50, big_blind: 100, ante: 0, duration: 20 },
  { level: 3, small_blind: 75, big_blind: 150, ante: 0, duration: 20 },
  { level: 4, small_blind: 100, big_blind: 200, ante: 25, duration: 20 },
  { is_break: true, duration: 10 },
  { level: 5, small_blind: 150, big_blind: 300, ante: 50, duration: 20 },
  { level: 6, small_blind: 200, big_blind: 400, ante: 50, duration: 20 },
  { level: 7, small_blind: 300, big_blind: 600, ante: 75, duration: 20 },
  { level: 8, small_blind: 400, big_blind: 800, ante: 100, duration: 20 },
  { is_break: true, duration: 10 },
  { level: 9, small_blind: 500, big_blind: 1000, ante: 100, duration: 15 },
  { level: 10, small_blind: 600, big_blind: 1200, ante: 200, duration: 15 },
  { level: 11, small_blind: 800, big_blind: 1600, ante: 200, duration: 15 },
  { level: 12, small_blind: 1000, big_blind: 2000, ante: 300, duration: 15 }
];

export default function CreateTournamentModal({ isOpen, onClose, onSubmit, venueId }) {
  const [name, setName] = useState('');
  const [tournamentType, setTournamentType] = useState('freezeout');
  const [buyinAmount, setBuyinAmount] = useState(100);
  const [buyinFee, setBuyinFee] = useState(20);
  const [startingChips, setStartingChips] = useState(10000);
  const [scheduledStart, setScheduledStart] = useState('');
  const [maxEntries, setMaxEntries] = useState('');
  const [guaranteedPool, setGuaranteedPool] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Set default scheduled start to tomorrow at 7pm
  useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(19, 0, 0, 0);
    setScheduledStart(tomorrow.toISOString().slice(0, 16));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !scheduledStart) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/captain/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          name: name.trim(),
          tournament_type: tournamentType,
          buyin_amount: buyinAmount,
          buyin_fee: buyinFee,
          starting_chips: startingChips,
          scheduled_start: new Date(scheduledStart).toISOString(),
          max_entries: maxEntries ? parseInt(maxEntries) : null,
          guaranteed_pool: guaranteedPool ? parseInt(guaranteedPool) : null,
          blind_structure: DEFAULT_BLIND_STRUCTURE,
          status: 'scheduled'
        })
      });

      const data = await res.json();

      if (data.success) {
        onSubmit(data.data.tournament);
        resetForm();
        onClose();
      } else {
        setError(data.error?.message || 'Failed to create tournament');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setName('');
    setTournamentType('freezeout');
    setBuyinAmount(100);
    setBuyinFee(20);
    setStartingChips(10000);
    setMaxEntries('');
    setGuaranteedPool('');
    setError(null);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1877F2] rounded-lg flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-[#1F2937]">Create Tournament</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-[#FEF2F2] rounded-lg">
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Tournament Name */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Tournament Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Daily $150 NLH"
              className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              required
            />
          </div>

          {/* Tournament Type */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {TOURNAMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setTournamentType(type.value)}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    tournamentType === type.value
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Start Time
            </label>
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              required
            />
          </div>

          {/* Buy-in */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Buy-in Amount
            </label>
            <div className="grid grid-cols-6 gap-2 mb-2">
              {COMMON_BUYINS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => {
                    setBuyinAmount(amount);
                    setBuyinFee(Math.round(amount * 0.2));
                  }}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    buyinAmount === amount
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                  }`}
                >
                  ${amount}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  value={buyinAmount}
                  onChange={(e) => setBuyinAmount(parseInt(e.target.value) || 0)}
                  className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg text-center"
                  placeholder="Buy-in"
                />
                <p className="text-xs text-[#6B7280] text-center mt-1">Buy-in</p>
              </div>
              <div>
                <input
                  type="number"
                  value={buyinFee}
                  onChange={(e) => setBuyinFee(parseInt(e.target.value) || 0)}
                  className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg text-center"
                  placeholder="Fee"
                />
                <p className="text-xs text-[#6B7280] text-center mt-1">Fee</p>
              </div>
            </div>
          </div>

          {/* Starting Chips */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Starting Chips
            </label>
            <div className="flex gap-2">
              {[5000, 10000, 15000, 20000, 25000].map((chips) => (
                <button
                  key={chips}
                  type="button"
                  onClick={() => setStartingChips(chips)}
                  className={`flex-1 h-10 rounded-lg text-xs font-medium transition-colors ${
                    startingChips === chips
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                  }`}
                >
                  {(chips / 1000)}K
                </button>
              ))}
            </div>
          </div>

          {/* Optional Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">
                Max Entries
              </label>
              <input
                type="number"
                value={maxEntries}
                onChange={(e) => setMaxEntries(e.target.value)}
                placeholder="No limit"
                className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">
                Guaranteed Pool
              </label>
              <input
                type="number"
                value={guaranteedPool}
                onChange={(e) => setGuaranteedPool(e.target.value)}
                placeholder="Optional"
                className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg"
              />
            </div>
          </div>

          {/* Info */}
          <div className="p-3 bg-[#F3F4F6] rounded-lg">
            <p className="text-sm text-[#6B7280]">
              Tournament will use the default blind structure. You can customize it after creation.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !name.trim() || !scheduledStart}
            className="w-full h-12 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Trophy className="w-5 h-5" />
                Create Tournament
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
