/**
 * Player Tournament Hub
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * /hub/commander/tournaments - Browse and register for tournaments
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { usePersistedState } from '../../../../src/hooks/usePersistedState';
import {
  Trophy, Calendar, Users, DollarSign, Clock, MapPin,
  CheckCircle
} from 'lucide-react';
import { supabase } from '../../../../src/lib/supabase';
import { getAccessToken, ensureAuthReady } from '../../../../src/lib/authUtils';
import CommanderPageShell from '../../../../src/components/commander/CommanderPageShell';

function TournamentCard({ tournament, onRegister, isRegistered, isAlternate }) {
  const router = useRouter();
  const startDate = new Date(tournament.scheduled_start);
  const isLive = tournament.status === 'running' || tournament.status === 'final_table';
  const canRegister = tournament.status === 'registering' && !isRegistered;
  // The list endpoint returns current_entries; total_entries only exists on the
  // venue-scoped ("*") variant, so read both.
  const entryCount = tournament.current_entries ?? tournament.total_entries ?? 0;
  // A full field does not block registration any more: the entries API puts the
  // player on the alternates list instead.
  const isFull = Boolean(tournament.max_entries && entryCount >= tournament.max_entries);

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
          LIVE NOW - {tournament.players_remaining ?? 0} Players Remaining
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
            {tournament.status === 'registering' ? 'OPEN' : tournament.status.replace(/_/g, ' ').toUpperCase()}
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
            <span>${(tournament.buyin_amount ?? 0).toLocaleString()} + ${(tournament.buyin_fee ?? 0).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 text-[#CBD5E1]">
            <Users size={16} className="text-[#64748B]" />
            <span>{entryCount.toLocaleString()} / {tournament.max_entries ? tournament.max_entries.toLocaleString() : 'Unlimited'}</span>
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
          isAlternate ? (
            <div className="cmd-badge cmd-badge-warning w-full justify-center py-3">
              <Users size={18} />
              <span className="font-bold">ON ALTERNATES LIST</span>
            </div>
          ) : (
            <div className="cmd-badge cmd-badge-live w-full justify-center py-3">
              <CheckCircle size={18} />
              <span className="font-bold">REGISTERED</span>
            </div>
          )
        ) : canRegister ? (
          <button
            onClick={() => onRegister?.(tournament)}
            className={`cmd-btn ${isFull ? 'cmd-btn-secondary' : 'cmd-btn-primary'} w-full justify-center`}
          >
            {isFull ? 'JOIN ALTERNATES LIST' : 'REGISTER NOW'}
          </button>
        ) : isLive ? (
          <button onClick={() => router.push('/hub/commander/tournament/' + tournament.id + '/clock')} className="cmd-btn cmd-btn-success w-full justify-center">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" aria-hidden="true" />
            View Live
          </button>
        ) : tournament.status === 'completed' ? (
          <button onClick={() => router.push('/hub/commander/tournament/' + tournament.id + '/clock')} className="cmd-btn cmd-btn-secondary w-full justify-center">
            VIEW RESULTS
          </button>
        ) : (
          <button className="cmd-btn cmd-btn-secondary w-full justify-center opacity-50 cursor-not-allowed" disabled>
            REGISTRATION CLOSED
          </button>
        )}
      </div>
    </div>
  );
}

export default function PlayerTournamentsHub() {
  const router = useRouter();
  const [myRegistrations, setMyRegistrations] = useState([]);
  // Tournament ids where my entry status is 'alternate' (field was full).
  const [myAlternates, setMyAlternates] = useState([]);
  const [filter, setFilter] = usePersistedState('sp-filters-commander-tournaments', 'all');
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text: '' }

  const { data: swrData, isLoading, mutate: refreshTournaments } = useSWR('/api/commander/tournaments?status=active', async (url) => {
    const token = getAccessToken();
    // Every branch must expose .json(): the old catch fallback returned
    // { ok: false } with no json, so ONE failed /my request threw a TypeError
    // and blanked the entire tournament list.
    const emptyRes = { ok: false, json: async () => ({}) };
    const [tourRes, myRes] = await Promise.all([
      fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => emptyRes),
      token ? fetch('/api/commander/tournaments/my', { headers: { Authorization: `Bearer ${token}` } }).catch(() => emptyRes)
             : Promise.resolve(emptyRes)
    ]);
    if (!tourRes.ok) throw new Error(`Request failed (${tourRes.status ?? 'network error'})`);
    const [tourData, myData] = await Promise.all([
      tourRes.json().catch(() => ({})),
      myRes.json().catch(() => ({}))
    ]);
    // 2026-07-25 audit fix: API returns {success, data:{tournaments}} and
    // {success, data:{registrations}} - old code read top-level keys and always got [].
    const registrations = myData?.data?.registrations || myData?.registrations || [];
    // /my returns every entry including cancelled ones; a cancelled entry must
    // not keep a tournament flagged as registered.
    const liveRegistrations = registrations.filter(r => r.status !== 'cancelled');
    setMyRegistrations(liveRegistrations.map(r => r.tournament_id));
    setMyAlternates(liveRegistrations.filter(r => r.status === 'alternate').map(r => r.tournament_id));
    return tourData?.data?.tournaments || tourData?.tournaments || [];
  });
  const tournaments = swrData || [];

  const loadTournaments = () => refreshTournaments();

  const handleRegister = async (tournament) => {
    const authUser = await ensureAuthReady(supabase);
    if (!authUser) {
      router.push('/auth/login?redirect=/hub/commander/tournaments');
      return;
    }
    const token = getAccessToken();

    try {
      const res = await fetch(`/api/commander/tournaments/${tournament.id}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      // The entries API returns {success, data:{entry, is_alternate?,
      // seat_assignment?, message}}; keep the legacy top-level {entry} fallback.
      const entry = data.data?.entry || data.entry || null;
      if (data.success !== false && entry) {
        const isAlternate = Boolean(data.data?.is_alternate || entry.status === 'alternate');
        const seat = data.data?.seat_assignment || null;
        setMyRegistrations(prev => (prev.includes(tournament.id) ? prev : [...prev, tournament.id]));
        setMyAlternates(prev => {
          if (isAlternate) return prev.includes(tournament.id) ? prev : [...prev, tournament.id];
          return prev.filter(tid => tid !== tournament.id);
        });
        // Surface the API's own explanation (alternates list, or the table and
        // seat it drew) rather than a generic success line.
        const apiMessage = data.data?.message;
        const fallback = isAlternate
          ? `${tournament.name}: Field Is Full. You Are On The Alternates List And Will Be Seated As Seats Open.`
          : seat
            ? `Registered For ${tournament.name}. Table ${seat.table_number}, Seat ${seat.seat_number}.`
            : `Successfully Registered For ${tournament.name}`;
        setMessage({
          type: isAlternate ? 'info' : 'success',
          text: apiMessage ? `${tournament.name}: ${apiMessage}` : fallback
        });
        setTimeout(() => setMessage(null), 6000);
        refreshTournaments();
      } else {
        const errText = typeof data.error === 'string' ? data.error : data.error?.message;
        setMessage({ type: 'error', text: errText || 'Registration Failed' });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (err) {
      console.warn('Register error:', err);
      setMessage({ type: 'error', text: 'Registration Failed' });
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const filteredTournaments = tournaments.filter(t => {
    if (filter === 'upcoming') return t.status === 'registering';
    if (filter === 'live') return t.status === 'running';
    if (filter === 'registered') return myRegistrations.includes(t.id);
    return true;
  });

  // Realtime listener - live updates for tournaments/index.js
  useEffect(() => {
    const ch = supabase
      .channel(`my-tournaments-list`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_tournament_entries' }, () => { refreshTournaments(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commander_tournaments' }, () => { refreshTournaments(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refreshTournaments]);

  return (
    <CommanderPageShell>
    <>
      <SEOHead
                title="Tournaments"
                description="Smarter.Poker - The Future Of The Game."
                noindex={true}
            />

      <div className="cmd-page">
        {/* Notification Banner */}
        {message && (
          <div className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center font-bold tracking-wide ${
            message.type === 'success'
              ? 'bg-[#10B981]/20 border-b-2 border-[#10B981] text-[#10B981]'
              : message.type === 'info'
                ? 'bg-[#F59E0B]/20 border-b-2 border-[#F59E0B] text-[#F59E0B]'
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
                <p className="text-sm text-[#64748B] font-medium tracking-wide">Find And Register For Poker Tournaments</p>
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
              <h3 className="text-lg font-bold text-white">No Tournaments Found</h3>
              <p className="text-[#64748B] mt-1">
                {filter === 'registered'
                  ? 'You Haven\'t Registered For Any Tournaments Yet'
                  : 'Check Back Later For Upcoming Tournaments'
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
                  isAlternate={myAlternates.includes(tournament.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
    </CommanderPageShell>
  );
}
