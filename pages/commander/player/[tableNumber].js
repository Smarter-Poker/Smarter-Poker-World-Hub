/**
 * Player Table Display
 * /commander/player/[tableNumber]
 * 
 * Player-facing screen mounted at the table or on a small tablet.
 * Shows ALL seated players at this table with their live countdown timers.
 * Players can see their own time + everyone else's time.
 * 
 * No authentication required - read-only display.
 * Auto-refreshes every 3 seconds, timers tick locally every second.
 * 
 * Color coding:
 *   Green  = plenty of time (> 15 min)
 *   Yellow = running low (< 15 min)
 *   Red    = critical (< 5 min)
 *   Red pulse = expired (0:00)
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined) return '--:--';
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getSeatPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    positions.push({ x: 50 + Math.cos(angle) * 42, y: 50 + Math.sin(angle) * 38, seat: i + 1 });
  }
  return positions;
}

function getTimeColor(seconds) {
  if (seconds === null || seconds === undefined) return '#3A3B3C';
  if (seconds <= 0) return '#EF4444';
  if (seconds <= 300) return '#EF4444';
  if (seconds <= 900) return '#F59E0B';
  return '#31A24C';
}

export default function PlayerTableDisplay() {
  const router = useRouter();
  const { tableNumber } = router.query;
  const [players, setPlayers] = useState([]);
  const [table, setTable] = useState(null);
  const [now, setNow] = useState(new Date());
  const wakeLockRef = useRef(null);

  // Fetch sessions
  useEffect(() => {
    if (!tableNumber) return;
    const fetchData = async () => {
      try {
        const [sessionsRes, tableRes] = await Promise.all([
          fetch(`/api/commander/dealer/sessions?table=${tableNumber}`),
          fetch(`/api/commander/tables/${tableNumber}`)
        ]);
        const sessionsJson = await sessionsRes.json();
        const tableJson = await tableRes.json();
        if (sessionsJson.success) setPlayers(sessionsJson.data || []);
        if (tableJson.success) setTable(tableJson.data);
      } catch (err) { console.error(err); }
    };
    fetchData();
    const poll = setInterval(fetchData, 3000);
    return () => clearInterval(poll);
  }, [tableNumber]);

  // Local countdown ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setPlayers(prev => prev.map(p => ({
        ...p,
        time_remaining: p.time_remaining !== null && p.time_remaining !== undefined
          ? Math.max(0, p.time_remaining - 1) : null
      })));
      setNow(new Date());
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Wake lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) {}
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const goFullscreen = () => document.documentElement.requestFullscreen?.();
  const maxSeats = table?.max_seats || 9;
  const seatPositions = getSeatPositions(maxSeats);

  return (
    <>
      <Head>
        <title>Table {tableNumber} | Player View</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style jsx global>{`
        body { overflow: hidden; }
        @keyframes pulse-expired { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .expired-pulse { animation: pulse-expired 1s ease-in-out infinite; }
        @keyframes ring-pulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.4); opacity: 0; } }
      `}</style>

      <div onClick={goFullscreen}
        className="h-screen bg-[#0A0A0A] text-white font-['Inter'] select-none overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-[#1877F2] px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Table {tableNumber}</h1>
            <span className="text-sm opacity-80">
              {table?.game_type || 'NLH'} {table?.stakes || ''} — {players.length}/{maxSeats}
            </span>
          </div>
          <p className="text-2xl font-mono font-bold tabular-nums">
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        {/* Main: Seat Map with Large Timers */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="relative w-full max-w-2xl" style={{ aspectRatio: '16/10' }}>

            {/* Table felt */}
            <div className="absolute inset-[10%] rounded-[50%] bg-[#1a3a1a]/30 border-2 border-[#2a5a2a]/40" />

            {/* Center label */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-sm text-white/20 uppercase tracking-[0.3em]">T{tableNumber}</p>
            </div>

            {/* Seat positions */}
            {seatPositions.map(pos => {
              const player = players.find(p => p.seat_number === pos.seat);
              const t = player?.time_remaining;
              const color = getTimeColor(t);
              const isExpired = t !== null && t !== undefined && t <= 0;
              const isCritical = t !== null && t !== undefined && t <= 300 && t > 0;

              return (
                <div key={pos.seat} className="absolute flex flex-col items-center"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}>

                  {!player ? (
                    /* Empty seat */
                    <div className="w-16 h-16 rounded-full bg-white/3 border border-white/8 flex items-center justify-center">
                      <span className="text-sm text-white/15">{pos.seat}</span>
                    </div>
                  ) : (
                    /* Occupied seat with timer */
                    <>
                      <div className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 ${isExpired ? 'expired-pulse' : ''}`}
                        style={{ backgroundColor: `${color}15`, borderColor: `${color}60` }}>
                        
                        {/* Timer */}
                        <span className="text-base font-mono font-bold" style={{ color }}>
                          {isExpired ? 'OUT' : formatCountdown(t)}
                        </span>

                        {/* Critical ring animation */}
                        {isCritical && (
                          <div className="absolute inset-0 rounded-full border-2 opacity-0"
                            style={{ borderColor: color, animation: 'ring-pulse 1.5s ease-out infinite' }} />
                        )}
                      </div>

                      {/* Player name */}
                      <span className="text-xs text-white/70 mt-1 max-w-[80px] truncate text-center font-medium">
                        {player.player_name}
                      </span>

                      {/* Seat number */}
                      <span className="text-[9px] text-white/30">S{pos.seat}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Player List at bottom */}
        {players.length > 0 && (
          <div className="bg-[#111] border-t border-white/10 px-6 py-3">
            <div className="flex flex-wrap gap-4 justify-center">
              {players
                .sort((a, b) => (a.time_remaining ?? Infinity) - (b.time_remaining ?? Infinity))
                .map(p => {
                  const t = p.time_remaining;
                  const color = getTimeColor(t);
                  const isExpired = t !== null && t !== undefined && t <= 0;
                  return (
                    <div key={p.session_id || p.seat_number}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl ${isExpired ? 'expired-pulse' : ''}`}
                      style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}>
                      <span className="text-xs text-white/50">S{p.seat_number}</span>
                      <span className="text-sm font-medium text-white">{p.player_name?.split(' ')[0]}</span>
                      <span className="text-lg font-mono font-bold" style={{ color }}>
                        {isExpired ? 'EXPIRED' : formatCountdown(t)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Branding */}
        <div className="flex-shrink-0 py-1 text-center">
          <p className="text-white/10 text-[10px] tracking-wider">Powered by Smarter.Poker</p>
        </div>
      </div>
    </>
  );
}
