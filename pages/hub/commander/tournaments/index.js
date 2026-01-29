/**
 * Player Tournament Hub
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * /hub/commander/tournaments - Browse and register for tournaments
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Trophy, Calendar, Users, DollarSign, Clock, MapPin,
  ChevronRight, Search, Filter, Play, CheckCircle, Zap
} from 'lucide-react';

function TournamentCard({ tournament, onRegister, isRegistered }) {
  const startDate = new Date(tournament.scheduled_start);
  const isLive = tournament.status === 'running';
  const canRegister = tournament.status === 'registering' && !isRegistered;

  return (
    <div className="cmd-panel cmd-corner-lights overflow-hidden">
      {/* Corner glow lights */}
      <span className="cmd-light cmd-light-tl" />
      <span className="cmd-light cmd-light-br" />

      {/* Rivets */}
      <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
      <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>

      {/* Status banner */}
      {isLive && (
        <div className="bg-[#10B981]/20 border-b-2 border-[#10B981] text-[#10B981] text-center py-1.5 text-xs font-bold uppercase tracking-wider">
          LIVE NOW - {tournament.players_remaining} players remaining
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-white text-lg">{tournament.name}</h3>
            <div className="flex items-center gap-1 mt-1 text-sm text-[#64748B]">
              <MapPin size={14} />
              {tournament.venue_name || 'Poker Room'}
            </div>
          </div>
          <span className={`cmd-badge ${
            isLive ? 'cmd-badge-live' :
            tournament.status === 'registering' ? 'cmd-badge-primary' :
            tournament.status === 'completed' ? 'cmd-badge-chrome' :
            'cmd-badge-warning'
          }`}>
            {tournament.status === 'registering' ? 'OPEN' : tournament.status.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div className="flex items-center gap-2 text-[#CBD5E1]">
            <Calendar size={16} className="text-[#64748B]" />
            <span>{startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-2 text-[#CBD5E1]">
            <Clock size={16} className="text-[#64748B]" />
            <span>{startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <div className="flex items-center gap-2 text-[#CBD5E1]">
            <DollarSign size={16} className="text-[#64748B]" />
            <span>${tournament.buyin_amount} + ${tournament.buyin_fee}</span>
          </div>
          <div className="flex items-center gap-2 text-[#CBD5E1]">
            <Users size={16} className="text-[#64748B]" />
            <span>{tournament.total_entries || 0} / {tournament.max_entries || 'Unlimited'}</span>
          </div>
        </div>

        {/* Prize pool */}
        <div className="cmd-divider" style={{ margin: '12px 0' }} />
        <div className="flex items-center justify-between py-2 mb-4">
          <span className="text-sm text-[#64748B] uppercase tracking-wide font-bold">Prize Pool</span>
          <span className="text-lg font-bold text-[#10B981]">
            ${(tournament.actual_prizepool || tournament.guaranteed_prizepool || 0).toLocaleString()}
            {tournament.guaranteed_prizepool && !tournament.actual_prizepool && ' GTD'}
          </span>
        </div>

        {/* Actions */}
        {isRegistered ? (
          <div className="cmd-badge cmd-badge-live w-full justify-center py-3">
            <CheckCircle size={18} />
            <span className="font-bold">REGISTERED</span>
          </div>
        ) : canRegister ? (
          <button
            onClick={() => onRegister?.(tournament)}
            className="cmd-btn cmd-btn-primary w-full justify-center"
          >
            REGISTER NOW
          </button>
        ) : isLive ? (
          <button className="cmd-btn cmd-btn-success w-full justify-center">
            <Play size={16} />
            VIEW LIVE CLOCK
          </button>
        ) : (
          <button className="cmd-btn cmd-btn-secondary w-full justify-center opacity-50 cursor-not-allowed" disabled>
            {tournament.status === 'completed' ? 'VIEW RESULTS' : 'REGISTRATION CLOSED'}
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
      const res = await fetch('/api/commander/tournaments?status=registering,running', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.tournaments) {
        setTournaments(data.tournaments);
      }

      // Load my registrations if logged in
      if (token) {
        const myRes = await fetch('/api/commander/tournaments/my', {
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
      router.push('/login?redirect=/hub/commander/tournaments');
      return;
    }

    try {
      const res = await fetch(`/api/commander/tournaments/${tournament.id}/entries`, {
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Notification Banner */}
        {message && (
          <div className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-bold uppercase tracking-wide ${
            message.type === 'success'
              ? 'bg-[#10B981]/20 border-b-2 border-[#10B981] text-[#10B981]'
              : 'bg-[#EF4444]/20 border-b-2 border-[#EF4444] text-[#EF4444]'
          }`}>
            {message.text}
          </div>
        )}

        {/* Header */}
        <header className="cmd-header-full">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <div className="cmd-icon-box cmd-icon-box-glow w-14 h-14">
                <Trophy className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-white tracking-wider cmd-text-glow">TOURNAMENTS</h1>
                <p className="text-sm text-[#64748B] font-medium tracking-wide">Find and register for poker tournaments</p>
              </div>
              {/* Rivets */}
              <div className="ml-auto flex gap-2">
                <span className="cmd-rivet" />
                <span className="cmd-rivet" />
                <span className="cmd-rivet" />
              </div>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="border-b-2 border-[#4A5E78] bg-[#0F1C32]">
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
                  className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors border-2 ${
                    filter === f.id
                      ? 'bg-[#132240] text-[#22D3EE] border-[#22D3EE]'
                      : 'bg-[#0F1C32] text-[#64748B] border-[#4A5E78] hover:border-[#7A8EA8]'
                  }`}
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
                  className="h-64 rounded-xl animate-pulse bg-[#132240]"
                />
              ))}
            </div>
          ) : filteredTournaments.length === 0 ? (
            <div className="cmd-panel p-12 text-center">
              <div className="cmd-icon-box mx-auto mb-4">
                <Trophy className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">No tournaments found</h3>
              <p className="text-[#64748B] mt-1">
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
