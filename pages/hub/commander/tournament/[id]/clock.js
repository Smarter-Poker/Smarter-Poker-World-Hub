/**
 * Public Tournament Clock Display
 * Full-screen display for TV/wall screens
 * UI: Dark industrial sci-fi gaming theme, large fonts
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Users, Trophy, Clock, DollarSign } from 'lucide-react';

export default function TournamentClockDisplay() {
  const router = useRouter();
  const { id } = router.query;

  const [tournament, setTournament] = useState(null);
  const [clockState, setClockState] = useState({
    currentLevel: 1,
    secondsRemaining: 0,
    isRunning: false,
    isOnBreak: false
  });
  const [loading, setLoading] = useState(true);

  // Fetch tournament data
  const fetchTournament = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/commander/tournaments/${id}`);
      const data = await res.json();
      if (data.success) {
        setTournament(data.data.tournament);
        if (data.data.tournament.clock_state) {
          setClockState(data.data.tournament.clock_state);
        }
      }
    } catch (err) {
      console.error('Failed to fetch tournament:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTournament();
    const interval = setInterval(fetchTournament, 5000);
    return () => clearInterval(interval);
  }, [fetchTournament]);

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

  // Get current blind level
  function getCurrentLevel() {
    if (!tournament?.blind_structure) return null;
    return tournament.blind_structure[clockState.currentLevel - 1] || null;
  }

  // Get next level
  function getNextLevel() {
    if (!tournament?.blind_structure) return null;
    return tournament.blind_structure[clockState.currentLevel] || null;
  }

  const currentLevel = getCurrentLevel();
  const nextLevel = getNextLevel();

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
        <p className="text-white text-xl">Tournament not found</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{tournament.name} | Tournament Clock</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

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
              <div className={`text-[12rem] font-bold leading-none ${
                clockState.secondsRemaining <= 60 ? 'text-[#EF4444]' :
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
              value={`${tournament.players_remaining || 0} / ${tournament.current_entries || 0}`}
            />
            <StatCard
              icon={DollarSign}
              label="Prize Pool"
              value={`$${(tournament.guaranteed_pool || 0).toLocaleString()}`}
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
