/**
 * Tournament Clock Display (Standalone)
 * /commander/tournaments/[id]/clock-display
 * Full-screen clock designed for TV/projector output via HDMI or browser cast
 * Auto-refreshes every 2 seconds, no user interaction needed
 * Shows: level, blinds, ante, countdown, players, avg stack, prize pool, messages
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

/**
 * Designed for wireless HDMI transmitter -> TV
 * - Auto-hides cursor
 * - Wake lock prevents screen sleep
 * - Click anywhere for fullscreen
 * - Auto-refreshes every 3 seconds
 * - 180px countdown readable from across the room
 * 
 * Setup: Open this URL in Chrome on the HDMI source device
 * URL: /commander/tournaments/[id]/clock-display
 */

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatChips(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
  return n.toLocaleString();
}

export default function ClockDisplay() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [seconds, setSeconds] = useState(null);
  const timerRef = useRef(null);
  const wakeLockRef = useRef(null);

  // Prevent screen sleep
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) { console.log('Wake lock not available'); }
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLockRef.current?.release(); };
  }, []);

  useEffect(() => {
    if (!id) return;
    const fetchClock = async () => {
      try {
        const res = await fetch(`/api/commander/tournaments/${id}/floor-view`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          const cs = json.data.clock?.clock_state;
          if (cs?.remaining_seconds !== undefined) setSeconds(cs.remaining_seconds);
        }
      } catch (err) { console.error(err); }
    };
    fetchClock();
    const poll = setInterval(fetchClock, 3000);
    return () => clearInterval(poll);
  }, [id]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (data?.clock?.clock_state?.status === 'running' && seconds > 0) {
      timerRef.current = setInterval(() => {
        setSeconds(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [data?.clock?.clock_state?.status, seconds]);

  // Auto fullscreen on click
  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.();
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/50 text-2xl font-['Inter']">Loading tournament clock...</p>
      </div>
    );
  }

  const { tournament, clock, stats, alerts } = data;
  const blinds = clock.current_blinds || {};
  const clockState = clock.clock_state || {};
  const displaySeconds = seconds ?? clockState.remaining_seconds ?? 0;
  const isBreak = alerts.on_break;
  const isH4H = alerts.hand_for_hand;
  const currentMsg = clockState.current_message;
  const showMsg = currentMsg && new Date(currentMsg.expires_at) > new Date();

  return (
    <>
      <Head>
        <title>{tournament.name} | Tournament Clock</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { cursor: none !important; }
          body { overflow: hidden; }
        `}</style>
      </Head>
      <div onClick={goFullscreen}
        className="min-h-screen bg-black text-white font-['Inter'] flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden">

        {/* Tournament Name */}
        <p className="text-white/60 text-lg tracking-[0.15em] uppercase mb-2">
          {tournament.name}
        </p>

        {/* H4H / Break banner */}
        {isH4H && (
          <div className="px-8 py-2 rounded-full bg-[#EF4444]/20 border-2 border-[#EF4444]/50 mb-4 animate-pulse">
            <span className="text-[#EF4444] text-2xl font-bold uppercase tracking-[0.2em]">Hand for Hand</span>
          </div>
        )}
        {isBreak && !isH4H && (
          <div className="px-8 py-2 rounded-full bg-[#F59E0B]/20 border-2 border-[#F59E0B]/50 mb-4">
            <span className="text-[#F59E0B] text-2xl font-bold uppercase tracking-[0.2em]">Break</span>
          </div>
        )}

        {/* Message */}
        {showMsg && (
          <div className="px-8 py-3 rounded-2xl bg-[#1877F2]/10 border border-[#1877F2]/30 mb-6 max-w-2xl">
            <p className="text-[#1877F2] text-xl font-semibold text-center">{currentMsg.text}</p>
          </div>
        )}

        {/* Level */}
        <p className="text-white/50 text-sm uppercase tracking-[0.25em] mb-1">
          Level {(clock.current_level || 0) + 1}
        </p>

        {/* Blinds */}
        <div className="mb-4">
          <span className="text-6xl font-bold">
            {formatChips(blinds.small_blind)}/{formatChips(blinds.big_blind)}
          </span>
          {blinds.ante > 0 && (
            <span className="text-3xl text-white/60 ml-3">
              ante {formatChips(blinds.ante)}
            </span>
          )}
        </div>

        {/* Countdown */}
        <p className={`text-[180px] leading-none font-mono font-bold tabular-nums ${
          displaySeconds <= 60 ? 'text-[#EF4444]' :
          displaySeconds <= 120 ? 'text-[#F59E0B]' : 'text-white'
        }`}>
          {formatTime(displaySeconds)}
        </p>

        {/* Next level */}
        {clock.next_blinds && (
          <p className="text-white/40 text-lg mt-2 mb-8">
            Next: {formatChips(clock.next_blinds.small_blind)}/{formatChips(clock.next_blinds.big_blind)}
            {clock.next_blinds.ante > 0 && ` (ante ${formatChips(clock.next_blinds.ante)})`}
          </p>
        )}

        {/* Stats bar */}
        <div className="flex items-center gap-8 text-white/50 text-base">
          <span>Players: <strong className="text-white">{stats.players_remaining}</strong></span>
          <span>Entries: <strong className="text-white">{stats.total_entries}</strong></span>
          <span>Avg: <strong className="text-white">{formatChips(stats.average_stack)}</strong></span>
          <span>Prize Pool: <strong className="text-white">${(stats.prize_pool || 0).toLocaleString()}</strong></span>
          {stats.total_rebuys > 0 && <span>Rebuys: <strong className="text-white">{stats.total_rebuys}</strong></span>}
        </div>

        {/* Powered by branding */}
        <div className="absolute bottom-4 right-6">
          <p className="text-white/15 text-xs tracking-wider">Powered by Smarter.Poker</p>
        </div>
      </div>
    </>
  );
}
