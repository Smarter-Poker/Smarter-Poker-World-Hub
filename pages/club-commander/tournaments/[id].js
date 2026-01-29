/**
 * Tournament Detail Page - Manage a specific tournament
 * Shows clock, entries, eliminations, and payouts
 * UI: Facebook color scheme, no emojis, Inter font
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
import EliminatePlayerModal from '../../../src/components/club-commander/modals/EliminatePlayerModal';
import PayoutModal from '../../../src/components/club-commander/modals/PayoutModal';

const STATUS_CONFIG = {
  scheduled: { bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]', label: 'Scheduled' },
  registering: { bg: 'bg-[#DBEAFE]', text: 'text-[#1D4ED8]', label: 'Registration Open' },
  running: { bg: 'bg-[#D1FAE5]', text: 'text-[#059669]', label: 'Running' },
  break: { bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]', label: 'On Break' },
  final_table: { bg: 'bg-[#EDE9FE]', text: 'text-[#7C3AED]', label: 'Final Table' },
  completed: { bg: 'bg-[#E5E7EB]', text: 'text-[#374151]', label: 'Completed' },
  cancelled: { bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]', label: 'Cancelled' }
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
    const storedStaff = localStorage.getItem('club_commander_staff');
    if (!storedStaff) {
      router.push('/club-commander/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      setStaff(staffData);
    } catch (err) {
      router.push('/club-commander/login');
    }
  }, [router]);

  // Fetch tournament data
  const fetchTournament = useCallback(async () => {
    if (!id) return;

    try {
      const [tournamentRes, entriesRes] = await Promise.all([
        fetch(`/api/club-commander/tournaments/${id}`),
        fetch(`/api/club-commander/tournaments/${id}/entries`)
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
      const res = await fetch(`/api/club-commander/tournaments/${id}/clock`, {
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
      const res = await fetch(`/api/club-commander/tournaments/${id}`, {
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
    window.open(`/hub/club-commander/tournament/${id}/clock`, '_blank');
  }

  const activeEntries = entries.filter(e => e.status === 'active');
  const eliminatedEntries = entries.filter(e => e.status === 'eliminated')
    .sort((a, b) => (a.finish_position || 999) - (b.finish_position || 999));

  const status = STATUS_CONFIG[tournament?.status] || STATUS_CONFIG.scheduled;

  if (!staff || loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
          <p className="text-[#6B7280]">Tournament not found</p>
          <button
            onClick={() => router.push('/club-commander/tournaments')}
            className="mt-4 px-4 py-2 bg-[#1877F2] text-white rounded-lg"
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
        <title>{tournament.name} | Club Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/club-commander/tournaments')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="font-bold text-[#1F2937]">{tournament.name}</h1>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchTournament}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <RefreshCw className="w-5 h-5 text-[#6B7280]" />
              </button>
              <button
                onClick={openPublicClock}
                className="flex items-center gap-2 px-3 py-2 border border-[#E5E7EB] rounded-lg hover:bg-[#F3F4F6] transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-[#6B7280]" />
                <span className="text-sm font-medium text-[#1F2937]">Public Clock</span>
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
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
              <Users className="w-5 h-5 text-[#1877F2] mx-auto mb-1" />
              <p className="text-2xl font-bold text-[#1F2937]">{activeEntries.length}</p>
              <p className="text-xs text-[#6B7280]">Remaining</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
              <Trophy className="w-5 h-5 text-[#F59E0B] mx-auto mb-1" />
              <p className="text-2xl font-bold text-[#1F2937]">{entries.length}</p>
              <p className="text-xs text-[#6B7280]">Entries</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
              <DollarSign className="w-5 h-5 text-[#10B981] mx-auto mb-1" />
              <p className="text-2xl font-bold text-[#10B981]">
                ${(tournament.actual_prizepool || entries.length * (tournament.buyin_amount || 0)).toLocaleString()}
              </p>
              <p className="text-xs text-[#6B7280]">Prize Pool</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
              <Clock className="w-5 h-5 text-[#8B5CF6] mx-auto mb-1" />
              <p className="text-2xl font-bold text-[#1F2937]">{tournament.current_level || 1}</p>
              <p className="text-xs text-[#6B7280]">Level</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            {tournament.status === 'scheduled' && (
              <button
                onClick={() => handleStatusChange('registering')}
                className="flex items-center justify-center gap-2 p-4 bg-[#1877F2] text-white rounded-xl font-medium hover:bg-[#1664d9] transition-colors"
              >
                <UserPlus className="w-5 h-5" />
                Open Registration
              </button>
            )}

            {tournament.status === 'registering' && (
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
            <div className="bg-white rounded-xl border border-[#E5E7EB]">
              <div className="p-4 border-b border-[#E5E7EB]">
                <h3 className="font-semibold text-[#1F2937]">
                  Active Players ({activeEntries.length})
                </h3>
              </div>
              <div className="divide-y divide-[#E5E7EB] max-h-80 overflow-y-auto">
                {activeEntries.length === 0 ? (
                  <div className="p-4 text-center text-[#6B7280]">
                    No active players
                  </div>
                ) : (
                  activeEntries.map((entry) => (
                    <div key={entry.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[#1F2937]">
                          {entry.player_name || entry.profiles?.display_name || 'Unknown'}
                        </p>
                        {entry.seat_number && (
                          <p className="text-sm text-[#6B7280]">Seat {entry.seat_number}</p>
                        )}
                      </div>
                      <span className="text-sm text-[#6B7280]">
                        ${entry.total_chips?.toLocaleString() || tournament.starting_chips?.toLocaleString() || '10,000'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Eliminated Players */}
            <div className="bg-white rounded-xl border border-[#E5E7EB]">
              <div className="p-4 border-b border-[#E5E7EB]">
                <h3 className="font-semibold text-[#1F2937]">
                  Eliminated ({eliminatedEntries.length})
                </h3>
              </div>
              <div className="divide-y divide-[#E5E7EB] max-h-80 overflow-y-auto">
                {eliminatedEntries.length === 0 ? (
                  <div className="p-4 text-center text-[#6B7280]">
                    No eliminations yet
                  </div>
                ) : (
                  eliminatedEntries.map((entry) => (
                    <div key={entry.id} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#F3F4F6] rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-[#6B7280]">
                            {entry.finish_position || '-'}
                          </span>
                        </div>
                        <p className="font-medium text-[#1F2937]">
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
