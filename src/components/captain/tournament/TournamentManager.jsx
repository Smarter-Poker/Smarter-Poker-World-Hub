/**
 * TournamentManager Component - Core tournament management interface
 * Reference: SCOPE_LOCK.md - Phase 3 Components
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Users,
  Clock,
  Settings,
  Play,
  Pause,
  UserMinus,
  DollarSign,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Table
} from 'lucide-react';
import TournamentClock from './TournamentClock';
import PayoutCalculator from './PayoutCalculator';

const STATUS_COLORS = {
  scheduled: 'bg-gray-100 text-gray-700',
  registering: 'bg-blue-100 text-blue-700',
  running: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  final_table: 'bg-purple-100 text-purple-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700'
};

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  registering: 'Registration Open',
  running: 'Running',
  paused: 'Paused',
  final_table: 'Final Table',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

export default function TournamentManager({
  tournamentId,
  onUpdate,
  onClose
}) {
  const [tournament, setTournament] = useState(null);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEliminateModal, setShowEliminateModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [eliminationData, setEliminationData] = useState({
    position: '',
    payout_amount: 0,
    eliminated_by: ''
  });

  // Fetch tournament data
  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/captain/tournaments/${tournamentId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setTournament(data.data);
      } else {
        setError(data.error?.message || 'Failed to load tournament');
      }
    } catch (err) {
      setError('Network error');
    }
  }, [tournamentId]);

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/captain/tournaments/${tournamentId}/entries`);
      const data = await res.json();
      if (res.ok && data.success) {
        setEntries(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load entries:', err);
    }
  }, [tournamentId]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchTournament(), fetchEntries()]);
      setIsLoading(false);
    };
    loadData();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchTournament();
      fetchEntries();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchTournament, fetchEntries]);

  // Update tournament status
  const updateStatus = async (status) => {
    try {
      const res = await fetch(`/api/captain/tournaments/${tournamentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTournament(data.data);
        onUpdate?.(data.data);
      } else {
        alert(data.error?.message || 'Failed to update status');
      }
    } catch (err) {
      alert('Network error');
    }
  };

  // Eliminate player
  const eliminatePlayer = async () => {
    if (!selectedPlayer) return;

    try {
      const res = await fetch(`/api/captain/tournaments/${tournamentId}/eliminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_id: selectedPlayer.id,
          position: parseInt(eliminationData.position) || entries.filter(e => e.status === 'active').length,
          payout_amount: parseFloat(eliminationData.payout_amount) || 0,
          eliminated_by: eliminationData.eliminated_by || null
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await fetchEntries();
        setShowEliminateModal(false);
        setSelectedPlayer(null);
        setEliminationData({ position: '', payout_amount: 0, eliminated_by: '' });
      } else {
        alert(data.error?.message || 'Failed to eliminate player');
      }
    } catch (err) {
      alert('Network error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 text-[#1877F2] animate-spin" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
          <p className="text-gray-600">{error || 'Tournament not found'}</p>
          <button
            onClick={fetchTournament}
            className="mt-4 px-4 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#1664d9]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeEntries = entries.filter(e => e.status === 'active');
  const eliminatedEntries = entries.filter(e => e.status === 'eliminated');

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-[#1877F2] text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{tournament.name}</h2>
            <p className="text-blue-100 text-sm">
              {tournament.game_type} - {tournament.buy_in ? `$${tournament.buy_in}` : 'Free'}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[tournament.status]}`}>
            {STATUS_LABELS[tournament.status]}
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-200 bg-gray-50">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-sm">
            <Users className="h-4 w-4" />
            Entries
          </div>
          <div className="text-lg font-bold text-gray-900">
            {entries.length}/{tournament.max_entries || '--'}
          </div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-sm">
            <Trophy className="h-4 w-4" />
            Active
          </div>
          <div className="text-lg font-bold text-green-600">{activeEntries.length}</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-sm">
            <DollarSign className="h-4 w-4" />
            Prize Pool
          </div>
          <div className="text-lg font-bold text-gray-900">
            ${tournament.prize_pool?.toLocaleString() || 0}
          </div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-sm">
            <Clock className="h-4 w-4" />
            Level
          </div>
          <div className="text-lg font-bold text-gray-900">{tournament.current_level || 1}</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        {['overview', 'players', 'clock', 'payouts'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium capitalize ${
              activeTab === tab
                ? 'text-[#1877F2] border-b-2 border-[#1877F2]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 min-h-[400px]">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Status Actions */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Tournament Actions</h3>
              <div className="flex flex-wrap gap-2">
                {tournament.status === 'scheduled' && (
                  <button
                    onClick={() => updateStatus('registering')}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Open Registration
                  </button>
                )}
                {tournament.status === 'registering' && (
                  <>
                    <button
                      onClick={() => updateStatus('running')}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Start Tournament
                    </button>
                    <button
                      onClick={() => updateStatus('scheduled')}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                    >
                      Close Registration
                    </button>
                  </>
                )}
                {tournament.status === 'running' && (
                  <>
                    <button
                      onClick={() => updateStatus('paused')}
                      className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center gap-2"
                    >
                      <Pause className="h-4 w-4" />
                      Pause Tournament
                    </button>
                    {activeEntries.length <= 9 && (
                      <button
                        onClick={() => updateStatus('final_table')}
                        className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2"
                      >
                        <Table className="h-4 w-4" />
                        Final Table
                      </button>
                    )}
                  </>
                )}
                {tournament.status === 'paused' && (
                  <button
                    onClick={() => updateStatus('running')}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Resume Tournament
                  </button>
                )}
                {(tournament.status === 'running' || tournament.status === 'final_table') && activeEntries.length === 1 && (
                  <button
                    onClick={() => updateStatus('completed')}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2"
                  >
                    <Trophy className="h-4 w-4" />
                    Complete Tournament
                  </button>
                )}
              </div>
            </div>

            {/* Tournament Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2">Tournament Details</h4>
                <div className="space-y-1 text-sm">
                  <p><span className="text-gray-500">Game:</span> {tournament.game_type}</p>
                  <p><span className="text-gray-500">Buy-in:</span> ${tournament.buy_in || 0}</p>
                  <p><span className="text-gray-500">Starting Stack:</span> {tournament.starting_chips?.toLocaleString()}</p>
                  <p><span className="text-gray-500">Late Reg:</span> Level {tournament.late_reg_level || 'N/A'}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2">Rebuy/Add-on</h4>
                <div className="space-y-1 text-sm">
                  <p><span className="text-gray-500">Rebuys:</span> {tournament.allow_rebuys ? 'Yes' : 'No'}</p>
                  <p><span className="text-gray-500">Add-ons:</span> {tournament.allow_addons ? 'Yes' : 'No'}</p>
                  <p><span className="text-gray-500">Rebuy Level:</span> {tournament.rebuy_level || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Players Tab */}
        {activeTab === 'players' && (
          <div className="space-y-4">
            {/* Active Players */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                Active Players ({activeEntries.length})
              </h3>
              {activeEntries.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No active players</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {activeEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{entry.player_name || 'Player'}</p>
                        <p className="text-sm text-gray-500">
                          {entry.chip_count?.toLocaleString() || tournament.starting_chips?.toLocaleString()} chips
                        </p>
                      </div>
                      {(tournament.status === 'running' || tournament.status === 'final_table') && (
                        <button
                          onClick={() => {
                            setSelectedPlayer(entry);
                            setEliminationData({
                              position: activeEntries.length,
                              payout_amount: 0,
                              eliminated_by: ''
                            });
                            setShowEliminateModal(true);
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Eliminate"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Eliminated Players */}
            {eliminatedEntries.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <UserMinus className="h-5 w-5 text-gray-400" />
                  Eliminated ({eliminatedEntries.length})
                </h3>
                <div className="space-y-1">
                  {eliminatedEntries
                    .sort((a, b) => (a.finish_position || 999) - (b.finish_position || 999))
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-2 bg-gray-100 rounded text-sm"
                      >
                        <span className="text-gray-700">
                          {entry.finish_position ? `${entry.finish_position}.` : '--'} {entry.player_name || 'Player'}
                        </span>
                        {entry.payout_amount > 0 && (
                          <span className="text-green-600 font-medium">
                            ${entry.payout_amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clock Tab */}
        {activeTab === 'clock' && (
          <TournamentClock
            tournamentId={tournamentId}
            initialData={{ tournament }}
            isStaff={true}
          />
        )}

        {/* Payouts Tab */}
        {activeTab === 'payouts' && (
          <PayoutCalculator
            totalEntries={entries.length}
            buyIn={tournament.buy_in || 0}
            rebuys={entries.reduce((sum, e) => sum + (e.rebuys || 0), 0)}
            addons={entries.reduce((sum, e) => sum + (e.addon ? 1 : 0), 0)}
            rebuyAmount={tournament.rebuy_cost || tournament.buy_in || 0}
            addonAmount={tournament.addon_cost || tournament.buy_in || 0}
            houseRake={tournament.rake_percent || 0}
            readOnly={true}
          />
        )}
      </div>

      {/* Eliminate Modal */}
      {showEliminateModal && selectedPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Eliminate {selectedPlayer.player_name || 'Player'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Finish Position
                </label>
                <input
                  type="number"
                  min="1"
                  max={entries.length}
                  value={eliminationData.position}
                  onChange={(e) => setEliminationData({ ...eliminationData, position: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payout Amount ($)
                </label>
                <input
                  type="number"
                  min="0"
                  value={eliminationData.payout_amount}
                  onChange={(e) => setEliminationData({ ...eliminationData, payout_amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Eliminated By (optional)
                </label>
                <select
                  value={eliminationData.eliminated_by}
                  onChange={(e) => setEliminationData({ ...eliminationData, eliminated_by: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1877F2]"
                >
                  <option value="">Select player...</option>
                  {activeEntries
                    .filter(e => e.id !== selectedPlayer.id)
                    .map((entry) => (
                      <option key={entry.id} value={entry.player_id}>
                        {entry.player_name || 'Player'}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEliminateModal(false);
                  setSelectedPlayer(null);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={eliminatePlayer}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Confirm Elimination
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
