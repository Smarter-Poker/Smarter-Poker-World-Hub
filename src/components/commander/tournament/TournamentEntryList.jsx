/**
 * TournamentEntryList Component - Display and manage tournament entries
 * Reference: SCOPE_LOCK.md - Phase 3 Components
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState } from 'react';
import { User, Search, UserMinus, Coins, RotateCcw, Plus, Trophy } from 'lucide-react';

const STATUS_CONFIG = {
  registered: { label: 'Registered', color: 'bg-[#6B7280]' },
  seated: { label: 'Seated', color: 'bg-[#22D3EE]' },
  active: { label: 'Active', color: 'bg-[#10B981]' },
  eliminated: { label: 'Out', color: 'bg-[#EF4444]' },
  winner: { label: 'Winner', color: 'bg-[#F59E0B]' }
};

export default function TournamentEntryList({
  entries = [],
  tournament,
  onEliminate,
  onRebuy,
  onAddon,
  onUpdateChips,
  isStaff = false,
  showActions = true
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [chipUpdateValue, setChipUpdateValue] = useState('');

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    const name = entry.player_name || entry.profiles?.display_name || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || entry.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Sort: active first, then by chip count, then eliminated by position
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const statusOrder = { winner: 0, active: 1, seated: 2, registered: 3, eliminated: 4 };
    const statusDiff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    if (statusDiff !== 0) return statusDiff;

    if (a.status === 'eliminated' && b.status === 'eliminated') {
      return (a.finish_position || 999) - (b.finish_position || 999);
    }

    return (b.current_chips || 0) - (a.current_chips || 0);
  });

  const handleChipUpdate = (entry) => {
    if (!chipUpdateValue || isNaN(parseInt(chipUpdateValue))) return;
    onUpdateChips?.(entry.id, parseInt(chipUpdateValue));
    setSelectedEntry(null);
    setChipUpdateValue('');
  };

  const formatChips = (amount) => {
    if (!amount) return '0';
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${Math.floor(amount / 1000)}K`;
    return amount.toLocaleString();
  };

  const activePlayers = entries.filter(e => ['seated', 'active'].includes(e.status));
  const eliminatedPlayers = entries.filter(e => e.status === 'eliminated');

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="cmd-panel p-3 text-center">
          <p className="text-2xl font-bold text-[#22D3EE]">{entries.length}</p>
          <p className="text-xs text-[#64748B]">Total Entries</p>
        </div>
        <div className="cmd-panel p-3 text-center">
          <p className="text-2xl font-bold text-[#10B981]">{activePlayers.length}</p>
          <p className="text-xs text-[#64748B]">Remaining</p>
        </div>
        <div className="cmd-panel p-3 text-center">
          <p className="text-2xl font-bold text-[#EF4444]">{eliminatedPlayers.length}</p>
          <p className="text-xs text-[#64748B]">Eliminated</p>
        </div>
        <div className="cmd-panel p-3 text-center">
          <p className="text-2xl font-bold text-white">
            {formatChips(tournament?.average_stack || 0)}
          </p>
          <p className="text-xs text-[#64748B]">Avg Stack</p>
        </div>
      </div>

      {/* Search and filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search players..."
            className="w-full pl-10 pr-4 py-2 cmd-input"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 cmd-input"
        >
          <option value="all">All Players</option>
          <option value="active">Active</option>
          <option value="seated">Seated</option>
          <option value="registered">Registered</option>
          <option value="eliminated">Eliminated</option>
        </select>
      </div>

      {/* Entry list */}
      <div className="cmd-panel overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          {sortedEntries.map((entry) => {
            const playerName = entry.player_name || entry.profiles?.display_name || 'Guest';
            const config = STATUS_CONFIG[entry.status] || STATUS_CONFIG.registered;
            const isActive = ['seated', 'active'].includes(entry.status);

            return (
              <div
                key={entry.id}
                className={`border-b border-[#4A5E78] last:border-b-0 p-4 ${
                  entry.status === 'eliminated' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-[#0D192E] flex items-center justify-center">
                      {entry.profiles?.avatar_url ? (
                        <img
                          src={entry.profiles.avatar_url}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : entry.status === 'winner' ? (
                        <Trophy className="w-5 h-5 text-[#F59E0B]" />
                      ) : (
                        <User className="w-5 h-5 text-[#64748B]" />
                      )}
                    </div>

                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{playerName}</span>
                        <span className={`px-2 py-0.5 rounded text-xs text-white ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-[#64748B]">
                        {isActive && entry.current_chips && (
                          <span className="flex items-center gap-1">
                            <Coins className="w-3 h-3" />
                            {formatChips(entry.current_chips)}
                          </span>
                        )}
                        {entry.table_number && (
                          <span>Table {entry.table_number}, Seat {entry.seat_number}</span>
                        )}
                        {entry.rebuy_count > 0 && (
                          <span className="text-[#F59E0B]">{entry.rebuy_count} rebuy(s)</span>
                        )}
                        {entry.addon_taken && (
                          <span className="text-[#8B5CF6]">Add-on</span>
                        )}
                        {entry.finish_position && (
                          <span className="font-medium">
                            Finished {entry.finish_position}{entry.finish_position === 1 ? 'st' : entry.finish_position === 2 ? 'nd' : entry.finish_position === 3 ? 'rd' : 'th'}
                          </span>
                        )}
                        {entry.payout_amount > 0 && (
                          <span className="text-[#10B981] font-medium">
                            Won ${entry.payout_amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {showActions && isStaff && isActive && (
                    <div className="flex items-center gap-2">
                      {/* Chip update */}
                      {selectedEntry === entry.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={chipUpdateValue}
                            onChange={(e) => setChipUpdateValue(e.target.value)}
                            placeholder="Chips"
                            className="w-24 cmd-input text-sm"
                            autoFocus
                          />
                          <button
                            onClick={() => handleChipUpdate(entry)}
                            className="cmd-btn cmd-btn-primary text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setSelectedEntry(null);
                              setChipUpdateValue('');
                            }}
                            className="cmd-btn cmd-btn-secondary text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setSelectedEntry(entry.id);
                              setChipUpdateValue(entry.current_chips?.toString() || '');
                            }}
                            className="p-2 rounded-lg border border-[#4A5E78] text-[#64748B] hover:border-[#22D3EE] hover:text-[#22D3EE] transition-colors"
                            title="Update chips"
                          >
                            <Coins className="w-4 h-4" />
                          </button>

                          {tournament?.allows_rebuys && (
                            <button
                              onClick={() => onRebuy?.(entry)}
                              disabled={tournament.rebuy_end_level && tournament.current_level > tournament.rebuy_end_level}
                              className="p-2 rounded-lg border border-[#4A5E78] text-[#64748B] hover:border-[#F59E0B] hover:text-[#F59E0B] disabled:opacity-50 transition-colors"
                              title="Add rebuy"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}

                          {tournament?.allows_addon && !entry.addon_taken && (
                            <button
                              onClick={() => onAddon?.(entry)}
                              className="p-2 rounded-lg border border-[#4A5E78] text-[#64748B] hover:border-[#8B5CF6] hover:text-[#8B5CF6] transition-colors"
                              title="Add add-on"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => onEliminate?.(entry)}
                            className="p-2 rounded-lg border border-[#4A5E78] text-[#64748B] hover:border-[#EF4444] hover:text-[#EF4444] transition-colors"
                            title="Eliminate player"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sortedEntries.length === 0 && (
            <div className="p-8 text-center text-[#64748B]">
              {searchTerm || filterStatus !== 'all'
                ? 'No players match your search'
                : 'No entries yet'
              }
            </div>
          )}
        </div>
      </div>

      {/* Chip leader board */}
      {activePlayers.length > 0 && (
        <div className="bg-[#0B1426] rounded-lg p-4">
          <h4 className="font-medium text-white mb-3">Chip Leaders</h4>
          <div className="space-y-2">
            {activePlayers
              .sort((a, b) => (b.current_chips || 0) - (a.current_chips || 0))
              .slice(0, 5)
              .map((entry, index) => {
                const playerName = entry.player_name || entry.profiles?.display_name || 'Guest';
                const avgStack = tournament?.average_stack || 1;
                const stackRatio = ((entry.current_chips || 0) / avgStack * 100).toFixed(0);

                return (
                  <div key={entry.id} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? 'bg-[#F59E0B] text-white' :
                      index === 1 ? 'bg-[#9CA3AF] text-white' :
                      index === 2 ? 'bg-[#CD7F32] text-white' :
                      'bg-[#1E293B] text-white'
                    }`}>
                      {index + 1}
                    </span>
                    <span className="flex-1 text-white">{playerName}</span>
                    <span className="font-medium text-white">
                      {formatChips(entry.current_chips)}
                    </span>
                    <span className={`text-sm ${
                      parseInt(stackRatio) > 100 ? 'text-[#10B981]' : 'text-[#64748B]'
                    }`}>
                      ({stackRatio}% avg)
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
