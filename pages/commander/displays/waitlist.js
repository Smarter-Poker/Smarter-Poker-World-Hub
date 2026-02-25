/**
 * Waitlist TV Display — Bravo Poker Live Column Layout
 * /commander/displays/waitlist
 * Full-screen display designed for TV via wireless HDMI transmitter
 * No touch/interaction — auto-refreshes every 5 seconds
 * 
 * Layout: game type tabs across top, player names in vertical columns below
 * Matches standard poker room TV board (Bravo Poker Live style)
 * 
 * Setup: Open this URL in a browser on the device connected to HDMI transmitter
 * Auto-hides cursor, prevents screen sleep via wake lock API
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

export default function WaitlistDisplay() {
  const router = useRouter();
  const [tables, setTables] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [now, setNow] = useState(new Date());
  const wakeLockRef = useRef(null);
  const [venueName, setVenueName] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token')
          : null;
        const staffSession = typeof window !== 'undefined'
          ? localStorage.getItem('commander_staff') || '' : '';
        let vid = '';
        try { vid = JSON.parse(staffSession || '{}').venue_id || ''; } catch { }
        const headers = {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-staff-session': staffSession
        };

        // Fetch tables
        let tabData = [];
        try {
          const tabRes = await fetch(`/api/commander/tables?venue_id=${vid}`, { headers });
          const tabJson = await tabRes.json().catch(() => ({}));
          tabData = Array.isArray(tabJson.data) ? tabJson.data : [];
        } catch { /* non-critical */ }

        // Fetch waitlist — try staff endpoint first, fall back to public venue endpoint
        let wlData = [];
        try {
          const wlRes = await fetch(`/api/commander/waitlist?venue_id=${vid}`, { headers });
          // Staff endpoint returns JSON with { success, data: [] }
          const wlJson = await wlRes.json().catch(() => ({}));
          if (Array.isArray(wlJson.data)) {
            wlData = wlJson.data;
          } else if (vid) {
            // Fallback: public venue endpoint — returns { success, data: { waitlists: [...grouped] } }
            // Flatten grouped entries back to individual player records
            const pubRes = await fetch(`/api/commander/waitlist/venue/${vid}`);
            const pubJson = await pubRes.json().catch(() => ({}));
            const grouped = Array.isArray(pubJson.data?.waitlists) ? pubJson.data.waitlists : [];
            // Flatten: each waitlist has a players array
            grouped.forEach(wl => {
              (Array.isArray(wl.players) ? wl.players : []).forEach(p => {
                wlData.push({
                  ...p,
                  game_type: wl.game_type,
                  stakes: wl.stakes,
                });
              });
            });
          }
        } catch { /* non-critical */ }

        setTables(tabData);
        setWaitlists(wlData);
      } catch (err) { console.error(err); }
      setNow(new Date());
    };

    // Get venue name
    try {
      const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      if (staff.venue_name) setVenueName(staff.venue_name);
    } catch { }

    fetchData();
    const poll = setInterval(fetchData, 5000); // 5s refresh for TV display
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
    const handleVisChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      wakeLockRef.current?.release();
    };
  }, []);

  // Auto-fullscreen on click
  const goFullscreen = () => document.documentElement.requestFullscreen?.();

  // Group waitlists by game type + stakes (e.g. "1/2 NLH", "2/5 PLO")
  const waitlistByGame = {};
  waitlists.filter(w => ['waiting', 'called'].includes(w.status)).forEach(w => {
    const key = w.stakes
      ? `${w.stakes} ${(w.game_type || 'NLH').toUpperCase()}`
      : (w.game_type || 'Open').toUpperCase();
    if (!waitlistByGame[key]) waitlistByGame[key] = [];
    waitlistByGame[key].push(w);
  });

  // Sort entries: called first, then by created_at
  Object.values(waitlistByGame).forEach(entries => {
    entries.sort((a, b) => {
      if (a.status === 'called' && b.status !== 'called') return -1;
      if (b.status === 'called' && a.status !== 'called') return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  });

  const gameTypes = Object.keys(waitlistByGame);
  const totalWaiting = waitlists.filter(w => w.status === 'waiting' || w.status === 'called').length;

  // Calculate max names visible per column based on screen
  const maxNamesPerColumn = 20;

  // Table stats
  const activeTableCount = tables.filter(t => t.is_active !== false).length;

  return (
    <>
      <style>{`
        @keyframes pulse-called {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .tv-called { animation: pulse-called 1.2s ease-in-out infinite; }
        body, html { overflow: hidden; cursor: none; }
      `}</style>

      <div onClick={goFullscreen}
        className="h-screen w-screen bg-[#0A1628] text-white font-['Inter'] select-none overflow-hidden flex flex-col">

        {/* ========== TOP HEADER BAR — Blue stripe ========== */}
        <div style={{
          background: 'linear-gradient(135deg, #0052CC 0%, #1877F2 50%, #0052CC 100%)',
          borderBottom: '3px solid #FFD700'
        }} className="px-6 py-3 flex items-center justify-between shrink-0">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-[0.12em] text-white uppercase">
            {venueName ? `${venueName} Waiting List` : 'Club Commander Waiting List'}
          </h1>

          <div className="text-right">
            <p className="text-2xl font-mono font-bold tabular-nums text-white">
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
            <p className="text-xs text-white/60 uppercase tracking-wider">
              {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* ========== GAME COLUMN TABS — Yellow/green tab headers ========== */}
        {gameTypes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-5xl font-bold text-white/20 mb-3">NO WAIT</p>
              <p className="text-2xl text-white/10">SEATS AVAILABLE — SEE THE FRONT DESK</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {gameTypes.map((game, colIdx) => {
              const entries = waitlistByGame[game];
              // Alternate tab colors like Bravo
              const tabColors = [
                'linear-gradient(180deg, #FFD700 0%, #E6B800 100%)',  // Gold
                'linear-gradient(180deg, #4CAF50 0%, #388E3C 100%)',  // Green
                'linear-gradient(180deg, #2196F3 0%, #1565C0 100%)',  // Blue
                'linear-gradient(180deg, #FF9800 0%, #E65100 100%)',  // Orange
                'linear-gradient(180deg, #9C27B0 0%, #6A1B9A 100%)',  // Purple
                'linear-gradient(180deg, #F44336 0%, #C62828 100%)',  // Red
                'linear-gradient(180deg, #00BCD4 0%, #00838F 100%)',  // Teal
              ];
              const tabBg = tabColors[colIdx % tabColors.length];

              return (
                <div key={game}
                  className="flex-1 flex flex-col border-r border-white/10 last:border-r-0"
                  style={{ minWidth: 0 }}>

                  {/* Tab Header */}
                  <div className="shrink-0 py-2.5 px-3 text-center"
                    style={{ background: tabBg }}>
                    <h2 className="text-lg md:text-xl font-extrabold text-white uppercase tracking-wider truncate"
                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                      {game}
                    </h2>
                  </div>

                  {/* Player Names Column */}
                  <div className="flex-1 overflow-hidden px-2 py-2">
                    {entries.slice(0, maxNamesPerColumn).map((entry, idx) => (
                      <div key={entry.id}
                        className={`py-1.5 px-2 text-center truncate ${entry.status === 'called' ? 'tv-called text-[#FFD700] font-bold' : 'text-white'
                          }`}
                        style={{
                          fontSize: entries.length > 12 ? '14px' : entries.length > 8 ? '16px' : '18px',
                          fontWeight: 600,
                          letterSpacing: '0.02em',
                          borderBottom: '1px solid rgba(255,255,255,0.05)'
                        }}>
                        {entry.player_name?.toUpperCase() || `PLAYER ${idx + 1}`}
                      </div>
                    ))}
                    {entries.length > maxNamesPerColumn && (
                      <div className="text-center text-white/30 text-sm py-1">
                        +{entries.length - maxNamesPerColumn} more
                      </div>
                    )}
                  </div>

                  {/* Total Count Footer */}
                  <div className="shrink-0 py-2 text-center border-t border-white/10"
                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <span className="text-sm font-bold text-white/60 uppercase tracking-wider">
                      Total Count: {entries.length}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========== BOTTOM TICKER BAR ========== */}
        <div className="shrink-0 px-6 py-2 flex items-center justify-between"
          style={{
            background: 'linear-gradient(135deg, #0052CC 0%, #1877F2 50%, #0052CC 100%)',
            borderTop: '2px solid #FFD700'
          }}>
          <span className="text-sm font-medium text-white/70">
            {activeTableCount} {activeTableCount === 1 ? 'Table' : 'Tables'} Running — {totalWaiting} {totalWaiting === 1 ? 'Player' : 'Players'} Waiting
          </span>
          <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
            Powered by Club Commander
          </span>
          <span className="text-sm font-medium text-white/70">
            Ask the front desk or scan QR code to join the waitlist
          </span>
        </div>
      </div>
    </>
  );
}
