/**
 * OpenGameModal - Modal for opening a new game on a table
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { X, Play, Users } from 'lucide-react';

const GAME_TYPES = [
  { value: 'nlh', label: 'No Limit Hold\'em' },
  { value: 'plo', label: 'Pot Limit Omaha' },
  { value: 'plo5', label: 'PLO Hi-Lo' },
  { value: 'mixed', label: 'Mixed Games' },
  { value: 'limit', label: 'Limit Hold\'em' },
  { value: 'stud', label: 'Seven Card Stud' }
];

const COMMON_STAKES = [
  '1/2', '1/3', '2/5', '5/10', '10/20', '10/25', '25/50'
];

export default function OpenGameModal({ isOpen, onClose, onSubmit, tables = [], venueId }) {
  const [selectedTable, setSelectedTable] = useState('');
  const [gameType, setGameType] = useState('nlh');
  const [stakes, setStakes] = useState('1/3');
  const [customStakes, setCustomStakes] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(9);
  const [minBuyin, setMinBuyin] = useState(100);
  const [maxBuyin, setMaxBuyin] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Filter available tables
  const availableTables = tables.filter(t => t.status === 'available');

  useEffect(() => {
    if (isOpen && availableTables.length > 0 && !selectedTable) {
      setSelectedTable(availableTables[0].id);
    }
  }, [isOpen, availableTables, selectedTable]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const finalStakes = stakes === 'custom' ? customStakes : stakes;

    try {
      const res = await fetch('/api/captain/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          table_id: selectedTable,
          game_type: gameType,
          stakes: finalStakes,
          max_players: maxPlayers,
          min_buyin: minBuyin,
          max_buyin: maxBuyin
        })
      });

      const data = await res.json();

      if (data.success) {
        onSubmit(data.data.game);
        resetForm();
        onClose();
      } else {
        setError(data.error?.message || 'Failed to open game');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSelectedTable('');
    setGameType('nlh');
    setStakes('1/3');
    setCustomStakes('');
    setMaxPlayers(9);
    setMinBuyin(100);
    setMaxBuyin(500);
    setError(null);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1877F2] rounded-lg flex items-center justify-center">
              <Play className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-[#1F2937]">Open Game</h2>
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

          {/* Table Selection */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Table
            </label>
            {availableTables.length === 0 ? (
              <p className="text-sm text-[#EF4444]">No tables available</p>
            ) : (
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                required
              >
                {availableTables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.table_name || `Table ${table.table_number}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Game Type */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Game Type
            </label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
            >
              {GAME_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Stakes */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Stakes
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {COMMON_STAKES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStakes(s)}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    stakes === s
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setStakes('custom')}
                className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                  stakes === 'custom'
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                }`}
              >
                Custom
              </button>
            </div>
            {stakes === 'custom' && (
              <input
                type="text"
                value={customStakes}
                onChange={(e) => setCustomStakes(e.target.value)}
                placeholder="e.g., 5/10/20"
                className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                required
              />
            )}
          </div>

          {/* Max Players */}
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Max Players
            </label>
            <div className="flex gap-2">
              {[6, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setMaxPlayers(num)}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                    maxPlayers === num
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Buy-in Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">
                Min Buy-in
              </label>
              <input
                type="number"
                value={minBuyin}
                onChange={(e) => setMinBuyin(parseInt(e.target.value) || 0)}
                className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-1">
                Max Buy-in
              </label>
              <input
                type="number"
                value={maxBuyin}
                onChange={(e) => setMaxBuyin(parseInt(e.target.value) || 0)}
                className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || availableTables.length === 0}
            className="w-full h-12 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Users className="w-5 h-5" />
            {submitting ? 'Opening...' : 'Open Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
