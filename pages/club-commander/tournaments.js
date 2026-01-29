/**
 * Staff Tournament Management
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * /club-commander/tournaments - Manage tournaments, clock, registrations
 */
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Trophy, Plus, Play, Pause, SkipForward, Users,
  Clock, DollarSign, Settings, ChevronRight, RefreshCw,
  UserPlus, UserMinus, Award, Calendar, ArrowLeft
} from 'lucide-react';
import TournamentClock from '../../src/components/club-commander/tournament/TournamentClock';

export default function TournamentsPage() {
  const router = useRouter();
  const { venue_id } = router.query;

  const [tournaments, setTournaments] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (venue_id) loadTournaments();
  }, [venue_id]);

  const loadTournaments = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/club-commander/tournaments?venue_id=${venue_id}`, {
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
      await fetch(`/api/club-commander/tournaments/${activeTournament.id}/clock`, {
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
        <title>Tournaments | Smarter Club Commander</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="min-h-screen" style={{ backgroundColor: '#F9FAFB', fontFamily: 'Inter, sans-serif' }}>
        {/* Header */}
        <header className="bg-white border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/club-commander/dashboard?venue_id=${venue_id}`)}
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
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: '#E5E7EB' }}
                  >
                    <UserMinus size={16} />
                    Eliminate Player
                  </button>
                  <button
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
                    onClick={() => router.push(`/club-commander/tournaments/${tournament.id}?venue_id=${venue_id}`)}
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
    </>
  );
}
