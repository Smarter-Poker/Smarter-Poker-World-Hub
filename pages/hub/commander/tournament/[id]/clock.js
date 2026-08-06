/**
 * Public Tournament Clock Display
 * Full-screen display for TV/wall screens
 * UI: Dark industrial sci-fi gaming theme, large fonts
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../../src/components/seo/SEOHead';
import { Users, Trophy, Clock, DollarSign } from 'lucide-react';
import { useCommanderSync } from '../../../../../src/lib/commander/useCommanderSync';
import { supabase } from '../../../../../src/lib/supabase';
import CommanderPageShell from '../../../../../src/components/commander/CommanderPageShell';

export default function TournamentClockDisplay() {
  const router = useRouter();
  const { id } = router.query;

  const [tournament, setTournament] = useState(null);
  const [clock, setClock] = useState(null);
  const [clockState, setClockState] = useState({
    currentLevel: 1,
    secondsRemaining: 0,
    isRunning: false,
    isOnBreak: false
  });
  const [loading, setLoading] = useState(true);

  // Fetch tournament data.
  // Static fields (buy-in, prize pool, chips) come from the plain tournament GET;
  // the live clock (computed time remaining + current/next blinds) comes from the
  // dedicated public /clock endpoint, which derives seconds remaining from the
  // persisted settings.clock_state. Both are public reads.
  const fetchTournament = useCallback(async (signal) => {

  if (!router.isReady) return null;

    if (!id) return;
    try {
      const opts = signal ? { signal } : {};
      const [tRes, cRes] = await Promise.all([
        fetch(`/api/commander/tournaments/${id}`, opts).catch(() => ({ ok: false })),
        fetch(`/api/commander/tournaments/${id}/clock`, opts).catch(() => ({ ok: false }))
      ]);

      if (tRes.ok) {
        const tData = await tRes.json();
        if (tData.success && tData.data?.tournament) {
          setTournament(tData.data.tournament);
        }
      }

      if (cRes.ok) {
        const cData = await cRes.json();
        if (cData.success && cData.data) {
          const c = cData.data;
          setClock(c);
          setClockState({
            currentLevel: c.currentBlind?.level || ((c.tournament?.current_level || 0) + 1),
            secondsRemaining: c.clock?.timeRemaining || 0,
            isRunning: !!c.clock?.isRunning,
            isOnBreak: !!c.currentBlind?.isBreak
          });
          // Merge the live subset (players remaining, entries, avg stack) onto the
          // static tournament record so the footer stats stay current.
          if (c.tournament) setTournament(prev => ({ ...(prev || {}), ...c.tournament }));
        }
      }
    } catch (err) {
      console.warn('Failed to fetch tournament:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const _c = new AbortController();
    fetchTournament(_c.signal);
    const interval = setInterval(() => fetchTournament(_c.signal), 30000); // fallback — real-time sync handles instant updates
    return () => { _c.abort(); clearInterval(interval); };
  }, [fetchTournament]);
  // Realtime listener — live updates for tournament/[id]/clock.js
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`td-clock:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commander_tournaments', filter: `id=eq.${id}` }, () => { fetchTournament(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Commander Data Bus — instant sync when tournament state changes (clock, entries, etc.)
  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });
  useCommanderSync(venueId || '', fetchTournament, { entities: ['tournaments'] });

  // Countdown timer
  useEffect(() => {
    if (!clockState.isRunning || clockState.secondsRemaining <= 0) return;

    const timer = setInterval(() => {
      setClockState(prev => ({
        ...prev,
        secondsRemaining: Math.max(0, prev.secondsRemaining - 1)
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [clockState.isRunning]);

  // Format time as MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Current/next blind levels come from the /clock endpoint (camelCase), mapped
  // to the snake_case shape this display renders.
  const cb = clock?.currentBlind;
  const currentLevel = cb ? { small_blind: cb.smallBlind, big_blind: cb.bigBlind, ante: cb.ante } : null;
  const nb = clock?.nextBlind;
  const nextLevel = nb ? { small_blind: nb.smallBlind, big_blind: nb.bigBlind } : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1426] flex items-center justify-center">
        <Clock className="w-12 h-12 text-white animate-pulse" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-[#0B1426] flex items-center justify-center">
        <p className="text-white text-xl">Tournament Not Found</p>
      </div>
    );
  }

  return (
    // 2026-07-25 audit fix: CommanderPageShell moved here from StatCard, which
    // wrapped every stat tile in its own shell (stacking fixed hamburger menus).
    <CommanderPageShell>
    <>
      <SEOHead
        title="Tournament Clock"
        description="Smarter.Poker — The Future Of The Game."
        noindex={true}
      />

      <div className="min-h-screen bg-[#0B1426] text-white p-8 flex flex-col">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">{tournament.name}</h1>
          <p className="text-xl text-[#64748B] mt-2">
            ${tournament.buyin_amount} + ${tournament.buyin_fee} {tournament.tournament_type?.toUpperCase()}
          </p>
        </header>

        {/* Main Clock */}
        <main className="flex-1 flex flex-col items-center justify-center">
          {clockState.isOnBreak ? (
            <div className="text-center">
              <p className="text-3xl text-[#F59E0B] font-semibold mb-4">BREAK</p>
              <div className="text-[12rem] font-bold leading-none text-[#F59E0B]">
                {formatTime(clockState.secondsRemaining)}
              </div>
            </div>
          ) : (
            <>
              {/* Level Number */}
              <p className="text-3xl text-[#64748B] mb-2">
                LEVEL {clockState.currentLevel}
              </p>

              {/* Time Remaining */}
              <div className={`text-[12rem] font-bold leading-none ${clockState.secondsRemaining <= 60 ? 'text-[#EF4444]' :
                  clockState.secondsRemaining <= 300 ? 'text-[#F59E0B]' :
                    'text-white'
                }`}>
                {formatTime(clockState.secondsRemaining)}
              </div>

              {/* Current Blinds */}
              {currentLevel && (
                <div className="mt-8 text-center">
                  <p className="text-5xl font-bold text-[#10B981]">
                    {currentLevel.small_blind?.toLocaleString()} / {currentLevel.big_blind?.toLocaleString()}
                    {currentLevel.ante > 0 && ` / ${currentLevel.ante?.toLocaleString()}`}
                  </p>
                  <p className="text-2xl text-[#64748B] mt-2">BLINDS</p>
                </div>
              )}
            </>
          )}
        </main>

        {/* Footer Stats */}
        <footer className="mt-8">
          <div className="grid grid-cols-4 gap-8 max-w-4xl mx-auto">
            <StatCard
              icon={Users}
              label="Players"
              value={`${tournament.players_remaining || 0} / ${tournament.current_entries || tournament.total_entries || 0}`}
            />
            <StatCard
              icon={DollarSign}
              label="Prize Pool"
              value={`$${(tournament.actual_prizepool || tournament.guaranteed_pool || 0).toLocaleString()}`}
            />
            <StatCard
              icon={Trophy}
              label="Avg Stack"
              value={tournament.players_remaining ?
                Math.round((tournament.current_entries * tournament.starting_chips) / tournament.players_remaining).toLocaleString() :
                tournament.starting_chips?.toLocaleString() || '0'
              }
            />
            <StatCard
              icon={Clock}
              label="Next Level"
              value={nextLevel ?
                `${nextLevel.small_blind?.toLocaleString()}/${nextLevel.big_blind?.toLocaleString()}` :
                'Final'
              }
            />
          </div>
        </footer>

        {/* Status Indicator */}
        {!clockState.isRunning && (
          <div className="absolute top-4 right-4">
            <span className="px-4 py-2 bg-[#EF4444] text-white font-semibold rounded-lg animate-pulse">
              PAUSED
            </span>
          </div>
        )}
      </div>
    </>
    </CommanderPageShell>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="text-center">
      <Icon className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-sm text-[#64748B] uppercase tracking-wide">{label}</p>
    </div>
  );
}
