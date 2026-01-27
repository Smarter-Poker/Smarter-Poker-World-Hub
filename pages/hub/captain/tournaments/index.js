/**
 * Player Tournament Hub
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * /hub/captain/tournaments - Browse and register for tournaments
 */
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Trophy, Calendar, Users, DollarSign, Clock, MapPin,
  ChevronRight, Search, Filter, Play, CheckCircle
} from 'lucide-react';

function TournamentCard({ tournament, onRegister, isRegistered }) {
  const startDate = new Date(tournament.scheduled_start);
  const isLive = tournament.status === 'running';
  const canRegister = tournament.status === 'registering' && !isRegistered;

  return (
    <div
      className="bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow"
      style={{ borderColor: '#E5E7EB' }}
    >
      {/* Status banner */}
      {isLive && (
        <div className="bg-green-500 text-white text-center py-1 text-xs font-medium">
          LIVE NOW - {tournament.players_remaining} players remaining
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900">{tournament.name}</h3>
            <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
              <MapPin size={14} />
              {tournament.venue_name || 'Poker Room'}
            </div>
          </div>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              isLive ? 'bg-green-100 text-green-700' :
              tournament.status === 'registering' ? 'bg-blue-100 text-blue-700' :
              tournament.status === 'completed' ? 'bg-gray-100 text-gray-700' :
              'bg-yellow-100 text-yellow-700'
            }`}
          >
            {tournament.status === 'registering' ? 'OPEN' : tournament.status.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar size={16} className="text-gray-400" />
            <span>{startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Clock size={16} className="text-gray-400" />
            <span>{startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <DollarSign size={16} className="text-gray-400" />
            <span>${tournament.buyin_amount} + ${tournament.buyin_fee}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Users size={16} className="text-gray-400" />
            <span>{tournament.total_entries || 0} / {tournament.max_entries || 'Unlimited'}</span>
          </div>
        </div>

        {/* Prize pool */}
        <div className="flex items-center justify-between py-3 border-t border-b mb-4" style={{ borderColor: '#E5E7EB' }}>
          <span className="text-sm text-gray-500">Prize Pool</span>
          <span className="text-lg font-bold text-green-600">
            ${(tournament.actual_prizepool || tournament.guaranteed_prizepool || 0).toLocaleString()}
            {tournament.guaranteed_prizepool && !tournament.actual_prizepool && ' GTD'}
          </span>
        </div>

        {/* Actions */}
        {isRegistered ? (
          <div className="flex items-center justify-center gap-2 py-2 rounded-lg bg-green-50 text-green-700">
            <CheckCircle size={18} />
            <span className="font-medium">Registered</span>
          </div>
        ) : canRegister ? (
          <button
            onClick={() => onRegister?.(tournament)}
            className="w-full py-3 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: '#1877F2' }}
          >
            Register Now
          </button>
        ) : isLive ? (
          <button
            className="w-full py-3 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: '#10B981' }}
          >
            <Play size={16} />
            View Live Clock
          </button>
        ) : (
          <button
            className="w-full py-3 rounded-lg text-sm font-medium border"
            style={{ borderColor: '#E5E7EB', color: '#6B7280' }}
            disabled
          >
            {tournament.status === 'completed' ? 'View Results' : 'Registration Closed'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PlayerTournamentsHub() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, upcoming, live, registered
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text: '' }

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');

      // Load public tournaments
      const res = await fetch('/api/captain/tournaments?status=registering,running', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.tournaments) {
        setTournaments(data.tournaments);
      }

      // Load my registrations if logged in
      if (token) {
        const myRes = await fetch('/api/captain/tournaments/my', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const myData = await myRes.json();
        if (myData.registrations) {
          setMyRegistrations(myData.registrations.map(r => r.tournament_id));
        }
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (tournament) => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/captain/tournaments');
      return;
    }

    try {
      const res = await fetch(`/api/captain/tournaments/${tournament.id}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.entry) {
        setMyRegistrations([...myRegistrations, tournament.id]);
        setMessage({ type: 'success', text: `Successfully registered for ${tournament.name}` });
        setTimeout(() => setMessage(null), 4000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Registration failed' });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (err) {
      console.error('Register error:', err);
      setMessage({ type: 'error', text: 'Registration failed' });
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const filteredTournaments = tournaments.filter(t => {
    if (filter === 'upcoming') return t.status === 'registering';
    if (filter === 'live') return t.status === 'running';
    if (filter === 'registered') return myRegistrations.includes(t.id);
    return true;
  });

  return (
    <>
      <Head>
        <title>Tournaments | Smarter Poker</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="min-h-screen" style={{ backgroundColor: '#F9FAFB', fontFamily: 'Inter, sans-serif' }}>
        {/* Notification Banner */}
        {message && (
          <div
            className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium ${
              message.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy size={28} style={{ color: '#1877F2' }} />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Tournaments</h1>
                  <p className="text-sm text-gray-500">Find and register for poker tournaments</p>
                </div>
              </div>
              <button className="p-2 rounded-lg hover:bg-gray-100">
                <Search size={20} className="text-gray-600" />
              </button>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="bg-white border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex gap-2">
              {[
                { id: 'all', label: 'All' },
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'live', label: 'Live Now' },
                { id: 'registered', label: 'My Tournaments' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === f.id
                      ? 'text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={filter === f.id ? { backgroundColor: '#1877F2' } : {}}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tournament Grid */}
        <div className="max-w-6xl mx-auto px-4 py-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div
                  key={i}
                  className="h-64 rounded-xl animate-pulse"
                  style={{ backgroundColor: '#E5E7EB' }}
                />
              ))}
            </div>
          ) : filteredTournaments.length === 0 ? (
            <div className="text-center py-12">
              <Trophy size={48} className="mx-auto text-gray-400 mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No tournaments found</h3>
              <p className="text-gray-500 mt-1">
                {filter === 'registered'
                  ? 'You haven\'t registered for any tournaments yet'
                  : 'Check back later for upcoming tournaments'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTournaments.map(tournament => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  onRegister={handleRegister}
                  isRegistered={myRegistrations.includes(tournament.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
