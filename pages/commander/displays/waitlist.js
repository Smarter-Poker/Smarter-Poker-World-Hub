/**
 * Waitlist TV Display
 * /commander/displays/waitlist
 * Full-screen display designed for TV via wireless HDMI transmitter
 * No touch/interaction — auto-refreshes every 5 seconds
 * Shows: active games with open seats, waitlist by game type, player names + position
 * Large text readable from across the poker room
 * 
 * Setup: Open this URL in a browser on the device connected to HDMI transmitter
 * Auto-hides cursor, prevents screen sleep via wake lock API
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

function formatTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function WaitlistDisplay() {
  const router = useRouter();
  const { venue } = router.query;
  const [tables, setTables] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [now, setNow] = useState(new Date());
  const wakeLockRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tabRes, wlRes] = await Promise.all([
          fetch('/api/commander/tables'),
          fetch('/api/commander/waitlist')
        ]);
        const tabJson = await tabRes.json();
        const wlJson = await wlRes.json();
        if (tabJson.success) setTables(tabJson.data || []);
        if (wlJson.success) setWaitlists(wlJson.data || []);
      } catch (err) { console.error(err); }
      setNow(new Date());
    };

    fetchData();
    const poll = setInterval(fetchData, 5000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  // Request wake lock to prevent screen sleep
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

  // Auto-fullscreen on click
  const goFullscreen = () => document.documentElement.requestFullscreen?.();

  // Group waitlists by game type
  const waitlistByGame = {};
  waitlists.filter(w => ['waiting', 'called'].includes(w.status)).forEach(w => {
    const key = w.game_type || 'Open';
    if (!waitlistByGame[key]) waitlistByGame[key] = [];
    waitlistByGame[key].push(w);
  });

  // Active tables with open seats grouped by game
  const tablesByGame = {};
  tables.filter(t => t.is_active !== false).forEach(t => {
    const key = t.game_type || 'Open';
    if (!tablesByGame[key]) tablesByGame[key] = { tables: 0, seated: 0, open: 0 };
    tablesByGame[key].tables++;
    const seated = (t.seats || []).filter(s => s.status === 'occupied').length;
    tablesByGame[key].seated += seated;
    tablesByGame[key].open += (t.max_seats || 9) - seated;
  });

  const gameTypes = [...new Set([...Object.keys(waitlistByGame), ...Object.keys(tablesByGame)])].sort();

  return (
    <>
      <Head>
        <title>Waitlist Display</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style jsx global>{`
        * { cursor: none !important; }
        body { overflow: hidden; }
        @keyframes pulse-called { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .called-pulse { animation: pulse-called 1.5s ease-in-out infinite; }
      `}</style>

      <div onClick={goFullscreen}
        className="min-h-screen bg-black text-white font-['Inter'] select-none overflow-hidden">

        {/* Header Bar */}
        <div className="bg-[#1877F2] px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-wide">WAITLIST</h1>
          </div>
          <div className="text-right">
            <p className="text-4xl font-mono font-bold tabular-nums">
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-sm opacity-80">
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex h-[calc(100vh-80px)]">

          {/* LEFT: Game Status */}
          <div className="w-1/3 border-r border-white/10 p-6">
            <h2 className="text-lg text-white/50 uppercase tracking-[0.2em] mb-4">Games Running</h2>
            <div className="space-y-4">
              {gameTypes.map(game => {
                const info = tablesByGame[game] || { tables: 0, seated: 0, open: 0 };
                return (
                  <div key={game} className="bg-white/5 rounded-2xl p-5">
                    <h3 className="text-2xl font-bold text-white mb-2">{game}</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-3xl font-bold text-[#1877F2]">{info.tables}</p>
                        <p className="text-xs text-white/40 uppercase">Tables</p>
                      </div>
                      <div>
                        <p className="text-3xl font-bold text-white">{info.seated}</p>
                        <p className="text-xs text-white/40 uppercase">Playing</p>
                      </div>
                      <div>
                        <p className={`text-3xl font-bold ${info.open > 0 ? 'text-[#31A24C]' : 'text-white/30'}`}>
                          {info.open}
                        </p>
                        <p className="text-xs text-white/40 uppercase">Open</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {gameTypes.length === 0 && (
                <p className="text-xl text-white/30 text-center py-8">No games running</p>
              )}
            </div>
          </div>

          {/* RIGHT: Waitlist Names */}
          <div className="flex-1 p-6 overflow-hidden">
            <h2 className="text-lg text-white/50 uppercase tracking-[0.2em] mb-4">Waiting Players</h2>

            {gameTypes.length === 0 || Object.keys(waitlistByGame).length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-4xl text-white/20 font-bold mb-2">No Wait</p>
                  <p className="text-xl text-white/10">Seats available — see the front desk</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6 h-full overflow-hidden">
                {Object.entries(waitlistByGame).map(([gameType, entries]) => (
                  <div key={gameType} className="overflow-hidden">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xl font-bold text-white">{gameType}</h3>
                      <span className="px-3 py-1 rounded-full bg-[#1877F2]/20 text-[#1877F2] text-sm font-bold">
                        {entries.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {entries.slice(0, 15).map((entry, idx) => (
                        <div key={entry.id}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                            entry.status === 'called'
                              ? 'bg-[#31A24C]/20 border-2 border-[#31A24C]/50 called-pulse'
                              : 'bg-white/5'
                          }`}>
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold ${
                            entry.status === 'called'
                              ? 'bg-[#31A24C] text-white'
                              : 'bg-white/10 text-white/60'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className={`text-xl font-medium ${
                            entry.status === 'called' ? 'text-[#31A24C]' : 'text-white'
                          }`}>
                            {entry.player_name}
                          </span>
                          {entry.status === 'called' && (
                            <span className="ml-auto text-sm font-bold text-[#31A24C] uppercase tracking-wider">
                              SEAT OPEN
                            </span>
                          )}
                        </div>
                      ))}
                      {entries.length > 15 && (
                        <p className="text-center text-white/30 text-sm py-2">
                          +{entries.length - 15} more
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom ticker */}
        <div className="fixed bottom-0 left-0 right-0 bg-[#1877F2]/10 border-t border-[#1877F2]/20 px-8 py-2">
          <p className="text-sm text-[#1877F2]/60 text-center">
            Ask the front desk to be added to the waitlist — Text or call notifications available
          </p>
        </div>
      </div>
    </>
  );
}
