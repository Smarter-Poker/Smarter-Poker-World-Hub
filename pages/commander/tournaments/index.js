/**
 * Commander Tournament Management Page
 * List, create, and manage tournaments
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import {
  Plus, Trophy, Clock, Users, DollarSign,
  Calendar, Play, ChevronRight, Filter, Loader2, RefreshCw, Sliders
} from 'lucide-react';
import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';
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
  { value: 'current_future', label: 'Current & Future' },
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
  const [filter, setFilter] = useState('current_future');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [page, setPage] = useState(1);

  // Check staff session
  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login').catch(() => { });
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/commander/login').catch(() => { });
        return;
      }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
    } catch (err) {
      router.push('/commander/login').catch(() => { });
    }
  }, [router]);

  // Fetch tournaments — pass status filter to API for server-side filtering
  const fetchTournaments = useCallback(async (showRefreshing = false) => {
    if (!venueId) return;
    if (showRefreshing) setRefreshing(true);

    try {
      const params = new URLSearchParams({ venue_id: venueId, limit: '200' });

      // Server-side status filtering for current_future, active, upcoming, completed, cancelled
      if (filter === 'current_future') {
        params.set('status', 'current_future');
      } else if (filter === 'active') {
        params.set('status', 'active');
      } else if (filter === 'upcoming') {
        params.set('status', 'upcoming');
      } else if (filter === 'completed') {
        params.set('status', 'completed');
      } else if (filter === 'cancelled') {
        params.set('status', 'cancelled');
      }
      // 'all' = no status param

      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch(`/api/commander/tournaments?${params}`, {
        headers: { 'x-staff-session': staffSession },
      });
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
  }, [venueId, fetchTournaments]);

  // Handle tournament created
  function handleTournamentCreated(tournament) {
    fetchTournaments();
  }

  // Navigate to tournament detail
  function openTournament(tournament) {
    router.push(`/commander/tournaments/${tournament.id}`);
  }

  // Memoized tournament groups for stats display
  const activeTournaments = useMemo(() => tournaments.filter(t =>
    ['running', 'paused', 'break', 'final_table'].includes(t.status)
  ), [tournaments]);
  const upcomingTournaments = useMemo(() => tournaments.filter(t =>
    ['scheduled', 'registration', 'registering'].includes(t.status)
  ), [tournaments]);
  const completedTournaments = useMemo(() => tournaments.filter(t =>
    ['completed', 'cancelled'].includes(t.status)
  ), [tournaments]);

  // Server-side filtering means tournaments are already the correct set
  const paginatedTournaments = useMemo(() => tournaments.slice(0, page * 25), [tournaments, page]);

  if (!staff || loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <CommanderLayout title={`Tournaments | ${venue?.name || 'Commander'}`} backHref="/commander/dashboard?card=tournaments">
      <div className="cmd-page">
        {/* Action Bar */}
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-end gap-2">
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

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

          {/* ── Tournament Director Shortcut Card ── */}
          <button
            onClick={() => router.push('/commander/tournament-controls')}
            className="w-full cmd-panel p-4 text-left flex items-center gap-4 hover:border-[#F59E0B]/50 transition-all active:scale-[0.99]"
            style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(36,37,38,0.95) 100%)' }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: 14, flexShrink: 0,
              background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img
                src="/images/commander/icons/tn-controls.png"
                alt="Tournament Director"
                style={{ width: 36, height: 36, objectFit: 'contain' }}
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
              />
              <div style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                <Sliders size={26} style={{ color: '#F59E0B' }} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Tournament Director</p>
              <p className="text-xs text-[#B0B3B8] mt-0.5">Clock · Structure · Payouts · Players · Tables</p>
            </div>
            <div style={{
              padding: '7px 16px', borderRadius: 10, background: '#F59E0B',
              color: '#000', fontSize: 13, fontWeight: 700, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Sliders size={14} />
              Launch
            </div>
          </button>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <button onClick={() => { setFilter(filter === 'active' ? 'current_future' : 'active'); setPage(1); }} className={`cmd-panel p-4 text-center cursor-pointer transition-all hover:border-[#31A24C]/40 ${filter === 'active' ? 'border-[#31A24C]/60 ring-1 ring-[#31A24C]/30' : ''}`}>
              <Play className="w-5 h-5 text-[#31A24C] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{activeTournaments.length}</p>
              <p className="text-xs text-[#B0B3B8]">Active</p>
            </button>
            <button onClick={() => { setFilter(filter === 'upcoming' ? 'current_future' : 'upcoming'); setPage(1); }} className={`cmd-panel p-4 text-center cursor-pointer transition-all hover:border-[#1877F2]/40 ${filter === 'upcoming' ? 'border-[#1877F2]/60 ring-1 ring-[#1877F2]/30' : ''}`}>
              <Calendar className="w-5 h-5 text-[#1877F2] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{upcomingTournaments.length}</p>
              <p className="text-xs text-[#B0B3B8]">Upcoming</p>
            </button>
            <button onClick={() => { setFilter(filter === 'completed' ? 'current_future' : 'completed'); setPage(1); }} className={`cmd-panel p-4 text-center cursor-pointer transition-all hover:border-[#F59E0B]/40 ${filter === 'completed' ? 'border-[#F59E0B]/60 ring-1 ring-[#F59E0B]/30' : ''}`}>
              <Trophy className="w-5 h-5 text-[#F59E0B] mx-auto mb-1" />
              <p className="text-2xl font-bold text-white">{completedTournaments.length}</p>
              <p className="text-xs text-[#B0B3B8]">Completed</p>
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="w-4 h-4 text-[#B0B3B8] flex-shrink-0" />
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setFilter(opt.value); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === opt.value
                  ? 'bg-[#1877F2] text-white'
                  : 'bg-[#3A3B3C] text-[#B0B3B8] hover:bg-[#3A3B3C]'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Tournament List */}
          {tournaments.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <Trophy className="w-12 h-12 text-[#3A3B3C] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-white mb-2">
                {filter === 'all' || filter === 'current_future' ? 'No Tournaments Yet' : `No ${filter} tournaments`}
              </h2>
              <p className="text-[#B0B3B8] mb-4">
                {filter === 'all' || filter === 'current_future'
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
              {paginatedTournaments.map((tournament) => {
                const status = STATUS_CONFIG[tournament.status] || STATUS_CONFIG.scheduled;
                const isActive = ['running', 'paused', 'break', 'final_table'].includes(tournament.status);
                const totalPrizePool = tournament.actual_prizepool ||
                  (tournament.entries_count || 0) * (tournament.buyin_amount || 0);

                return (
                  <button
                    key={tournament.id}
                    onClick={() => openTournament(tournament)}
                    className={`w-full cmd-panel p-4 text-left transition-all hover:border-[#1877F2]/30 ${isActive ? 'border-l-4 border-l-[#31A24C]' : ''
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

              {tournaments.length > paginatedTournaments.length && (
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="w-full py-3 mt-4 cmd-panel text-center text-[#B0B3B8] font-medium hover:text-white transition-colors"
                >
                  Load More Tournaments
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      <CreateTournamentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleTournamentCreated}
        venueId={venueId}
      />
    </CommanderLayout>
  );
}
