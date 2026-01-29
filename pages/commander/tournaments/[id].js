/**
 * Tournament Detail Page - Manage a specific tournament
 * Shows clock, entries, eliminations, and payouts
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  Trophy,
  Clock,
  Users,
  DollarSign,
  Play,
  Pause,
  SkipForward,
  UserMinus,
  UserPlus,
  Award,
  ExternalLink,
  RefreshCw,
  Loader2
} from 'lucide-react';
import EliminatePlayerModal from '../../../src/components/commander/modals/EliminatePlayerModal';
import PayoutModal from '../../../src/components/commander/modals/PayoutModal';

const STATUS_CONFIG = {
  scheduled: { bg: 'bg-[#64748B]/10', text: 'text-[#64748B]', label: 'Scheduled' },
  registration: { bg: 'bg-[#22D3EE]/10', text: 'text-[#22D3EE]', label: 'Registration Open' },
  running: { bg: 'bg-[#10B981]/10', text: 'text-[#10B981]', label: 'Running' },
  break: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: 'On Break' },
  final_table: { bg: 'bg-[#8B5CF6]/10', text: 'text-[#8B5CF6]', label: 'Final Table' },
  completed: { bg: 'bg-[#64748B]/10', text: 'text-[#64748B]', label: 'Completed' },
  cancelled: { bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]', label: 'Cancelled' }
};

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function TournamentDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [staff, setStaff] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockRunning, setClockRunning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const [showEliminateModal, setShowEliminateModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  // Check staff session
  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      setStaff(staffData);
    } catch (err) {
      router.push('/commander/login');
    }
  }, [router]);

  // Fetch tournament data
  const fetchTournament = useCallback(async () => {
    if (!id) return;

    try {
      const [tournamentRes, entriesRes] = await Promise.all([
        fetch(`/api/commander/tournaments/${id}`),
        fetch(`/api/commander/tournaments/${id}/entries`)
      ]);

      const tournamentData = await tournamentRes.json();
      const entriesData = await entriesRes.json();

      if (tournamentData.success) {
        setTournament(tournamentData.data.tournament);
        setClockRunning(tournamentData.data.tournament?.clock_status === 'running');
        setTimeRemaining(tournamentData.data.tournament?.time_remaining || 0);
      }

      if (entriesData.success) {
        setEntries(entriesData.data.entries || []);
      }
    } catch (error) {
      console.error('Failed to fetch tournament:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (staff && id) {
      fetchTournament();
    }
  }, [staff, id, fetchTournament]);

  // Clock countdown
  useEffect(() => {
    if (!clockRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setClockRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [clockRunning, timeRemaining]);

  // Clock actions
  async function handleClockAction(action) {
    try {
      const res = await fetch(`/api/commander/tournaments/${id}/clock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      const data = await res.json();
      if (data.success) {
        fetchTournament();
      }
    } catch (error) {
      console.error('Clock action failed:', error);
    }
  }

  // Tournament status update
  async function handleStatusChange(newStatus) {
    try {
      const res = await fetch(`/api/commander/tournaments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json();
      if (data.success) {
        fetchTournament();
      }
    } catch (error) {
      console.error('Status change failed:', error);
    }
  }

  // View public clock
  function openPublicClock() {
    window.open(`/hub/commander/tournament/${id}/clock`, '_blank');
  }

  const activeEntries = entries.filter(e => e.status === 'active');
  const eliminatedEntries = entries.filter(e => e.status === 'eliminated')
    .sort((a, b) => (a.finish_position || 999) - (b.finish_position || 999));

  const status = STATUS_CONFIG[tournament?.status] || STATUS_CONFIG.scheduled;

  if (!staff || loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
          <p className="text-[#64748B]">Tournament not found</p>
          <button
            onClick={() => router.push('/commander/tournaments')}
            className="mt-4 px-4 py-2 cmd-btn cmd-btn-primary rounded-lg"
          >
            Back to Tournaments
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{tournament.name} | Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/commander/tournaments')}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white">{tournament.name}</h1>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchTournament}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <RefreshCw className="w-5 h-5 text-[#64748B]" />
              </button>
              <button
                onClick={openPublicClock}
                className="flex items-center gap-2 px-3 py-2 border border-[#4A5E78] rounded-lg hover:bg-[#132240] transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-[#64748B]" />
                <span className="text-sm font-medium text-white">Public Clock</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Clock Section */}
          {['running', 'break', 'final_table'].includes(tournament.status) && (
            <div className="bg-[#1F2937] rounded-xl p-6 text-white">
              <div className="text-center mb-6">
                <p className="text-sm text-gray-400 mb-1">
                  Level {tournament.current_level || 1}
                </p>
                <p className="text-6xl font-bold font-mono">
                  {formatTime(timeRemaining)}
                </p>
                <p className="text-lg text-gray-300 mt-2">
                  Blinds: {tournament.current_small_blind || 25}/{tournament.current_big_blind || 50}
                  {tournament.current_ante > 0 && ` (${tournament.current_ante} ante)`}
                </p>
              </div>

              <div className="flex justify-center gap-3">
                <button
                  onClick={() => handleClockAction(clockRunning ? 'pause' : 'resume')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
                    clockRunning
                      ? 'bg-[#F59E0B] hover:bg-[#D97706]'
                      : 'bg-[#10B981] hover:bg-[#059669]'
                  }`}
                >
                  {clockRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  {clockRunning ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => handleClockAction('next_level')}
                  className="flex items-center gap-2 px-6 py-3 bg-white/10 rounded-lg font-medium hover:bg-white/20"
                >
                  <SkipForward className="w-5 h-5" />
                  Next Level
                </button>
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="cmd-panel p-4 text-center">
              <Users className="w-5 h-5 text-[#22D3EE] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{activeEntries.length}</p>
              <p className="text-xs text-[#64748B]">Remaining</p>
            </div>
            <div className="cmd-panel p-4 text-center">
              <Trophy className="w-5 h-5 text-[#F59E0B] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{entries.length}</p>
              <p className="text-xs text-[#64748B]">Entries</p>
            </div>
            <div className="cmd-panel p-4 text-center">
              <DollarSign className="w-5 h-5 text-[#10B981] mx-auto mb-1" />
              <p className="text-2xl font-bold text-[#10B981]">
                ${(tournament.guaranteed_pool || entries.length * (tournament.buyin_amount || 0)).toLocaleString()}
              </p>
              <p className="text-xs text-[#64748B]">Prize Pool</p>
            </div>
            <div className="cmd-panel p-4 text-center">
              <Clock className="w-5 h-5 text-[#8B5CF6] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{tournament.current_level || 1}</p>
              <p className="text-xs text-[#64748B]">Level</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            {tournament.status === 'scheduled' && (
              <button
                onClick={() => handleStatusChange('registration')}
                className="flex items-center justify-center gap-2 p-4 cmd-btn cmd-btn-primary rounded-xl font-medium transition-colors"
              >
                <UserPlus className="w-5 h-5" />
                Open Registration
              </button>
            )}

            {tournament.status === 'registration' && (
              <button
                onClick={() => handleStatusChange('running')}
                className="flex items-center justify-center gap-2 p-4 bg-[#10B981] text-white rounded-xl font-medium hover:bg-[#059669] transition-colors"
              >
                <Play className="w-5 h-5" />
                Start Tournament
              </button>
            )}

            {['running', 'break', 'final_table'].includes(tournament.status) && (
              <>
                <button
                  onClick={() => setShowEliminateModal(true)}
                  className="flex items-center justify-center gap-2 p-4 bg-[#EF4444] text-white rounded-xl font-medium hover:bg-[#DC2626] transition-colors"
                >
                  <UserMinus className="w-5 h-5" />
                  Eliminate Player
                </button>
                <button
                  onClick={() => setShowPayoutModal(true)}
                  className="flex items-center justify-center gap-2 p-4 bg-[#10B981] text-white rounded-xl font-medium hover:bg-[#059669] transition-colors"
                >
                  <Award className="w-5 h-5" />
                  Payouts
                </button>
              </>
            )}

            {tournament.status === 'running' && activeEntries.length <= 9 && (
              <button
                onClick={() => handleStatusChange('final_table')}
                className="flex items-center justify-center gap-2 p-4 bg-[#8B5CF6] text-white rounded-xl font-medium hover:bg-[#7C3AED] transition-colors col-span-2"
              >
                <Trophy className="w-5 h-5" />
                Final Table
              </button>
            )}
          </div>

          {/* Players Section */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Active Players */}
            <div className="cmd-panel">
              <div className="p-4 border-b border-[#4A5E78]">
                <h3 className="font-semibold text-white">
                  Active Players ({activeEntries.length})
                </h3>
              </div>
              <div className="divide-y divide-[#4A5E78] max-h-80 overflow-y-auto">
                {activeEntries.length === 0 ? (
                  <div className="p-4 text-center text-[#64748B]">
                    No active players
                  </div>
                ) : (
                  activeEntries.map((entry) => (
                    <div key={entry.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">
                          {entry.player_name || entry.profiles?.display_name || 'Unknown'}
                        </p>
                        {entry.seat_number && (
                          <p className="text-sm text-[#64748B]">Seat {entry.seat_number}</p>
                        )}
                      </div>
                      <span className="text-sm text-[#64748B]">
                        ${entry.total_chips?.toLocaleString() || tournament.starting_chips?.toLocaleString() || '10,000'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Eliminated Players */}
            <div className="cmd-panel">
              <div className="p-4 border-b border-[#4A5E78]">
                <h3 className="font-semibold text-white">
                  Eliminated ({eliminatedEntries.length})
                </h3>
              </div>
              <div className="divide-y divide-[#4A5E78] max-h-80 overflow-y-auto">
                {eliminatedEntries.length === 0 ? (
                  <div className="p-4 text-center text-[#64748B]">
                    No eliminations yet
                  </div>
                ) : (
                  eliminatedEntries.map((entry) => (
                    <div key={entry.id} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#0D192E] rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-[#64748B]">
                            {entry.finish_position || '-'}
                          </span>
                        </div>
                        <p className="font-medium text-white">
                          {entry.player_name || entry.profiles?.display_name || 'Unknown'}
                        </p>
                      </div>
                      {entry.payout_amount > 0 && (
                        <span className="text-sm font-medium text-[#10B981]">
                          ${entry.payout_amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modals */}
      <EliminatePlayerModal
        isOpen={showEliminateModal}
        onClose={() => setShowEliminateModal(false)}
        onSubmit={() => {
          setShowEliminateModal(false);
          fetchTournament();
        }}
        tournament={tournament}
        entries={entries}
      />

      <PayoutModal
        isOpen={showPayoutModal}
        onClose={() => setShowPayoutModal(false)}
        onSubmit={() => {
          setShowPayoutModal(false);
          fetchTournament();
        }}
        tournament={tournament}
        entries={entries}
      />
    </>
  );
}
