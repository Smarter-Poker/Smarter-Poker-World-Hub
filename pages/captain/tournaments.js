/**
 * Staff Tournament Management
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * /captain/tournaments - Manage tournaments, clock, registrations
 */
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Trophy, Plus, Play, Pause, SkipForward, Users,
  Clock, DollarSign, Settings, ChevronRight, RefreshCw,
  UserPlus, UserMinus, Award, Calendar, ArrowLeft
} from 'lucide-react';
import TournamentClock from '../../src/components/captain/tournament/TournamentClock';

export default function TournamentsPage() {
  const router = useRouter();
  const { venue_id } = router.query;

  const [tournaments, setTournaments] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEliminateModal, setShowEliminateModal] = useState(false);
  const [showPayoutsModal, setShowPayoutsModal] = useState(false);

  useEffect(() => {
    if (venue_id) loadTournaments();
  }, [venue_id]);

  const loadTournaments = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/tournaments?venue_id=${venue_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.tournaments) {
        setTournaments(data.tournaments);
        const running = data.tournaments.find(t => t.status === 'running');
        if (running) setActiveTournament(running);
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClockAction = async (action) => {
    if (!activeTournament) return;
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/captain/tournaments/${activeTournament.id}/clock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      loadTournaments();
    } catch (err) {
      console.error('Clock action error:', err);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <>
      <Head>
        <title>Tournaments | Smarter Captain</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="min-h-screen" style={{ backgroundColor: '#F9FAFB', fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <header className="bg-white border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/captain/dashboard?venue_id=${venue_id}`)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <ArrowLeft size={20} className="text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold" style={{ color: '#1877F2' }}>Tournament Management</h1>
                <p className="text-sm text-gray-500">Manage tournament clock, entries, and payouts</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: '#1877F2' }}
            >
              <Plus size={18} />
              New Tournament
            </button>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Active Tournament Clock */}
          {activeTournament && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Live Tournament</h2>
              <div className="bg-white rounded-xl border p-6" style={{ borderColor: '#E5E7EB' }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{activeTournament.name}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {activeTournament.players_remaining || 0} / {activeTournament.total_entries || 0} players
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign size={14} />
                        ${activeTournament.actual_prizepool?.toLocaleString() || 0} prize pool
                      </span>
                    </div>
                  </div>
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{ backgroundColor: '#10B98120', color: '#10B981' }}
                  >
                    LIVE
                  </span>
                </div>

                <TournamentClock
                  tournament={activeTournament}
                  onPause={() => handleClockAction('pause')}
                  onResume={() => handleClockAction('resume')}
                  onNextLevel={() => handleClockAction('next_level')}
                />

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handleClockAction(activeTournament.clock_status === 'running' ? 'pause' : 'resume')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: activeTournament.clock_status === 'running' ? '#F59E0B' : '#10B981' }}
                  >
                    {activeTournament.clock_status === 'running' ? <Pause size={16} /> : <Play size={16} />}
                    {activeTournament.clock_status === 'running' ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => handleClockAction('next_level')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: '#E5E7EB' }}
                  >
                    <SkipForward size={16} />
                    Next Level
                  </button>
                  <button
                    onClick={() => setShowEliminateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: '#E5E7EB' }}
                  >
                    <UserMinus size={16} />
                    Eliminate Player
                  </button>
                  <button
                    onClick={() => setShowPayoutsModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: '#E5E7EB' }}
                  >
                    <Award size={16} />
                    Payouts
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tournament List */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">All Tournaments</h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={24} className="animate-spin text-gray-400" />
              </div>
            ) : tournaments.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: '#E5E7EB' }}>
                <Trophy size={48} className="mx-auto text-gray-400 mb-3" />
                <h3 className="text-lg font-medium text-gray-900">No tournaments</h3>
                <p className="text-gray-500 mt-1">Create your first tournament to get started</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  Create Tournament
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {tournaments.map(tournament => (
                  <div
                    key={tournament.id}
                    className="bg-white rounded-xl border p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                    style={{ borderColor: '#E5E7EB' }}
                    onClick={() => router.push(`/captain/tournaments/${tournament.id}?venue_id=${venue_id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: tournament.status === 'running' ? '#10B98120' : '#1877F220' }}
                      >
                        <Trophy size={24} style={{ color: tournament.status === 'running' ? '#10B981' : '#1877F2' }} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{tournament.name}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            {formatDate(tournament.scheduled_start)}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign size={14} />
                            ${tournament.buyin_amount} + ${tournament.buyin_fee}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users size={14} />
                            {tournament.total_entries || 0} entries
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          tournament.status === 'running' ? 'bg-green-100 text-green-700' :
                          tournament.status === 'registering' ? 'bg-blue-100 text-blue-700' :
                          tournament.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {tournament.status.toUpperCase()}
                      </span>
                      <ChevronRight size={20} className="text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Eliminate Player Modal */}
      {showEliminateModal && activeTournament && (
        <EliminateModal
          tournament={activeTournament}
          onClose={() => setShowEliminateModal(false)}
          onEliminate={() => {
            setShowEliminateModal(false);
            loadTournaments();
          }}
        />
      )}

      {/* Payouts Modal */}
      {showPayoutsModal && activeTournament && (
        <PayoutsModal
          tournament={activeTournament}
          onClose={() => setShowPayoutsModal(false)}
          onSave={() => {
            setShowPayoutsModal(false);
            loadTournaments();
          }}
        />
      )}

      {/* Create Tournament Modal */}
      {showCreateModal && (
        <CreateTournamentModal
          venueId={venue_id}
          onClose={() => setShowCreateModal(false)}
          onCreate={() => {
            setShowCreateModal(false);
            loadTournaments();
          }}
        />
      )}
    </>
  );
}

function CreateTournamentModal({ venueId, onClose, onCreate }) {
  const [formData, setFormData] = useState({
    name: '',
    game_type: 'nlhe',
    buyin_amount: 100,
    buyin_fee: 20,
    starting_chips: 10000,
    scheduled_start: '',
    registration_open: true,
    max_entries: 100,
    late_reg_levels: 6,
    rebuy_allowed: false,
    addon_allowed: false
  });
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!formData.name.trim() || !formData.scheduled_start) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          venue_id: venueId,
          ...formData,
          blind_structure: getDefaultBlindStructure()
        })
      });

      const data = await res.json();
      if (data.success || data.tournament) {
        onCreate();
      }
    } catch (err) {
      console.error('Create tournament error:', err);
    } finally {
      setLoading(false);
    }
  }

  function getDefaultBlindStructure() {
    return [
      { level: 1, small_blind: 25, big_blind: 50, ante: 0, duration_minutes: 20 },
      { level: 2, small_blind: 50, big_blind: 100, ante: 0, duration_minutes: 20 },
      { level: 3, small_blind: 75, big_blind: 150, ante: 0, duration_minutes: 20 },
      { level: 4, small_blind: 100, big_blind: 200, ante: 25, duration_minutes: 20 },
      { level: 5, small_blind: 150, big_blind: 300, ante: 25, duration_minutes: 20 },
      { level: 6, small_blind: 200, big_blind: 400, ante: 50, duration_minutes: 20 },
      { level: 7, small_blind: 300, big_blind: 600, ante: 75, duration_minutes: 20 },
      { level: 8, small_blind: 400, big_blind: 800, ante: 100, duration_minutes: 20 },
      { level: 9, small_blind: 500, big_blind: 1000, ante: 100, duration_minutes: 20 },
      { level: 10, small_blind: 600, big_blind: 1200, ante: 200, duration_minutes: 20 }
    ];
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#1F2937' }}>Create Tournament</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
              Tournament Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Friday Night $200 NLH"
              className="w-full h-12 px-3 border rounded-lg"
              style={{ borderColor: '#E5E7EB' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
                Game Type
              </label>
              <select
                value={formData.game_type}
                onChange={(e) => setFormData(prev => ({ ...prev, game_type: e.target.value }))}
                className="w-full h-12 px-3 border rounded-lg"
                style={{ borderColor: '#E5E7EB' }}
              >
                <option value="nlhe">No Limit Hold'em</option>
                <option value="plo">Pot Limit Omaha</option>
                <option value="mixed">Mixed Games</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
                Starting Chips
              </label>
              <input
                type="number"
                value={formData.starting_chips}
                onChange={(e) => setFormData(prev => ({ ...prev, starting_chips: parseInt(e.target.value) || 10000 }))}
                className="w-full h-12 px-3 border rounded-lg"
                style={{ borderColor: '#E5E7EB' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
                Buy-in ($)
              </label>
              <input
                type="number"
                value={formData.buyin_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, buyin_amount: parseInt(e.target.value) || 0 }))}
                className="w-full h-12 px-3 border rounded-lg"
                style={{ borderColor: '#E5E7EB' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
                Fee ($)
              </label>
              <input
                type="number"
                value={formData.buyin_fee}
                onChange={(e) => setFormData(prev => ({ ...prev, buyin_fee: parseInt(e.target.value) || 0 }))}
                className="w-full h-12 px-3 border rounded-lg"
                style={{ borderColor: '#E5E7EB' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
              Scheduled Start *
            </label>
            <input
              type="datetime-local"
              value={formData.scheduled_start}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduled_start: e.target.value }))}
              className="w-full h-12 px-3 border rounded-lg"
              style={{ borderColor: '#E5E7EB' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
                Max Entries
              </label>
              <input
                type="number"
                value={formData.max_entries}
                onChange={(e) => setFormData(prev => ({ ...prev, max_entries: parseInt(e.target.value) || 100 }))}
                className="w-full h-12 px-3 border rounded-lg"
                style={{ borderColor: '#E5E7EB' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
                Late Reg Levels
              </label>
              <input
                type="number"
                value={formData.late_reg_levels}
                onChange={(e) => setFormData(prev => ({ ...prev, late_reg_levels: parseInt(e.target.value) || 0 }))}
                className="w-full h-12 px-3 border rounded-lg"
                style={{ borderColor: '#E5E7EB' }}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.rebuy_allowed}
                onChange={(e) => setFormData(prev => ({ ...prev, rebuy_allowed: e.target.checked }))}
                className="w-5 h-5 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Rebuys Allowed</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.addon_allowed}
                onChange={(e) => setFormData(prev => ({ ...prev, addon_allowed: e.target.checked }))}
                className="w-5 h-5 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Add-on Allowed</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 h-12 border rounded-xl font-medium"
            style={{ borderColor: '#E5E7EB', color: '#6B7280' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!formData.name.trim() || !formData.scheduled_start || loading}
            className="flex-1 h-12 text-white rounded-xl font-medium disabled:opacity-50"
            style={{ backgroundColor: '#1877F2' }}
          >
            {loading ? 'Creating...' : 'Create Tournament'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EliminateModal({ tournament, onClose, onEliminate }) {
  const [entries, setEntries] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [eliminatedBy, setEliminatedBy] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    try {
      const res = await fetch(`/api/captain/tournaments/${tournament.id}/entries`);
      const data = await res.json();
      if (data.entries) {
        setEntries(data.entries.filter(e => e.status === 'seated'));
      }
    } catch (err) {
      console.error('Load entries error:', err);
    }
  }

  async function handleEliminate() {
    if (!selectedPlayer) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/captain/tournaments/${tournament.id}/eliminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          entry_id: selectedPlayer,
          eliminated_by: eliminatedBy
        })
      });
      onEliminate();
    } catch (err) {
      console.error('Eliminate error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#1F2937' }}>Eliminate Player</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
              Player to Eliminate
            </label>
            <select
              value={selectedPlayer || ''}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              className="w-full h-12 px-3 border rounded-lg"
              style={{ borderColor: '#E5E7EB' }}
            >
              <option value="">Select player...</option>
              {entries.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.player_name || entry.profiles?.display_name || 'Unknown'} - Seat {entry.seat_number}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
              Eliminated By (optional)
            </label>
            <select
              value={eliminatedBy || ''}
              onChange={(e) => setEliminatedBy(e.target.value)}
              className="w-full h-12 px-3 border rounded-lg"
              style={{ borderColor: '#E5E7EB' }}
            >
              <option value="">Select player...</option>
              {entries.filter(e => e.id !== selectedPlayer).map(entry => (
                <option key={entry.id} value={entry.player_id}>
                  {entry.player_name || entry.profiles?.display_name || 'Unknown'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 h-12 border rounded-xl font-medium"
            style={{ borderColor: '#E5E7EB', color: '#6B7280' }}
          >
            Cancel
          </button>
          <button
            onClick={handleEliminate}
            disabled={!selectedPlayer || loading}
            className="flex-1 h-12 text-white rounded-xl font-medium disabled:opacity-50"
            style={{ backgroundColor: '#EF4444' }}
          >
            {loading ? 'Eliminating...' : 'Eliminate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayoutsModal({ tournament, onClose, onSave }) {
  const [entries, setEntries] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    try {
      const res = await fetch(`/api/captain/tournaments/${tournament.id}/entries`);
      const data = await res.json();
      if (data.entries) {
        // Get eliminated/cashed players for payouts
        const eligibleEntries = data.entries.filter(e =>
          e.status === 'eliminated' || e.status === 'cashed'
        ).sort((a, b) => (a.finish_position || 999) - (b.finish_position || 999));
        setEntries(eligibleEntries);

        // Initialize payouts from payout structure
        if (tournament.payout_structure) {
          setPayouts(tournament.payout_structure.map((p, i) => ({
            place: i + 1,
            percentage: p.percentage,
            amount: Math.round((tournament.prize_pool || 0) * (p.percentage / 100)),
            entry_id: eligibleEntries[i]?.id || null
          })));
        }
      }
    } catch (err) {
      console.error('Load entries error:', err);
    }
  }

  async function handleSavePayouts() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      for (const payout of payouts) {
        if (payout.entry_id && payout.amount > 0) {
          await fetch(`/api/captain/tournaments/${tournament.id}/payout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              entry_id: payout.entry_id,
              finish_position: payout.place,
              payout_amount: payout.amount
            })
          });
        }
      }
      onSave();
    } catch (err) {
      console.error('Save payouts error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2" style={{ color: '#1F2937' }}>Tournament Payouts</h2>
        <p className="text-sm mb-4" style={{ color: '#6B7280' }}>
          Prize Pool: ${tournament.prize_pool?.toLocaleString() || 0}
        </p>

        <div className="space-y-3">
          {payouts.map((payout, index) => (
            <div key={index} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white"
                   style={{ backgroundColor: index === 0 ? '#F59E0B' : index === 1 ? '#9CA3AF' : index === 2 ? '#B45309' : '#6B7280' }}>
                {payout.place}
              </div>
              <div className="flex-1">
                <select
                  value={payout.entry_id || ''}
                  onChange={(e) => {
                    const newPayouts = [...payouts];
                    newPayouts[index].entry_id = e.target.value;
                    setPayouts(newPayouts);
                  }}
                  className="w-full h-10 px-2 border rounded"
                  style={{ borderColor: '#E5E7EB' }}
                >
                  <option value="">Select player...</option>
                  {entries.map(entry => (
                    <option key={entry.id} value={entry.id}>
                      {entry.player_name || entry.profiles?.display_name || 'Unknown'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-right">
                <input
                  type="number"
                  value={payout.amount}
                  onChange={(e) => {
                    const newPayouts = [...payouts];
                    newPayouts[index].amount = parseInt(e.target.value) || 0;
                    setPayouts(newPayouts);
                  }}
                  className="w-24 h-10 px-2 border rounded text-right font-medium"
                  style={{ borderColor: '#E5E7EB' }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 h-12 border rounded-xl font-medium"
            style={{ borderColor: '#E5E7EB', color: '#6B7280' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSavePayouts}
            disabled={loading}
            className="flex-1 h-12 text-white rounded-xl font-medium disabled:opacity-50"
            style={{ backgroundColor: '#10B981' }}
          >
            {loading ? 'Saving...' : 'Save Payouts'}
          </button>
        </div>
      </div>
    </div>
  );
}
