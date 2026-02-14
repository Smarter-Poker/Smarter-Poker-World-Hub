/**
 * Commander Tournament Management Page
 * List, create, and manage tournaments
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Plus, Trophy, Clock, Users, DollarSign,
  Calendar, Play, Pause, ChevronRight, Filter, Loader2, RefreshCw
} from 'lucide-react';
import CreateTournamentModal from '../../../src/components/commander/modals/CreateTournamentModal';

const STATUS_CONFIG = {
  scheduled: { bg: 'bg-[#B0B3B8]/10', text: 'text-[#B0B3B8]', label: 'Scheduled' },
  registration: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', label: 'Registration' },
  registering: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', label: 'Registration' },
  running: { bg: 'bg-[#31A24C]/10', text: 'text-[#31A24C]', label: 'Running' },
  paused: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: 'Paused' },
  break: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: 'On Break' },
  final_table: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', label: 'Final Table' },
  completed: { bg: 'bg-[#B0B3B8]/10', text: 'text-[#B0B3B8]', label: 'Completed' },
  cancelled: { bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]', label: 'Cancelled' }
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' }
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isFuture(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) > new Date();
}

export default function CommanderTournamentsPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [venue, setVenue] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Check staff session
  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/commander/login');
        return;
      }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
    } catch (err) {
      router.push('/commander/login');
    }
  }, [router]);

  // Fetch tournaments
  const fetchTournaments = useCallback(async (showRefreshing = false) => {
    if (!venueId) return;
    if (showRefreshing) setRefreshing(true);

    try {
      const params = new URLSearchParams({ venue_id: venueId, limit: '100' });

      if (filter && filter !== 'all') {
        params.set('status', filter);
      }

      const res = await fetch(`/api/commander/tournaments?${params}`);
      const data = await res.json();

      if (data.success) {
        setTournaments(data.data.tournaments || []);
      }
    } catch (err) {
      console.error('Failed to fetch tournaments:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId, filter]);

  useEffect(() => {
    if (venueId) fetchTournaments();
  }, [venueId, filter, fetchTournaments]);

  // Handle tournament created
  function handleTournamentCreated(tournament) {
    fetchTournaments();
  }

  // Navigate to tournament detail
  function openTournament(tournament) {
    router.push(`/commander/tournaments/${tournament.id}`);
  }

  // Group tournaments
  const activeTournaments = tournaments.filter(t =>
    ['running', 'paused', 'break', 'final_table', 'registration', 'registering'].includes(t.status)
  );
  const upcomingTournaments = tournaments.filter(t =>
    t.status === 'scheduled' && isFuture(t.scheduled_start)
  );
  const completedTournaments = tournaments.filter(t =>
    ['completed', 'cancelled'].includes(t.status)
  );

  const displayTournaments = filter === 'all'
    ? tournaments
    : filter === 'upcoming'
    ? upcomingTournaments
    : filter === 'active'
    ? activeTournaments
    : completedTournaments;

  if (!staff || loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Tournaments | {venue?.name || 'Commander'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/commander/dashboard')}
                className="p-2 hover:bg-[#3A3B3C] rounded-lg transition-colors"
              >
                <img src="/images/btn-back.png" alt="Back" style={{ height: 38 }} />
              </button>
              <div>
                <h1 className="font-bold text-white text-lg">Tournaments</h1>
                <p className="text-sm text-[#B0B3B8]">{venue?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchTournaments(true)}
                disabled={refreshing}
                className="p-2 hover:bg-[#3A3B3C] rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-[#B0B3B8] ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 cmd-btn cmd-btn-primary font-medium rounded-lg hover:bg-[#1664d9] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="cmd-panel p-4 text-center">
              <Play className="w-5 h-5 text-[#31A24C] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{activeTournaments.length}</p>
              <p className="text-xs text-[#B0B3B8]">Active</p>
            </div>
            <div className="cmd-panel p-4 text-center">
              <Calendar className="w-5 h-5 text-[#1877F2] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{upcomingTournaments.length}</p>
              <p className="text-xs text-[#B0B3B8]">Upcoming</p>
            </div>
            <div className="cmd-panel p-4 text-center">
              <Trophy className="w-5 h-5 text-[#F59E0B] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{completedTournaments.length}</p>
              <p className="text-xs text-[#B0B3B8]">Completed</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="w-4 h-4 text-[#B0B3B8] flex-shrink-0" />
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === opt.value
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-[#3A3B3C] text-[#B0B3B8] hover:bg-[#3A3B3C]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Tournament List */}
          {displayTournaments.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <Trophy className="w-12 h-12 text-[#3A3B3C] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-white mb-2">
                {filter === 'all' ? 'No Tournaments Yet' : `No ${filter} tournaments`}
              </h2>
              <p className="text-[#B0B3B8] mb-4">
                {filter === 'all'
                  ? 'Create your first tournament to get started'
                  : 'Try a different filter or create a new tournament'
                }
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 cmd-btn cmd-btn-primary font-medium rounded-lg hover:bg-[#1664d9] transition-colors"
              >
                Create Tournament
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {displayTournaments.map((tournament) => {
                const status = STATUS_CONFIG[tournament.status] || STATUS_CONFIG.scheduled;
                const isActive = ['running', 'paused', 'break', 'final_table'].includes(tournament.status);
                const totalPrizePool = tournament.actual_prizepool ||
                  (tournament.entries_count || 0) * (tournament.buyin_amount || 0);

                return (
                  <button
                    key={tournament.id}
                    onClick={() => openTournament(tournament)}
                    className={`w-full cmd-panel p-4 text-left transition-all hover:border-[#1877F2]/30 ${
                      isActive ? 'border-l-4 border-l-[#31A24C]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white truncate">
                            {tournament.name}
                          </h3>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="text-sm text-[#B0B3B8]">
                          {tournament.tournament_type ? tournament.tournament_type.charAt(0).toUpperCase() + tournament.tournament_type.slice(1) : 'NLH'}
                          {tournament.buyin_amount ? ` | $${tournament.buyin_amount}` : ''}
                          {tournament.buyin_fee ? `+$${tournament.buyin_fee}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#3A3B3C] flex-shrink-0 mt-1" />
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#B0B3B8]" />
                        <div>
                          <p className="text-xs text-white">
                            {isToday(tournament.scheduled_start) ? 'Today' : formatDate(tournament.scheduled_start)}
                          </p>
                          <p className="text-xs text-[#B0B3B8]">
                            {formatTime(tournament.scheduled_start)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#B0B3B8]" />
                        <div>
                          <p className="text-xs text-white">
                            {tournament.entries_count || 0}
                            {tournament.max_entries ? `/${tournament.max_entries}` : ''}
                          </p>
                          <p className="text-xs text-[#B0B3B8]">Entries</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-[#B0B3B8]" />
                        <div>
                          <p className="text-xs text-[#31A24C]">
                            ${totalPrizePool.toLocaleString()}
                          </p>
                          <p className="text-xs text-[#B0B3B8]">Prize Pool</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#B0B3B8]" />
                        <div>
                          <p className="text-xs text-white">
                            {tournament.starting_chips ? `${(tournament.starting_chips / 1000)}K` : '--'}
                          </p>
                          <p className="text-xs text-[#B0B3B8]">Chips</p>
                        </div>
                      </div>
                    </div>

                    {/* Active tournament extra info */}
                    {isActive && (
                      <div className="mt-3 pt-3 border-t border-[#3A3B3C] flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-[#B0B3B8]">
                            Level {tournament.current_level || 1}
                          </span>
                          <span className="text-[#B0B3B8]">
                            {tournament.players_remaining || tournament.entries_count || 0} remaining
                          </span>
                        </div>
                        <span className="text-xs font-medium text-[#31A24C] flex items-center gap-1">
                          <span className="w-2 h-2 bg-[#31A24C] rounded-full animate-pulse" />
                          LIVE
                        </span>
                      </div>
                    )}

                    {/* Guaranteed overlay */}
                    {tournament.guaranteed_pool > 0 && totalPrizePool < tournament.guaranteed_pool && (
                      <div className="mt-2 px-2 py-1 bg-[#F59E0B]/10 rounded text-xs text-[#F59E0B]">
                        ${tournament.guaranteed_pool.toLocaleString()} GTD
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Create Tournament Modal */}
      <CreateTournamentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleTournamentCreated}
        venueId={venueId}
      />
    </>
  );
}
